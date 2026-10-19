const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'ieltsWritingLab.v2.progress';
const CATEGORY_ORDER = ['教育','科技','社会','政府','媒体','国际','犯罪','文化','旅游','环境','健康','工作'];
const TYPE_ORDER = ['万能论证短句','观点类','积极结果','消极结果','原因分析'];
const TYPE_LABELS = {'万能论证短句':'完整论证句','观点类':'观点与措施','积极结果':'积极结果','消极结果':'消极结果','原因分析':'原因分析'};
const INTERVAL_DAYS = [0.25,1,3,7,14,30];
const SESSION_LIMITS = [5,10,15,20,30];
let entries = [];
let state = { progress:{}, settings:{dailyGoal:10}, dailyStats:{} };
let mode = 'idle';
let queue = [];
let cursor = 0;
let revealed = false;
let checked = false;
let typedCorrect = false;
let libraryPage = 0;
let selectedCategory = 'all';
let selectedType = 'all';
let searchText = '';
let againAdded = new Set();

function safeReadState(){
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if(saved && typeof saved === 'object') state = {...state, ...saved, progress:saved.progress || {}, settings:{...state.settings,...(saved.settings||{})},dailyStats:saved.dailyStats||{}};
  } catch(e) { console.warn('Learning data could not be loaded.',e); }
  const today = dateKey();
  if(!state.dailyStats[today]) state.dailyStats[today] = {doneIds:[],ratings:0};
  if(!Array.isArray(state.dailyStats[today].doneIds)) state.dailyStats[today].doneIds=[];
}
function saveState(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(e){console.warn('Could not save learning progress.',e);}}
function dateKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function shuffle(list){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function todayStats(){return state.dailyStats[dateKey()] || {doneIds:[],ratings:0};}
function isDue(e){const p=state.progress[e.id];return !!p && Number(p.dueAt||0) <= Date.now();}
function isMastered(e){const p=state.progress[e.id];return !!p && Number(p.level||0)>=4;}
function getFiltered(){
  const q=searchText.trim().toLowerCase();
  return entries.filter(e=>(selectedCategory==='all'||e.category===selectedCategory)&&(selectedType==='all'||e.type===selectedType)&&(!q||e.en.toLowerCase().includes(q)||e.zh.toLowerCase().includes(q)||e.category.includes(q)))
    .sort((a,b)=>CATEGORY_ORDER.indexOf(a.category)-CATEGORY_ORDER.indexOf(b.category)||TYPE_ORDER.indexOf(a.type)-TYPE_ORDER.indexOf(b.type)||a.id.localeCompare(b.id,undefined,{numeric:true}));
}
function progressFor(e){return state.progress[e.id]||null;}
function categoryEntries(category){return entries.filter(e=>e.category===category);}
function categoryProgress(category){const pool=categoryEntries(category),learned=pool.filter(e=>!!state.progress[e.id]).length,mastered=pool.filter(isMastered).length;return {total:pool.length,learned,mastered,remaining:pool.length-learned,inProgress:learned-mastered};}
function hasLibraryNarrowing(){return selectedCategory!=='all'||selectedType!=='all'||!!searchText.trim();}
function buildTypingQueue(pool,limit){
  const unseen=shuffle(getUnseen(pool));
  const previous=pool.filter(e=>!!state.progress[e.id]).sort((a,b)=>{
    const pa=state.progress[a.id]||{},pb=state.progress[b.id]||{};
    const dueA=Number(pa.dueAt||0)<=Date.now()?0:1,dueB=Number(pb.dueAt||0)<=Date.now()?0:1;
    return dueA-dueB||Number(pa.lastAt||0)-Number(pb.lastAt||0);
  });
  const out=[];let ni=0,ri=0;
  while(out.length<limit&&(ni<unseen.length||ri<previous.length)){
    // Two new items, then one previously studied item: new learning stays active while older material returns regularly.
    for(let n=0;n<2&&ni<unseen.length&&out.length<limit;n++)out.push(unseen[ni++]);
    if(ri<previous.length&&out.length<limit)out.push(previous[ri++]);
    if(ni>=unseen.length&&ri<previous.length){while(out.length<limit&&ri<previous.length)out.push(previous[ri++]);}
    if(ri>=previous.length&&ni<unseen.length){while(out.length<limit&&ni<unseen.length)out.push(unseen[ni++]);}
  }
  return out;
}
function getDue(list=entries){return list.filter(isDue);}
function getUnseen(list=entries){return list.filter(e=>!state.progress[e.id]);}
function fillFilters(){
  const categoryOptions='<option value="all">全部主题</option>'+CATEGORY_ORDER.map(c=>`<option value="${c}">${c}</option>`).join('');
  const typeOptions='<option value="all">全部用途</option>'+TYPE_ORDER.map(t=>`<option value="${t}">${TYPE_LABELS[t]}</option>`).join('');
  $('categoryFilter').innerHTML=categoryOptions;
  $('typeFilter').innerHTML=typeOptions;
  $('libraryCategoryFilter').innerHTML=categoryOptions;
  $('libraryTypeFilter').innerHTML=typeOptions;
  $('dailyGoal').value=String(state.settings.dailyGoal||10);
}
function updateStats(){
  const total=entries.length, reviewed=Object.keys(state.progress).filter(id=>entries.some(e=>e.id===id)).length;
  const due=getDue().length, mastered=entries.filter(isMastered).length, newCount=getUnseen().length;
  const todayCount=todayStats().doneIds.length, goal=Number(state.settings.dailyGoal||10);
  $('todayDone').textContent=todayCount; $('todayGoalLabel').textContent=goal;
  $('dailyProgress').style.width=`${Math.min(100,Math.round(todayCount/goal*100))}%`;
  $('dailyHint').textContent=todayCount>=goal?'今日目标已完成，做得很好。':todayCount===0?'今天还没开始，先学几条。':`再完成 ${Math.max(0,goal-todayCount)} 条，就达成今日目标。`;
  $('dueCount').textContent=due; $('duePill').textContent=due; $('masteredCount').textContent=mastered;
  $('newCount').textContent=newCount; $('overallProgress').textContent=`${Math.round(reviewed/Math.max(1,total)*100)}%`;
  $('reviewedCount').textContent=`${reviewed} 条有记录`;
}
function updateFilterCounts(){const filtered=getFiltered();$('filteredCount').textContent=`当前 ${filtered.length} 条`;if(mode==='browse') renderLibrary();}
function setModeTab(value){document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===value));}
function startSession(nextMode,oneEntry=null){
  mode=nextMode;revealed=false;checked=false;typedCorrect=false;againAdded=new Set();setModeTab(nextMode==='idle'?'learn':nextMode);
  let pool=getFiltered();
  if(oneEntry){queue=[oneEntry];}
  else if(nextMode==='learn') queue=shuffle(getUnseen(pool)).slice(0,Number(state.settings.dailyGoal||10));
  else if(nextMode==='review') queue=shuffle(getDue(pool)).slice(0,Number(state.settings.dailyGoal||10));
  else if(nextMode==='typing') queue=buildTypingQueue(pool,Number(state.settings.dailyGoal||10));
  else {queue=[];}
  cursor=0;
  $('librarySection').classList.toggle('hidden',nextMode!=='browse');
  $('workspaceSection').classList.toggle('browsing',nextMode==='browse');
  $('studyPanel').classList.toggle('hidden',nextMode==='browse');
  if(nextMode==='browse'){renderLibrary();return;}
  if(!queue.length){
    $('idleState').classList.remove('hidden');$('studyCard').classList.add('hidden');$('sessionDone').classList.add('hidden');
    $('idleState').querySelector('h2').textContent=nextMode==='learn'?'这一范围暂时没有新表达。':nextMode==='review'?'目前没有到期的表达。':'当前筛选下没有可练习的表达。';
    $('idleState').querySelector('p:not(.small-cap)').textContent=nextMode==='learn'?'可以切换到“间隔复习”，巩固已经学过的表达；也可以清除筛选，继续扩展学习范围。':nextMode==='review'?'可以先学新表达，或者进入“拼写回忆”随机练习。':'请调整主题、用途或关键词筛选后再试。';
    $('revealBtn').classList.add('hidden');$('ratingArea').classList.add('hidden');$('typingNextArea').classList.add('hidden');$('typingBox').classList.add('hidden');$('clozeBox').classList.add('hidden');$('cardPosition').textContent='没有待练习内容';$('queueProgress').style.width='0%';$('prevBtn').disabled=true;$('nextBtn').disabled=true;updateSessionLabel();return;
  }
  $('idleState').classList.add('hidden');$('sessionDone').classList.add('hidden');$('studyCard').classList.remove('hidden');renderCard();
}
function updateSessionLabel(){
  const labels={learn:'新表达 · 主动回忆',review:'间隔复习 · 到期优先',typing:'拼写回忆 · 新旧交错',browse:'表达总库'};
  $('sessionLabel').textContent=labels[mode]||'主动回忆';
}
function escapeHtml(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function escapeRegExp(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function highlightTarget(sentence, target){if(!target||target.length>180||target.split(/\s+/).length>18)return escapeHtml(sentence);const re=new RegExp(escapeRegExp(target),'ig');return escapeHtml(sentence).replace(new RegExp(escapeRegExp(escapeHtml(target)),'ig'),m=>`<mark>${m}</mark>`);}
function blankOut(sentence,target){if(!target||target.length>180)return sentence;const re=new RegExp(escapeRegExp(target),'i');return sentence.replace(re,'________');}
function renderCard(){
  if(!queue.length||cursor>=queue.length){finishSession();return;}
  const e=queue[cursor]; revealed=false;checked=false;
  $('idleState').classList.add('hidden');$('sessionDone').classList.add('hidden');$('studyCard').classList.remove('hidden');
  $('sessionLabel').textContent=({learn:'新表达 · 主动回忆',review:'间隔复习 · 到期优先',typing:'拼写回忆 · 新旧交错'}[mode]||'单条练习');
  $('cardPosition').textContent=`${String(cursor+1).padStart(2,'0')} / ${String(queue.length).padStart(2,'0')}`;
  $('cardCategory').textContent=e.category; $('cardType').textContent=TYPE_LABELS[e.type]||e.type; $('cardSource').textContent=e.sourceLabel;
  const prior=progressFor(e);$('masteryProgress').textContent=`连续掌握进度：${Math.min(4,Number(prior?.level||0))} / 4 次顺利回忆${isMastered(e)?' · 已掌握':''}`;
  $('promptLabel').textContent=e.type==='万能论证短句'?'中文整句 · 尝试完整回忆英文':'中文提示 · 请回忆英文表达';
  $('promptText').textContent=e.zh;
  $('clozeSentence').textContent=blankOut(e.exampleEn,e.exampleTarget||e.en);
  $('clozeBox').classList.toggle('hidden',mode!=='typing');
  $('typingBox').classList.toggle('hidden',mode!=='typing');
  $('answerInput').value='';$('answerInput').disabled=false;$('checkAnswerBtn').disabled=false;$('typingFeedback').textContent='';$('typingFeedback').className='typing-feedback';
  $('answerText').textContent=e.en;$('answerTranslation').textContent=e.zh;
  $('exampleText').innerHTML=highlightTarget(e.exampleEn,e.exampleTarget||e.en);$('exampleTranslation').textContent=e.exampleZh;
  $('suggestionArea').classList.toggle('hidden',!e.suggestionEn);$('suggestionText').textContent=e.suggestionEn||'';$('suggestionNote').textContent=e.suggestionNote||'';
  $('exampleTag').textContent=e.type==='万能论证短句'?'原资料整句':'补充语境句';
  $('grammarTip').textContent=e.grammarTip;$('roleTag').textContent=e.role;
  $('answerArea').classList.add('hidden');$('ratingArea').classList.add('hidden');$('typingNextArea').classList.add('hidden');$('revealBtn').classList.toggle('hidden',mode==='typing');$('revealBtn').innerHTML='显示答案与例句 <span>↓</span>';
  $('speakBtn').disabled=false;
  $('prevBtn').disabled=cursor===0;$('nextBtn').disabled=cursor>=queue.length-1;
  $('queueProgress').style.width=`${Math.round(cursor/Math.max(queue.length,1)*100)}%`;
  updateSessionLabel();
}
function revealAnswer(){
  revealed=true;
  $('answerArea').classList.remove('hidden');
  $('ratingArea').classList.toggle('hidden',mode==='typing');
  $('revealBtn').classList.add('hidden');
  $('queueProgress').style.width=`${Math.round((cursor+1)/Math.max(queue.length,1)*100)}%`;
}
function normalizeAnswer(s){return String(s||'').toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9'\s-]/g,' ').replace(/\s+/g,' ').trim();}
function checkTypedAnswer(){
  const e=queue[cursor];if(!e)return;
  const input=normalizeAnswer($('answerInput').value);
  const targets=[e.en,e.suggestionEn].filter(Boolean).map(normalizeAnswer);
  if(!input){$('typingFeedback').textContent='先试着写一遍，再核对答案。';return;}
  checked=true;typedCorrect=targets.includes(input);$('answerInput').disabled=true;$('checkAnswerBtn').disabled=true;revealAnswer();
  const prior=progressFor(e),round=Math.min(4,Number(prior?.level||0));
  if(typedCorrect){
    $('typingFeedback').textContent='✓ 拼写与表达匹配。核对例句后，点击下方按钮记录一次顺利回忆。';
    $('typingFeedback').className='typing-feedback correct';
    $('typingRoundNote').textContent=`本次判定正确：连续顺利回忆将达到 ${Math.min(4,round+1)} / 4 次；需要多轮回忆，才会标记为掌握。`;
  }else{
    $('typingFeedback').textContent='这次还不完全匹配。请对照答案，留意固定搭配、词形和拼写，再记录本次结果。';
    $('typingFeedback').className='typing-feedback incorrect';
    $('typingRoundNote').textContent='本次判定未通过：系统会把这条表达重新安排到本轮后面，并重置连续掌握进度。';
  }
  $('typingNextArea').classList.remove('hidden');
  $('typingNextBtn').textContent=typedCorrect?'记录一次正确回忆，下一条 →':'记录结果并稍后重练 →';
}
function rateCurrent(rating){
  const e=queue[cursor];if(!e)return;
  if(mode==='typing'&&!checked)return;
  if(!revealed&&mode!=='typing'){revealAnswer();return;}
  const now=Date.now(),old=state.progress[e.id]||{level:0,reviews:0};let level=Number(old.level||0),dueAt;
  if(rating==='again'){level=0;dueAt=now+10*60*1000;}
  else if(rating==='hard'){level=Math.max(0,level);const days=level===0?1:Math.min(7,INTERVAL_DAYS[Math.max(0,level-1)]);dueAt=now+days*86400000;}
  else{level=Math.min(5,level+1);dueAt=now+INTERVAL_DAYS[level]*86400000;}
  const firstAt=old.firstAt||now;
  state.progress[e.id]={level,dueAt,lastAt:now,firstAt,reviews:Number(old.reviews||0)+1,lastRating:rating,correctRounds:level};
  const ds=todayStats();if(!ds.doneIds.includes(e.id))ds.doneIds.push(e.id);ds.ratings=Number(ds.ratings||0)+1;state.dailyStats[dateKey()]=ds;saveState();
  if(rating==='again'&&!againAdded.has(e.id)&&!queue.slice(cursor+1).some(x=>x.id===e.id)){queue.push(e);againAdded.add(e.id);}
  updateStats();
  revealed=false;checked=false;typedCorrect=false;
  if(cursor<queue.length-1){cursor++;renderCard();}else finishSession();
}
function finishSession(){
  $('studyCard').classList.add('hidden');$('idleState').classList.add('hidden');$('sessionDone').classList.remove('hidden');$('cardPosition').textContent='本轮完成';$('prevBtn').disabled=true;$('nextBtn').disabled=true;$('queueProgress').style.width='100%';
  const n=queue.length;const learned=todayStats().doneIds.length; $('doneSummary').textContent=`本轮完成 ${n} 条练习。今天已经完成 ${learned} 条不同表达；再回忆几次，才能真正稳固下来。`;
  $('doneReviewBtn').textContent=getDue().length?`复习到期表达（${getDue().length}）→`:'查看复习计划 →';updateSessionLabel();updateStats();
}
function moveBy(delta){if(!queue.length)return;cursor=Math.max(0,Math.min(queue.length-1,cursor+delta));renderCard();}
function startSingle(e){startSession('learn',e);$('studyPanel').scrollIntoView({behavior:'smooth',block:'start'});}
function renderCategoryGrid(){
  $('categoryGrid').innerHTML=CATEGORY_ORDER.map((category,index)=>{
    const p=categoryProgress(category),samples=categoryEntries(category).slice(0,2);
    const pct=p.total?Math.round(p.learned/p.total*100):0;
    return `<article class="topic-card ${selectedCategory===category?'selected':''}" data-topic="${escapeHtml(category)}" role="button" tabindex="0" aria-label="进入${escapeHtml(category)}主题，共${p.total}条表达">
      <div class="topic-card-top"><h3>${escapeHtml(category)}类</h3><span class="topic-index">TOPIC ${String(index+1).padStart(2,'0')}</span></div>
      <div class="topic-count"><strong>${p.total}</strong><span>条观点表达</span></div>
      <div class="topic-meter"><span style="width:${pct}%"></span></div>
      <div class="topic-stats"><span>待学习 <b>${p.remaining}</b></span><span>学习中 <b>${p.inProgress}</b></span><span>已掌握 <b>${p.mastered}</b></span></div>
      <div class="topic-preview">${samples.map(e=>`<p>${escapeHtml(e.zh)}</p>`).join('')}</div>
      <div class="topic-open"><span>进入${escapeHtml(category)}分区</span><span>→</span></div>
    </article>`;
  }).join('');
  $('categoryGrid').querySelectorAll('[data-topic]').forEach(card=>{
    const open=()=>{setFilterCategory(card.dataset.topic);renderLibrary();};
    card.addEventListener('click',open);
    card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
  });
}
function renderLibrary(){
  renderCategoryGrid();
  const pool=getFiltered(),pageSize=30;
  const overview=!hasLibraryNarrowing();
  $('categoryGrid').classList.toggle('hidden',!overview);
  $('libraryCount').textContent=overview?entries.length:pool.length;
  $('libraryList').classList.toggle('hidden',overview||pool.length===0);
  $('libraryEmpty').classList.toggle('hidden',overview||pool.length>0);
  $('libraryPagination').classList.toggle('hidden',overview||pool.length===0);
  $('libraryResultsHead').classList.toggle('hidden',overview);
  if(!overview){
    let heading=selectedCategory!=='all'?`${selectedCategory}类观点表达`:selectedType!=='all'?TYPE_LABELS[selectedType]:'搜索结果';
    let note=`当前筛选 ${pool.length} 条`;
    if(selectedCategory!=='all'){
      const prog=categoryProgress(selectedCategory);
      note=`本主题共 ${prog.total} 条 · 已学习 ${prog.learned} 条 · 已掌握 ${prog.mastered} 条`;
    }
    $('libraryResultsTitle').textContent=heading;
    $('libraryResultsNote').textContent=note;
    if(selectedCategory!=='all'){
      $('typeBreakdown').classList.remove('hidden');
      $('typeBreakdown').innerHTML=TYPE_ORDER.map(type=>{
        const subset=categoryEntries(selectedCategory).filter(e=>e.type===type);
        const learned=subset.filter(e=>!!state.progress[e.id]).length;
        const mastered=subset.filter(isMastered).length;
        return `<button type="button" data-subtype="${escapeHtml(type)}" class="${selectedType===type?'selected':''}"><span>${escapeHtml(TYPE_LABELS[type]||type)}</span><strong>${subset.length} 条</strong><small>待学 ${subset.length-learned} · 已掌握 ${mastered}</small></button>`;
      }).join('');
      $('typeBreakdown').querySelectorAll('[data-subtype]').forEach(button=>button.addEventListener('click',()=>setFilterType(selectedType===button.dataset.subtype?'all':button.dataset.subtype)));
    }else{
      $('typeBreakdown').classList.add('hidden');$('typeBreakdown').innerHTML='';
    }
    libraryPage=Math.max(0,Math.min(libraryPage,Math.max(0,Math.ceil(pool.length/pageSize)-1)));
    const page=pool.slice(libraryPage*pageSize,(libraryPage+1)*pageSize);
    $('libraryPageLabel').textContent=pool.length?`显示第 ${libraryPage*pageSize+1}–${Math.min((libraryPage+1)*pageSize,pool.length)} 条`:'没有匹配的表达';
    $('libraryPrev').disabled=libraryPage===0;$('libraryNext').disabled=(libraryPage+1)*pageSize>=pool.length;
    $('libraryList').innerHTML=page.map(e=>{
      const pr=progressFor(e),level=Math.min(4,Number(pr?.level||0));
      return `<article class="library-item"><div><div class="lib-meta"><span>${escapeHtml(e.category)}</span><span>${escapeHtml(TYPE_LABELS[e.type]||e.type)}</span>${pr?`<span>${isMastered(e)?'已掌握':`回忆 ${level}/4`}</span>`:`<span>待学习</span>`}</div><p class="lib-zh">${escapeHtml(e.zh)}</p><p class="lib-en">${escapeHtml(e.en)}</p></div><button data-study-id="${escapeHtml(e.id)}">练这一条 →</button></article>`;
    }).join('');
    $('libraryList').querySelectorAll('[data-study-id]').forEach(b=>b.addEventListener('click',()=>{const e=entries.find(x=>x.id===b.dataset.studyId);if(e)startSingle(e);}));
  }else{
    $('libraryList').innerHTML='';libraryPage=0;$('typeBreakdown').classList.add('hidden');$('typeBreakdown').innerHTML='';
  }
}

function setFilterCategory(v){selectedCategory=v;$('categoryFilter').value=v;$('libraryCategoryFilter').value=v;libraryPage=0;updateFilterCounts();}
function setFilterType(v){selectedType=v;$('typeFilter').value=v;$('libraryTypeFilter').value=v;document.querySelectorAll('.quick-filter').forEach(b=>b.classList.toggle('selected',b.dataset.type===v));libraryPage=0;updateFilterCounts();}
function resetFilters(){selectedCategory='all';selectedType='all';searchText='';$('categoryFilter').value='all';$('libraryCategoryFilter').value='all';$('typeFilter').value='all';$('libraryTypeFilter').value='all';$('searchInput').value='';$('librarySearchInput').value='';libraryPage=0;document.querySelectorAll('.quick-filter').forEach(b=>b.classList.remove('selected'));updateFilterCounts();}

function speakCurrent(){const e=queue[cursor];if(!e||!('speechSynthesis'in window)){alert('当前浏览器没有提供语音朗读功能。');return;}window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(e.suggestionEn||e.en);utterance.lang='en-US';utterance.rate=.88;window.speechSynthesis.speak(utterance);}
function exportProgress(){const payload={app:'IELTS Writing Lab',version:2,exportedAt:new Date().toISOString(),state};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ielts-writing-progress-${dateKey()}.json`;a.click();URL.revokeObjectURL(url);}
function importProgressFile(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);const imported=data.state||data;if(!imported.progress||typeof imported.progress!=='object')throw new Error('Missing progress');const ok=confirm('导入会与当前学习记录合并；同一条表达以导入文件中的记录为准。是否继续？');if(!ok)return;state.progress={...state.progress,...imported.progress};state.dailyStats={...state.dailyStats,...(imported.dailyStats||{})};state.settings={...state.settings,...(imported.settings||{})};saveState();fillFilters();updateStats();if(mode==='browse')renderLibrary();alert('学习记录已导入。');}catch(e){alert('文件无法识别，请选择本网站导出的 JSON 备份。');}};reader.readAsText(file);}

async function init(){
  try{const response=await fetch('words.json');if(!response.ok)throw new Error('words.json could not load');entries=await response.json();}catch(e){$('idleState').querySelector('h2').textContent='词库没有加载成功。';$('idleState').querySelector('p:not(.small-cap)').textContent='请确认 words.json 和 index.html 位于仓库同一目录，并通过 GitHub Pages 或本地静态服务器打开网站。';console.error(e);return;}
  safeReadState();fillFilters();updateStats();updateFilterCounts();
  $('categoryFilter').addEventListener('change',e=>setFilterCategory(e.target.value));
  $('typeFilter').addEventListener('change',e=>setFilterType(e.target.value));
  $('searchInput').addEventListener('input',e=>{searchText=e.target.value;$('librarySearchInput').value=searchText;libraryPage=0;updateFilterCounts();});
  $('libraryCategoryFilter').addEventListener('change',e=>setFilterCategory(e.target.value));
  $('libraryTypeFilter').addEventListener('change',e=>setFilterType(e.target.value));
  $('librarySearchInput').addEventListener('input',e=>{searchText=e.target.value;$('searchInput').value=searchText;libraryPage=0;updateFilterCounts();});
  $('libraryResetBtn').addEventListener('click',resetFilters);
  $('backToTopicsBtn').addEventListener('click',resetFilters);
  $('dailyGoal').addEventListener('change',e=>{state.settings.dailyGoal=Number(e.target.value)||10;saveState();updateStats();});
  $('startLearnBtn').addEventListener('click',()=>startSession('learn'));$('idleLearnBtn').addEventListener('click',()=>startSession('learn'));
  $('startReviewBtn').addEventListener('click',()=>startSession('review'));$('idleReviewBtn').addEventListener('click',()=>startSession('review'));
  $('doneReviewBtn').addEventListener('click',()=>startSession('review'));$('doneNewBtn').addEventListener('click',()=>startSession('learn'));
  document.querySelectorAll('.mode-tab').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.mode==='browse'){startSession('browse');}else startSession(b.dataset.mode);}));
  document.querySelectorAll('.quick-filter').forEach(b=>b.addEventListener('click',()=>{setFilterType(selectedType===b.dataset.type?'all':b.dataset.type);if(mode==='browse')renderLibrary();}));
  $('clearFiltersBtn').addEventListener('click',resetFilters);$('revealBtn').addEventListener('click',revealAnswer);
  document.querySelectorAll('[data-rating]').forEach(b=>b.addEventListener('click',()=>rateCurrent(b.dataset.rating)));
  $('prevBtn').addEventListener('click',()=>moveBy(-1));$('nextBtn').addEventListener('click',()=>moveBy(1));$('speakBtn').addEventListener('click',speakCurrent);
  $('checkAnswerBtn').addEventListener('click',checkTypedAnswer);$('answerInput').addEventListener('keydown',e=>{if(e.key==='Enter')checkTypedAnswer();});$('typingNextBtn').addEventListener('click',()=>{if(checked)rateCurrent(typedCorrect?'known':'again');});
  $('libraryPrev').addEventListener('click',()=>{libraryPage=Math.max(0,libraryPage-1);renderLibrary();});$('libraryNext').addEventListener('click',()=>{libraryPage++;renderLibrary();});
  $('exportBtn').addEventListener('click',exportProgress);$('importBtn').addEventListener('click',()=>$('importFile').click());$('importFile').addEventListener('change',e=>importProgressFile(e.target.files[0]));
  $('speakBtn').disabled=true;
  // Launch in a calm, ready-to-study state. Nothing is marked complete until the learner rates a card.
  mode='idle';queue=[];cursor=0;setModeTab('learn');updateStats();
}
init();
