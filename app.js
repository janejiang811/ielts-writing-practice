const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'ieltsWritingLab.v3.spelling-progress';
const LEGACY_STORAGE_KEY = 'ieltsWritingLab.v2.progress';
const CATEGORY_ORDER = ['教育','科技','社会','政府','媒体','国际','犯罪','文化','旅游','环境','健康','工作'];
const TYPE_ORDER = ['万能论证短句','观点类','积极结果','消极结果','原因分析'];
const TYPE_LABELS = {'万能论证短句':'完整论证句','观点类':'观点与措施','积极结果':'积极结果','消极结果':'消极结果','原因分析':'原因分析'};
const INTERVAL_DAYS = [0.25,1,3,7,14,30];
const SESSION_LIMITS = [5,10,15,20,30];
function validBatchSize(n){const size=Number(n);return SESSION_LIMITS.includes(size)?size:10;}
let entries = [];
let state = { progress:{}, settings:{dailyGoal:10,reviewBatchSize:10}, dailyStats:{}, activeBatches:{} };
let mode = 'idle';
let queue = [];
let cursor = 0;
let sessionBatch = null; // fixed membership until every entry has passed one spelling check
let sessionIsSingle = false; // ad-hoc library practice must not replace a saved group
let revealed = false;
let checked = false;
let typedCorrect = false;
let libraryPage = 0;
let selectedCategory = 'all';
let selectedType = 'all';
let searchText = '';
let learningStage = 'prompt'; // prompt → example → typing → checked (learn); typing → checked (review)

function safeReadState(){
  try {
    const currentRaw=localStorage.getItem(STORAGE_KEY);
    const legacyRaw=localStorage.getItem(LEGACY_STORAGE_KEY);
    const saved=JSON.parse(currentRaw || legacyRaw || '{}');
    if(saved && typeof saved === 'object') state = {...state, ...saved, progress:saved.progress || {}, settings:{...state.settings,...(saved.settings||{})},dailyStats:saved.dailyStats||{}};
    // Previous versions allowed subjective self-rating. Preserve their history and settings,
    // but require every previously studied item to re-earn mastery through verified spelling.
    if(!currentRaw && legacyRaw){
      const now=Date.now();
      for(const p of Object.values(state.progress)){
        if(!p || typeof p!=='object')continue;
        p.level=0;p.correctRounds=0;p.dueAt=now;p.lastRating='needs-spelling-verification';
      }
      saveState();
    }
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
function isMastered(e){const p=state.progress[e.id];return !!p && Number(p.level||0)>=2;}
function getFiltered(){
  const q=searchText.trim().toLowerCase();
  return entries.filter(e=>(selectedCategory==='all'||e.category===selectedCategory)&&(selectedType==='all'||e.type===selectedType)&&(!q||e.en.toLowerCase().includes(q)||e.zh.toLowerCase().includes(q)||e.category.includes(q)))
    .sort((a,b)=>CATEGORY_ORDER.indexOf(a.category)-CATEGORY_ORDER.indexOf(b.category)||TYPE_ORDER.indexOf(a.type)-TYPE_ORDER.indexOf(b.type)||a.id.localeCompare(b.id,undefined,{numeric:true}));
}
function progressFor(e){return state.progress[e.id]||null;}
function categoryEntries(category){return entries.filter(e=>e.category===category);}
function categoryProgress(category){const pool=categoryEntries(category),learned=pool.filter(e=>!!state.progress[e.id]).length,mastered=pool.filter(isMastered).length;return {total:pool.length,learned,mastered,remaining:pool.length-learned,inProgress:learned-mastered};}
function hasLibraryNarrowing(){return selectedCategory!=='all'||selectedType!=='all'||!!searchText.trim();}
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
  const reviewSize=validBatchSize(state.settings.reviewBatchSize);
  state.settings.reviewBatchSize=reviewSize;
  $('reviewBatchSize').value=String(reviewSize);
  $('reviewBatchSizeInline').value=String(reviewSize);
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
  updateReviewPlanSummary();
}
function updateReviewPlanSummary(){
  const active=state.activeBatches?.review;
  if(active?.ids?.length && active.passedIds?.length<active.ids.length){
    $('reviewBatchHint').textContent=`当前组固定 ${active.ids.length} 条 · 已通过 ${active.passedIds.length} 条，全部正确后才能进入下一组`;
    return;
  }
  const n=getDue(getFiltered()).length, batch=validBatchSize(state.settings.reviewBatchSize);
  $('reviewBatchHint').textContent=n?`当前筛选下有 ${n} 条到期表达 · 下一组 ${Math.min(n,batch)} 条`:`当前筛选下暂无到期表达 · 每组最多 ${batch} 条`;
}
function setReviewBatchSize(value){
  const size=validBatchSize(value);
  state.settings.reviewBatchSize=size;
  $('reviewBatchSize').value=String(size);
  $('reviewBatchSizeInline').value=String(size);
  saveState();updateReviewPlanSummary();updateSessionLabel();
}
function updateFilterCounts(){const filtered=getFiltered();$('filteredCount').textContent=`当前 ${filtered.length} 条`;updateReviewPlanSummary();if(mode==='browse') renderLibrary();}
function setModeTab(value){document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===value));}
// Store the exact IDs in each unfinished group. Filters and batch-size changes only
// affect FUTURE groups; a group cannot be replaced or completed by failed attempts.
function savedBatch(which){
  if(!state.activeBatches || typeof state.activeBatches!=='object') state.activeBatches={};
  const raw=state.activeBatches[which];
  if(!raw || !Array.isArray(raw.ids))return null;
  const known=new Set(entries.map(e=>e.id));
  const ids=[...new Set(raw.ids.filter(id=>known.has(id)))];
  if(!ids.length){delete state.activeBatches[which];saveState();return null;}
  const passedIds=[...new Set((Array.isArray(raw.passedIds)?raw.passedIds:[]).filter(id=>ids.includes(id)))];
  state.activeBatches[which]={mode:which,ids,passedIds,startedAt:raw.startedAt||Date.now()};
  return state.activeBatches[which];
}
function groupPassCount(){return sessionBatch?.passedIds?.length||0;}
function updateGroupPosition(){
  const done=groupPassCount(), total=queue.length;
  $('cardPosition').textContent=`本组 ${done}/${total} · 第 ${cursor+1} 条`;
  $('queueProgress').style.width=`${Math.round(done/Math.max(total,1)*100)}%`;
}
function firstUnpassedFrom(index){
  if(!queue.length)return -1;
  const passed=new Set(sessionBatch?.passedIds||[]);
  for(let n=0;n<queue.length;n++){
    const i=(index+n)%queue.length;
    if(!passed.has(queue[i].id))return i;
  }
  return -1;
}
function startSession(nextMode,oneEntry=null){
  mode=nextMode;revealed=false;checked=false;typedCorrect=false;learningStage='prompt';setModeTab(nextMode==='idle'?'learn':nextMode);
  sessionIsSingle=!!oneEntry;
  sessionBatch=null;
  const pool=getFiltered();
  if(nextMode==='learn'||nextMode==='review'){
    if(oneEntry){
      // Standalone library practice leaves the saved groups unchanged.
      sessionBatch={mode:nextMode,ids:[oneEntry.id],passedIds:[],startedAt:Date.now()};
    }else{
      sessionBatch=savedBatch(nextMode);
      if(!sessionBatch){
        // A failed expression in another unfinished group cannot leak into this one.
        const locked=new Set(['learn','review'].flatMap(k=>savedBatch(k)?.ids||[]));
        const eligible=pool.filter(e=>!locked.has(e.id));
        const selected=nextMode==='learn'
          ?shuffle(getUnseen(eligible)).slice(0,validBatchSize(state.settings.dailyGoal))
          :shuffle(getDue(eligible)).slice(0,validBatchSize(state.settings.reviewBatchSize));
        if(selected.length){
          sessionBatch={mode:nextMode,ids:selected.map(e=>e.id),passedIds:[],startedAt:Date.now()};
          state.activeBatches[nextMode]=sessionBatch;saveState();
        }
      }
    }
    const byId=new Map(entries.map(e=>[e.id,e]));
    queue=(sessionBatch?.ids||[]).map(id=>byId.get(id)).filter(Boolean);
  }else queue=[];
  cursor=0;
  $('librarySection').classList.toggle('hidden',nextMode!=='browse');
  $('workspaceSection').classList.toggle('browsing',nextMode==='browse');
  $('studyPanel').classList.toggle('hidden',nextMode==='browse');
  $('reviewBatchBar').classList.toggle('hidden',nextMode!=='review');
  if(nextMode==='browse'){renderLibrary();return;}
  if(!queue.length){
    $('idleState').classList.remove('hidden');$('studyCard').classList.add('hidden');$('sessionDone').classList.add('hidden');
    $('idleState').querySelector('h2').textContent=nextMode==='learn'?'这一范围暂时没有新表达。':nextMode==='review'?'目前没有到期的表达。':'当前筛选下没有可练习的表达。';
    $('idleState').querySelector('p:not(.small-cap)').textContent=nextMode==='learn'?'可以切换到“间隔复习”，巩固已经学过的表达；也可以清除筛选，继续扩展学习范围。':nextMode==='review'?'可以先学新表达，或调整筛选范围查看其他到期内容。':'请调整主题、用途或关键词筛选后再试。';
    $('revealBtn').classList.add('hidden');$('ratingArea').classList.add('hidden');$('typingNextArea').classList.add('hidden');$('typingBox').classList.add('hidden');$('clozeBox').classList.add('hidden');$('cardPosition').textContent='没有待练习内容';$('queueProgress').style.width='0%';$('prevBtn').disabled=true;$('nextBtn').disabled=true;updateSessionLabel();updateReviewPlanSummary();return;
  }
  const pending=firstUnpassedFrom(0);
  if(pending<0){finishSession();return;}
  cursor=pending;
  $('idleState').classList.add('hidden');$('sessionDone').classList.add('hidden');$('studyCard').classList.remove('hidden');renderCard();
  updateReviewPlanSummary();
}
function updateSessionLabel(){
  const labels={learn:`新表达 · 本组 ${queue.length||validBatchSize(state.settings.dailyGoal)} 条`,review:`间隔复习 · 本组 ${queue.length||validBatchSize(state.settings.reviewBatchSize)} 条`,browse:'表达总库'};
  $('sessionLabel').textContent=labels[mode]||'拼写输出';
}
function escapeHtml(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function escapeRegExp(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function highlightTarget(sentence, target){if(!target||target.length>180||target.split(/\s+/).length>18)return escapeHtml(sentence);const re=new RegExp(escapeRegExp(target),'ig');return escapeHtml(sentence).replace(new RegExp(escapeRegExp(escapeHtml(target)),'ig'),m=>`<mark>${m}</mark>`);}
function blankOut(sentence,target){if(!target||target.length>180)return sentence;const re=new RegExp(escapeRegExp(target),'i');return sentence.replace(re,'________');}
function renderCard(){
  if(!queue.length){return;}
  if((sessionBatch?.passedIds?.length||0)>=queue.length){finishSession();return;}
  if(!queue[cursor]||sessionBatch?.passedIds?.includes(queue[cursor].id))cursor=firstUnpassedFrom(Math.max(0,cursor));
  const e=queue[cursor];
  revealed=false;checked=false;typedCorrect=false;
  learningStage=mode==='learn'?'prompt':'typing';
  $('idleState').classList.add('hidden');$('sessionDone').classList.add('hidden');$('studyCard').classList.remove('hidden');
  updateGroupPosition();
  $('cardCategory').textContent=e.category;$('cardType').textContent=TYPE_LABELS[e.type]||e.type;$('cardSource').textContent=e.sourceLabel;
  $('masteryProgress').textContent=mode==='learn'?'学习0/1':'复习0/1';
  $('promptLabel').textContent=mode==='learn'?'先根据中文想一想，准备好再显示答案':e.type==='万能论证短句'?'中文整句 · 独立写出英文':'中文提示 · 独立拼写英文表达';
  $('promptText').textContent=e.zh;
  $('clozeSentence').textContent=blankOut(e.exampleEn,e.exampleTarget||e.en);
  $('answerInput').value='';$('answerInput').disabled=false;$('checkAnswerBtn').disabled=false;
  $('typingFeedback').textContent='';$('typingFeedback').className='typing-feedback';
  $('answerText').textContent=e.en;$('answerTranslation').textContent=e.zh;
  $('exampleText').innerHTML=highlightTarget(e.exampleEn,e.exampleTarget||e.en);$('exampleTranslation').textContent=e.exampleZh;
  $('suggestionArea').classList.toggle('hidden',!e.suggestionEn);$('suggestionText').textContent=e.suggestionEn||'';$('suggestionNote').textContent=e.suggestionNote||'';
  $('exampleTag').textContent=e.exampleTag||'语境例句';
  $('grammarTip').textContent=e.grammarTip;$('roleTag').textContent=e.role;
  $('answerArea').classList.add('hidden');$('ratingArea').classList.add('hidden');$('typingNextArea').classList.add('hidden');
  $('startTypingBtn').classList.add('hidden');
  $('revealBtn').classList.toggle('hidden',mode!=='learn');
  $('revealBtn').innerHTML='显示英文答案与例句 <span>↓</span>';
  $('clozeBox').classList.toggle('hidden',mode==='learn');
  $('typingBox').classList.toggle('hidden',mode==='learn');
  $('typingLabel').textContent=mode==='learn'?'现在凭记忆拼写一次（答案已隐藏）':'根据中文提示拼写英文表达';
  $('typingNextBtn').textContent='下一条 →';
  // Avoid revealing the answer through speech before a recall attempt.
  $('speakBtn').disabled=true;
  // Do not allow jumping over an unchecked/incorrect expression.
  $('prevBtn').disabled=true;$('nextBtn').disabled=true;
  $('prevBtn').title='本组逐条完成拼写判定';$('nextBtn').title='本组全部通过后才能进入下一组';
  updateSessionLabel();
}
function revealAnswer(){
  if(!queue[cursor])return;
  if(mode==='learn' && learningStage==='prompt'){
    learningStage='example';revealed=true;
    $('answerArea').classList.remove('hidden');
    $('revealBtn').classList.add('hidden');
    $('startTypingBtn').classList.remove('hidden');
    $('speakBtn').disabled=false;
  }else if(checked){
    revealed=true;
    $('answerArea').classList.remove('hidden');
    $('speakBtn').disabled=false;
  }
}
function beginTyping(){
  if(mode!=='learn'||learningStage!=='example'||checked)return;
  learningStage='typing';
  $('answerArea').classList.add('hidden');
  $('startTypingBtn').classList.add('hidden');
  $('clozeBox').classList.remove('hidden');
  $('typingBox').classList.remove('hidden');
  $('speakBtn').disabled=true;
  $('answerInput').focus();
}
function normalizeAnswer(s){return String(s||'').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑‒–—]/g,'-').replace(/\s+/g,' ').trim();}
// IELTS accepts consistent British and American spelling. The pairs below are
// explicitly reviewed lexical equivalents, not fuzzy/edit-distance matching.
// We deliberately do NOT equate different grammar forms (e.g. practice/practise),
// paraphrases or similar-looking words. Keep original lesson text unchanged.
const REGIONAL_SPELLING_PAIRS = [
  ['ageing','aging'],
  ['analyse','analyze'],
  ['analysed','analyzed'],
  ['analysing','analyzing'],
  ['behaviour','behavior'],
  ['behaviours','behaviors'],
  ['behavioural','behavioral'],
  ['centre','center'],
  ['centres','centers'],
  ['centralise','centralize'],
  ['centralised','centralized'],
  ['centralising','centralizing'],
  ['colour','color'],
  ['colours','colors'],
  ['coloured','colored'],
  ['colourful','colorful'],
  ['colouring','coloring'],
  ['commercialisation','commercialization'],
  ['commercialise','commercialize'],
  ['commercialised','commercialized'],
  ['commercialising','commercializing'],
  ['counselling','counseling'],
  ['counsellor','counselor'],
  ['counsellors','counselors'],
  ['defence','defense'],
  ['defences','defenses'],
  ['emphasise','emphasize'],
  ['emphasises','emphasizes'],
  ['emphasised','emphasized'],
  ['emphasising','emphasizing'],
  ['favour','favor'],
  ['favours','favors'],
  ['favoured','favored'],
  ['favouring','favoring'],
  ['favourable','favorable'],
  ['favourite','favorite'],
  ['favourites','favorites'],
  ['fibre','fiber'],
  ['fibres','fibers'],
  ['flavour','flavor'],
  ['flavours','flavors'],
  ['fulfil','fulfill'],
  ['fulfils','fulfills'],
  ['fulfilment','fulfillment'],
  ['globalisation','globalization'],
  ['globalise','globalize'],
  ['globalised','globalized'],
  ['globalising','globalizing'],
  ['homogenisation','homogenization'],
  ['homogenise','homogenize'],
  ['homogenised','homogenized'],
  ['homogenising','homogenizing'],
  ['honour','honor'],
  ['honours','honors'],
  ['honoured','honored'],
  ['honouring','honoring'],
  ['humour','humor'],
  ['industrialisation','industrialization'],
  ['industrialise','industrialize'],
  ['industrialised','industrialized'],
  ['industrialising','industrializing'],
  ['judgement','judgment'],
  ['labour','labor'],
  ['labours','labors'],
  ['laboured','labored'],
  ['labouring','laboring'],
  ['labourers','laborers'],
  ['liberalisation','liberalization'],
  ['liberalise','liberalize'],
  ['liberalised','liberalized'],
  ['liberalising','liberalizing'],
  ['litre','liter'],
  ['litres','liters'],
  ['metre','meter'],
  ['metres','meters'],
  ['modernisation','modernization'],
  ['modernise','modernize'],
  ['modernised','modernized'],
  ['modernising','modernizing'],
  ['neighbour','neighbor'],
  ['neighbours','neighbors'],
  ['neighbourhood','neighborhood'],
  ['neighbourhoods','neighborhoods'],
  ['neighbouring','neighboring'],
  ['offence','offense'],
  ['offences','offenses'],
  ['optimise','optimize'],
  ['optimises','optimizes'],
  ['optimised','optimized'],
  ['optimising','optimizing'],
  ['organisation','organization'],
  ['organisations','organizations'],
  ['organise','organize'],
  ['organises','organizes'],
  ['organised','organized'],
  ['organising','organizing'],
  ['paralyse','paralyze'],
  ['paralysed','paralyzed'],
  ['paralysing','paralyzing'],
  ['prioritisation','prioritization'],
  ['prioritise','prioritize'],
  ['prioritises','prioritizes'],
  ['prioritised','prioritized'],
  ['prioritising','prioritizing'],
  ['programme','program'],
  ['programmes','programs'],
  ['recognise','recognize'],
  ['recognises','recognizes'],
  ['recognised','recognized'],
  ['recognising','recognizing'],
  ['realise','realize'],
  ['realises','realizes'],
  ['realised','realized'],
  ['realising','realizing'],
  ['skilful','skillful'],
  ['standardisation','standardization'],
  ['standardise','standardize'],
  ['standardises','standardizes'],
  ['standardised','standardized'],
  ['standardising','standardizing'],
  ['subsidise','subsidize'],
  ['subsidises','subsidizes'],
  ['subsidised','subsidized'],
  ['subsidising','subsidizing'],
  ['theatre','theater'],
  ['theatres','theaters'],
  ['traveller','traveler'],
  ['travellers','travelers'],
  ['travelling','traveling'],
  ['travelled','traveled'],
  ['unauthorised','unauthorized'],
  ['urbanisation','urbanization'],
  ['urbanise','urbanize'],
  ['urbanised','urbanized'],
  ['urbanising','urbanizing'],
  ['utilisation','utilization'],
  ['utilise','utilize'],
  ['utilised','utilized'],
  ['utilising','utilizing'],
  ['cancelled','canceled'],
  ['cancelling','canceling'],
  ['enrol','enroll'],
  ['enrols','enrolls'],
  ['enrolment','enrollment'],
  ['enrolments','enrollments'],
  ['grey','gray'],
  ['greys','grays'],
  ['modelling','modeling'],
  ['modelled','modeled'],
  ['labelling','labeling'],
  ['labelled','labeled'],
  ['minimise','minimize'],
  ['minimises','minimizes'],
  ['minimised','minimized'],
  ['minimising','minimizing'],
  ['maximise','maximize'],
  ['maximises','maximizes'],
  ['maximised','maximized'],
  ['maximising','maximizing'],
  ['summarise','summarize'],
  ['summarises','summarizes'],
  ['summarised','summarized'],
  ['summarising','summarizing'],
  ['criticise','criticize'],
  ['criticises','criticizes'],
  ['criticised','criticized'],
  ['criticising','criticizing'],
  ['specialise','specialize'],
  ['specialises','specializes'],
  ['specialised','specialized'],
  ['specialising','specializing'],
  ['characterise','characterize'],
  ['characterises','characterizes'],
  ['characterised','characterized'],
  ['characterising','characterizing'],
  ['socialise','socialize'],
  ['socialises','socializes'],
  ['socialised','socialized'],
  ['socialising','socializing'],
  ['socialisation','socialization'],
  ['authorise','authorize'],
  ['authorises','authorizes'],
  ['authorised','authorized'],
  ['authorising','authorizing'],
  ['authorisation','authorization'],
  ['civilisation','civilization'],
  ['civilisations','civilizations'],
  ['apologise','apologize'],
  ['apologised','apologized'],
  ['apologising','apologizing'],
  ['sulphur','sulfur'],
  ['sulphate','sulfate'],
  ['catalogue','catalog'],
  ['catalogues','catalogs'],
  ['dialogue','dialog'],
  ['dialogues','dialogs'],
  ['paediatric','pediatric'],
  ['paediatrics','pediatrics'],
  ['anaemia','anemia'],
  ['oestrogen','estrogen']
];
const REGIONAL_SPELLING_MAP = Object.create(null);
for (const [british, american] of REGIONAL_SPELLING_PAIRS) {
  REGIONAL_SPELLING_MAP[british] = american;
  REGIONAL_SPELLING_MAP[american] = american;
}
function normalizeRegionalSpelling(s){
  // Normalization is restricted to entire words; possessives retain their 's.
  // This cannot change word order, remove words or forgive typos.
  return normalizeAnswer(s).replace(/\b[a-z]+(?:'s)?\b/g, word => {
    const possessive = word.endsWith("'s") ? "'s" : "";
    const base = possessive ? word.slice(0,-2) : word;
    return (REGIONAL_SPELLING_MAP[base] || base) + possessive;
  });
}
function describeRegionalSpelling(input, target){
  // Provide a concrete explanation only for a genuine regional spelling match.
  const written = normalizeAnswer(input).match(/[a-z]+(?:'s)?/g) || [];
  const expected = normalizeAnswer(target).match(/[a-z]+(?:'s)?/g) || [];
  if(written.length !== expected.length) return '';
  const changes = [];
  for(let i=0;i<written.length;i++){
    if(written[i] !== expected[i] &&
       normalizeRegionalSpelling(written[i]) === normalizeRegionalSpelling(expected[i])){
      const comparison = `${written[i]} ↔ ${expected[i]}`;
      if(!changes.includes(comparison)) changes.push(comparison);
    }
  }
  return changes.slice(0,3).join('、');
}


// Commit results when "核对" is pressed, so a correct 1/1 is saved even if
// the user refreshes before pressing the button to proceed.
function recordCurrentAttempt(){
  const e=queue[cursor];if(!e||!checked)return;
  const now=Date.now(),old=state.progress[e.id]||{level:0,reviews:0};
  let level=Number(old.level||0),dueAt;
  if(!typedCorrect){
    level=0;dueAt=now+10*60*1000;
  }else if(mode==='learn'){
    level=Math.max(1,level);dueAt=now+INTERVAL_DAYS[Math.min(5,level)]*86400000;
  }else{
    level=Math.min(5,Math.max(2,level+1));dueAt=now+INTERVAL_DAYS[level]*86400000;
  }
  state.progress[e.id]={level,dueAt,lastAt:now,firstAt:old.firstAt||now,reviews:Number(old.reviews||0)+1,lastRating:typedCorrect?'known':'again',correctRounds:level};
  if(typedCorrect && sessionBatch && !sessionBatch.passedIds.includes(e.id))sessionBatch.passedIds.push(e.id);
  if(!sessionIsSingle && sessionBatch)state.activeBatches[mode]=sessionBatch;
  const ds=todayStats();
  if(typedCorrect&&!ds.doneIds.includes(e.id))ds.doneIds.push(e.id);
  ds.ratings=Number(ds.ratings||0)+1;state.dailyStats[dateKey()]=ds;
  saveState();updateStats();updateGroupPosition();
}
function checkTypedAnswer(){
  const e=queue[cursor];if(!e||checked||learningStage!=='typing')return;
  const input=normalizeAnswer($('answerInput').value);
  const targets=[e.en,e.suggestionEn].filter(Boolean).map(normalizeAnswer);
  if(!input){$('typingFeedback').textContent='请输入英文表达后再核对。';return;}
  const normalizedInput=normalizeRegionalSpelling(input);
  const matchedTarget=targets.find(target=>normalizeRegionalSpelling(target)===normalizedInput);
  checked=true;typedCorrect=matchedTarget!==undefined;learningStage='checked';
  $('masteryProgress').textContent=mode==='learn'?(typedCorrect?'学习1/1':'学习0/1'):(typedCorrect?'复习1/1':'复习0/1');
  const regionalDetail=typedCorrect && input!==matchedTarget
    ? describeRegionalSpelling(input,matchedTarget) : '';
  $('answerInput').disabled=true;$('checkAnswerBtn').disabled=true;
  recordCurrentAttempt();
  revealAnswer();
  if(typedCorrect){
    const passMessage=mode==='learn'?'✓ 拼写正确！这条表达完成了首次学习。':'✓ 拼写正确！本次复习通过，判定为已掌握。';
    $('typingFeedback').textContent=passMessage+
      (regionalDetail?` 已认可英／美拼写差异：${regionalDetail}（两种拼写均正确）。`:'');
    $('typingFeedback').className='typing-feedback correct';
    $('typingRoundNote').textContent=mode==='learn'?'本次学习完成。下一次将通过独立拼写进行间隔复习，正确一次即可掌握。':'本次复习完成；系统将按间隔复习计划安排下一次回顾。';
  }else{
    $('typingFeedback').textContent='这次拼写未匹配标准表达。请对照答案检查词形、搭配和字母顺序。';
    $('typingFeedback').className='typing-feedback incorrect';
    $('typingRoundNote').textContent='这条表达仍留在当前组；先完成本组其他条目，再回来拼写，直到本组全部通过。';
  }
  $('typingNextArea').classList.remove('hidden');
  const finished=groupPassCount()===queue.length;
  $('typingNextBtn').textContent=finished?'全部通过，完成本组 →':typedCorrect?'本条通过，继续本组 →':'暂未通过，继续本组 →';
}
function rateCurrent(rating){
  if(!queue[cursor]||!checked||(rating==='known')!==typedCorrect)return;
  // The fixed group only progresses after every original member passes once.
  if(groupPassCount()===queue.length){finishSession();return;}
  const next=firstUnpassedFrom((cursor+1)%queue.length);
  if(next<0){finishSession();return;}
  cursor=next;renderCard();
}
function finishSession(){
  if(!queue.length||groupPassCount()!==queue.length)return;
  // Release this saved group only after every selected item has passed.
  if(!sessionIsSingle && state.activeBatches?.[mode]){
    delete state.activeBatches[mode];saveState();
  }
  $('studyCard').classList.add('hidden');$('idleState').classList.add('hidden');$('sessionDone').classList.remove('hidden');$('cardPosition').textContent=`本组 ${queue.length}/${queue.length}`;$('prevBtn').disabled=true;$('nextBtn').disabled=true;$('queueProgress').style.width='100%';
  const n=queue.length;const learned=todayStats().doneIds.length;
  $('doneSummary').textContent=`本组 ${n} 条表达已全部通过拼写判定（${n}/${n}）。今天累计正确拼写 ${learned} 条不同表达。`;
  // Failed attempts of this group are already overwritten by its final passes.
  const due=getDue(getFiltered()).length;
  $('doneReviewBtn').textContent=due?`继续复习下一组（剩余 ${due} 条）→`:'查看复习计划 →';
  $('doneNewBtn').textContent='再学一组';
  updateSessionLabel();updateStats();
}
function moveBy(delta){
  // The old previous/next buttons would skip unchecked cards and break group locking.
  // Advancement is exclusively via spelling check followed by "继续本组".
  return;
}
function startSingle(e){startSession(progressFor(e)?'review':'learn',e);$('studyPanel').scrollIntoView({behavior:'smooth',block:'start'});}
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
      const pr=progressFor(e),level=Math.min(2,Number(pr?.level||0));
      return `<article class="library-item"><div><div class="lib-meta"><span>${escapeHtml(e.category)}</span><span>${escapeHtml(TYPE_LABELS[e.type]||e.type)}</span>${pr?`<span>${isMastered(e)?'已掌握':'待复习'}</span>`:`<span>待学习</span>`}</div><p class="lib-zh">${escapeHtml(e.zh)}</p><p class="lib-en">${escapeHtml(e.en)}</p></div><button data-study-id="${escapeHtml(e.id)}">练这一条 →</button></article>`;
    }).join('');
    $('libraryList').querySelectorAll('[data-study-id]').forEach(b=>b.addEventListener('click',()=>{const e=entries.find(x=>x.id===b.dataset.studyId);if(e)startSingle(e);}));
  }else{
    $('libraryList').innerHTML='';libraryPage=0;$('typeBreakdown').classList.add('hidden');$('typeBreakdown').innerHTML='';
  }
}

function setFilterCategory(v){selectedCategory=v;$('categoryFilter').value=v;$('libraryCategoryFilter').value=v;libraryPage=0;updateFilterCounts();}
function setFilterType(v){selectedType=v;$('typeFilter').value=v;$('libraryTypeFilter').value=v;document.querySelectorAll('.quick-filter').forEach(b=>b.classList.toggle('selected',b.dataset.type===v));libraryPage=0;updateFilterCounts();}
function resetFilters(){selectedCategory='all';selectedType='all';searchText='';$('categoryFilter').value='all';$('libraryCategoryFilter').value='all';$('typeFilter').value='all';$('libraryTypeFilter').value='all';$('searchInput').value='';$('librarySearchInput').value='';libraryPage=0;document.querySelectorAll('.quick-filter').forEach(b=>b.classList.remove('selected'));updateFilterCounts();}

function speakCurrent(){const e=queue[cursor];if(!e||$('speakBtn').disabled||!('speechSynthesis'in window)){alert('当前浏览器没有提供语音朗读功能。');return;}window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(e.en);utterance.lang='en-US';utterance.rate=.88;window.speechSynthesis.speak(utterance);}
function exportProgress(){const payload={app:'IELTS Writing Lab',version:3,exportedAt:new Date().toISOString(),state};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ielts-writing-progress-${dateKey()}.json`;a.click();URL.revokeObjectURL(url);}
function importProgressFile(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);const imported=data.state||data;if(!imported.progress||typeof imported.progress!=='object')throw new Error('Missing progress');const ok=confirm('导入会与当前学习记录合并；同一条表达以导入文件中的记录为准。旧版本记录不会直接计为拼写掌握。是否继续？');if(!ok)return;const importedProgress={...imported.progress};if(Number(data.version||0)<3){const now=Date.now();for(const p of Object.values(importedProgress)){if(!p||typeof p!=='object')continue;p.level=0;p.correctRounds=0;p.dueAt=now;p.lastRating='needs-spelling-verification';}}state.progress={...state.progress,...importedProgress};state.dailyStats={...state.dailyStats,...(imported.dailyStats||{})};state.settings={...state.settings,...(imported.settings||{})};state.activeBatches={...(state.activeBatches||{}),...(imported.activeBatches||{})};saveState();fillFilters();updateStats();if(mode==='browse')renderLibrary();alert('学习记录已导入。');}catch(e){alert('文件无法识别，请选择本网站导出的 JSON 备份。');}};reader.readAsText(file);}

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
  $('dailyGoal').addEventListener('change',e=>{state.settings.dailyGoal=validBatchSize(e.target.value);saveState();updateStats();});
  $('reviewBatchSize').addEventListener('change',e=>setReviewBatchSize(e.target.value));
  $('reviewBatchSizeInline').addEventListener('change',e=>setReviewBatchSize(e.target.value));
  $('startLearnBtn').addEventListener('click',()=>startSession('learn'));$('idleLearnBtn').addEventListener('click',()=>startSession('learn'));
  $('startReviewBtn').addEventListener('click',()=>startSession('review'));$('idleReviewBtn').addEventListener('click',()=>startSession('review'));
  $('doneReviewBtn').addEventListener('click',()=>startSession('review'));$('doneNewBtn').addEventListener('click',()=>startSession('learn'));
  document.querySelectorAll('.mode-tab').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.mode==='browse'){startSession('browse');}else startSession(b.dataset.mode);}));
  document.querySelectorAll('.quick-filter').forEach(b=>b.addEventListener('click',()=>{setFilterType(selectedType===b.dataset.type?'all':b.dataset.type);if(mode==='browse')renderLibrary();}));
  $('clearFiltersBtn').addEventListener('click',resetFilters);$('revealBtn').addEventListener('click',revealAnswer);$('startTypingBtn').addEventListener('click',beginTyping);
  document.querySelectorAll('[data-rating]').forEach(b=>b.addEventListener('click',()=>rateCurrent(b.dataset.rating)));
  $('prevBtn').addEventListener('click',()=>moveBy(-1));$('nextBtn').addEventListener('click',()=>moveBy(1));$('speakBtn').addEventListener('click',speakCurrent);
  $('checkAnswerBtn').addEventListener('click',checkTypedAnswer);$('answerInput').addEventListener('keydown',e=>{if(e.key==='Enter')checkTypedAnswer();});$('typingNextBtn').addEventListener('click',()=>{if(checked)rateCurrent(typedCorrect?'known':'again');});
  $('libraryPrev').addEventListener('click',()=>{libraryPage=Math.max(0,libraryPage-1);renderLibrary();});$('libraryNext').addEventListener('click',()=>{libraryPage++;renderLibrary();});
  $('exportBtn').addEventListener('click',exportProgress);$('importBtn').addEventListener('click',()=>$('importFile').click());$('importFile').addEventListener('change',e=>importProgressFile(e.target.files[0]));
  $('speakBtn').disabled=true;
  // Launch in a calm, ready-to-study state. A card only affects mastery after the learner submits and records a spelling check.
  mode='idle';queue=[];cursor=0;setModeTab('learn');updateStats();
}
init();
