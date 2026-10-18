const $ = id => document.getElementById(id);
let allItems = [], filtered = [], index = 0, showDetails = false, reviewOnly = false;
const STORAGE_KEY = "ielts-writing-lab-progress-v1";
let progress = {};
try { progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { progress = {}; }

const categories = [
  ["education","教育"],["technology","科技"],["society","社会"],["government","政府"],
  ["media","媒体"],["international","国际"],["crime","犯罪"],["culture","文化"],
  ["tourism","旅游"],["environment","环境"],["health","健康"],["work","工作"]
];
const typeOrder = ["观点","结果·正面","结果·负面","原因"];

function saveProgress(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); updateStats(); renderList(); }
function stateOf(item){ return progress[item.id]?.rating || ""; }
function current(){ return filtered[index]; }
function populateFilters(){
  categories.forEach(([value,label])=>{ const o=document.createElement("option");o.value=value;o.textContent=label;$("categoryFilter").append(o); });
  [...new Set(allItems.map(x=>x.type))].sort((a,b)=>typeOrder.indexOf(a)-typeOrder.indexOf(b)).forEach(type=>{const o=document.createElement("option");o.value=type;o.textContent=type;$("typeFilter").append(o);});
}
function applyFilters(keepId){
  const cat=$("categoryFilter").value, type=$("typeFilter").value, q=$("searchInput").value.trim().toLowerCase();
  filtered=allItems.filter(x=>(cat==="all"||x.category===cat)&&(type==="all"||x.type===type)&&(!q||[x.expression,x.meaning,x.example,x.categoryName].join(" ").toLowerCase().includes(q))&&(!reviewOnly||stateOf(x)!=="known"));
  const found=keepId?filtered.findIndex(x=>x.id===keepId):-1;
  index=found>=0?found:Math.min(index,Math.max(0,filtered.length-1));
  render();
}
function render(){
  const item=current(), empty=!item;
  $("flashcard").classList.toggle("hidden",empty); $("emptyState").classList.toggle("hidden",!empty);
  $("rating-row");
  if(empty){$("cardCounter").textContent="0 / 0";$("resultList").innerHTML="";updateStats();return;}
  showDetails=false;
  $("cardCounter").textContent=String(index+1).padStart(2,"0")+" / "+String(filtered.length).padStart(2,"0");
  $("cardCategory").textContent=item.categoryName; $("cardType").textContent=item.type;
  $("expression").textContent=item.expression;$("meaning").textContent=item.meaning;
  $("example").textContent=item.example;$("exampleTranslation").textContent=item.exampleTranslation;
  $("extension").textContent=item.extension;$("extensionTranslation").textContent=item.extensionTranslation;
  $("meaningArea").classList.add("hidden");$("details").classList.add("hidden");
  $("revealBtn").classList.remove("hidden");$("revealBtn").innerHTML='显示释义与例句 <span>↓</span>';
  document.querySelectorAll(".rating").forEach(b=>b.classList.toggle("selected",b.dataset.rating===stateOf(item)));
  renderList();updateStats();
}
function toggleReveal(){
  showDetails=!showDetails;
  $("meaningArea").classList.toggle("hidden",!showDetails);$("details").classList.toggle("hidden",!showDetails);
  $("revealBtn").innerHTML=showDetails?'收起例句与扩展 <span>↑</span>':'显示释义与例句 <span>↓</span>';
}
function renderList(){
  const list=$("resultList");list.innerHTML="";
  filtered.forEach((item,i)=>{
    const b=document.createElement("button");b.className="result-item "+stateOf(item)+(i===index?" active":"");
    b.innerHTML='<span class="mark"></span><span></span><span></span>';
    b.children[1].textContent=item.expression;b.children[2].textContent=stateOf(item)==="known"?"已掌握":stateOf(item)==="again"?"复习":"";
    b.addEventListener("click",()=>{index=i;render();});list.append(b);
  });
}
function updateStats(){
  $("totalCount").textContent=allItems.length;
  $("knownCount").textContent=allItems.filter(x=>stateOf(x)==="known").length;
  $("reviewCount").textContent=allItems.filter(x=>stateOf(x)!=="known").length;
  const n=allItems.length?Math.round(allItems.filter(x=>stateOf(x)==="known").length/allItems.length*100):0;
  $("progressPercent").textContent=n+"%";
}
function move(delta){if(!filtered.length)return;index=(index+delta+filtered.length)%filtered.length;render();}
$("revealBtn").addEventListener("click",toggleReveal);
$("nextBtn").addEventListener("click",()=>move(1));$("prevBtn").addEventListener("click",()=>move(-1));
$("shuffleBtn").addEventListener("click",()=>{if(filtered.length<2)return;let n=index;while(n===index)n=Math.floor(Math.random()*filtered.length);index=n;render();});
["categoryFilter","typeFilter"].forEach(id=>$(id).addEventListener("change",()=>{index=0;applyFilters();}));
$("searchInput").addEventListener("input",()=>{index=0;applyFilters();});
document.querySelectorAll(".rating").forEach(btn=>btn.addEventListener("click",()=>{
  const item=current();if(!item)return;
  progress[item.id]={rating:btn.dataset.rating,updatedAt:new Date().toISOString()};
  saveProgress();render();
}));
$("reviewOnlyBtn").addEventListener("click",()=>{reviewOnly=true;index=0;$("reviewOnlyBtn").classList.add("hidden");$("showAllBtn").classList.remove("hidden");applyFilters();});
$("showAllBtn").addEventListener("click",()=>{reviewOnly=false;index=0;$("reviewOnlyBtn").classList.remove("hidden");$("showAllBtn").classList.add("hidden");applyFilters();});
$("resetProgress").addEventListener("click",()=>{if(confirm("确定清除这台设备上的学习记录吗？")){progress={};saveProgress();render();}});
async function init(){
  try{
    const response=await fetch("words.json");
    if(!response.ok)throw new Error("词库加载失败");
    allItems=await response.json();filtered=[...allItems];populateFilters();$("showAllBtn").classList.add("hidden");render();
  }catch(e){
    $("emptyState").classList.remove("hidden");$("emptyState").textContent="词库暂时无法加载。请确认 words.json 与 index.html 位于同一目录，并通过 GitHub Pages 或本地静态服务器打开网页。";
    $("flashcard").classList.add("hidden");
  }
}
init();
