const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const LEVELS=['Very Bad','Bad','Good','Very Good'];
const COLORS=['#F45F82','#FFBE00','#00C995','#B83FF2'];
const BASE={breakfast:{start:'07:00',end:'10:00',veg:true,nonveg:false},lunch:{start:'12:00',end:'15:00',veg:true,nonveg:false},dinner:{start:'18:00',end:'21:00',veg:true,nonveg:true}};
const clone=(v)=>JSON.parse(JSON.stringify(v));
const read=(k,d)=>{try{const raw=localStorage.getItem(k);return raw===null?clone(d):JSON.parse(raw)}catch{return clone(d)}};
const escapeHTML=(value)=>String(value??'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
function normalizeConfig(raw){
 const out={schedule:clone(BASE),events:[]};
 if(raw&&typeof raw==='object'){
  for(const m of Object.keys(BASE)){
   const item=raw.schedule?.[m];
   if(item&&typeof item==='object') out.schedule[m]={start:/^\d{2}:\d{2}$/.test(item.start)?item.start:BASE[m].start,end:/^\d{2}:\d{2}$/.test(item.end)?item.end:BASE[m].end,veg:!!item.veg,nonveg:!!item.nonveg};
  }
  if(Array.isArray(raw.events)) out.events=raw.events.filter(e=>e&&typeof e==='object'&&Number.isInteger(e.day)&&e.day>=0&&e.day<=6&&['breakfast','lunch','dinner'].includes(e.meal)&&['veg','nonveg'].includes(e.cat)&&typeof e.id==='string').map(e=>({...e,active:e.active!==false}));
 }
 return out;
}
let cfg=normalizeConfig(read('tu_v23_cfg',{schedule:BASE,events:[]}));
let st={page:'home',day:new Date().getDay(),meal:'',cat:'',session:''};
const app=document.getElementById('app');
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){console.error('Local storage write failed',e);return false}}
function dayKey(d){return 'day_'+d}
function baseId(d,m,c){return `${dayKey(d)}_${m}_${c||'veg'}`}
function events(d,m){return cfg.events.filter(e=>e.day===d&&e.meal===m&&e.active)}
function categories(m,d){let normal=['veg','nonveg'].filter(c=>cfg.schedule[m][c]);let special=events(d,m).map(e=>e.cat);return [...new Set([...normal,...special])]}
function sessionId(d,m,c){let ev=events(d,m).find(e=>e.cat===c);return ev?ev.id:baseId(d,m,c)}
function getVotes(id){const v=read('tu_v23_votes_'+id,[]);return Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[]}
function addVotes(id,v){save('tu_v23_votes_'+id,v)}
function theme(){document.body.className=st.page==='rate'?'cosmic':st.page==='overall'?'aurora':''}
let appHistoryDepth=0;
function snapshot(){return {__unknownRatings:true,page:st.page,day:st.day,meal:st.meal,cat:st.cat,session:st.session,idx:appHistoryDepth}}
function go(p){
 st.page=p;appHistoryDepth++;
 try{history.pushState(snapshot(),'','#'+p)}catch(e){appHistoryDepth=Math.max(0,appHistoryDepth-1)}
 render();
}
function home(){
 st.meal='';st.cat='';st.session='';
 go('home');
}
function appBack(fallback){
 if(appHistoryDepth>0){history.back();return}
 if(fallback){st.page=fallback;render();return}
 st.page='home';st.meal='';st.cat='';st.session='';render();
}
window.addEventListener('popstate',e=>{
 if(e.state&&e.state.__unknownRatings){
  st.page=e.state.page||'home';
  st.day=Number.isInteger(e.state.day)?e.state.day:st.day;
  st.meal=e.state.meal||'';
  st.cat=e.state.cat||'';
  st.session=e.state.session||'';
  appHistoryDepth=Number.isInteger(e.state.idx)?Math.max(0,e.state.idx):0;
 }else{
  st.page='home';st.meal='';st.cat='';st.session='';appHistoryDepth=0;
 }
 render();
});
function weekday(){return DAYS[st.day]}
function dayNav(){return `<div class="days">${DAYS.map((d,i)=>`<button class="day ${i===st.day?'active':''}" data-day="${i}">${d}</button>`).join('')}</div>`}
function bindDays(){app.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{st.day=+b.dataset.day;render()})}
function getData(votes,key){
 let counts=[0,0,0,0],sum=0;
 votes.forEach(v=>{
  let n=Number(v[key]);
  if(Number.isInteger(n)&&n>=1&&n<=4){counts[n-1]++;sum+=n}
 });
 let total=counts.reduce((a,b)=>a+b,0);
 return {counts,total,avg:total?(sum/total).toFixed(1):'—'};
}
function derived(votes){
 // Quantity has been removed. Overall experience now reflects Taste ratings only.
 return votes.filter(v=>Number.isInteger(Number(v.taste))&&Number(v.taste)>=1&&Number(v.taste)<=4)
             .map(v=>({...v,overall:Number(v.taste)}));
}
function getPercentLabels(counts){
 const total=counts.reduce((a,b)=>a+b,0);
 if(!total)return counts.map(()=> '0%');
 // Round each category independently, matching the reference image. The
 // displayed values may add to 99% or 101% because each is rounded separately.
 return counts.map(n=>{
  if(!n)return '0%';
  const pct=n*100/total;
  const rounded=Math.round(pct);
  return rounded===0?'<1%':rounded+'%';
 });
}
function meter(data,title){
 // Sanitize counts once. Every meter (live Taste and all Overall cards)
 // uses this exact renderer so the geometry cannot diverge between pages.
 const source=Array.isArray(data&&data.counts)?data.counts:[];
 const counts=LEVELS.map((_,i)=>{
  const n=Number(source[i]??0);
  return Number.isFinite(n)&&n>0?Math.floor(n):0;
 });
 const total=counts.reduce((a,b)=>a+b,0);
 const labels=getPercentLabels(counts);
 const peakIndex=total?counts.indexOf(Math.max(...counts)):-1;
 const peakPct=total?Math.round(counts[peakIndex]*100/total):0;

 // Exact 180-degree upper semicircle. Each category gets a share of the
 // remaining arc after fixed black separators are reserved. Butt caps keep
 // the separators open instead of allowing rounded ends to collide.
 const cx=150,cy=130,r=105,stroke=20;
 const active=counts.map((n,i)=>({n,i,pct:total?n/total*100:0})).filter(x=>x.n>0);
 const gap=active.length>1?2.8:0;
 const usable=Math.max(0,180-gap*(active.length-1));
 const point=(deg)=>{
  const rad=deg*Math.PI/180;
  return [cx+r*Math.cos(rad),cy-r*Math.sin(rad)];
 };
 const arcPath=(from,to)=>{
  const [sx,sy]=point(from),[ex,ey]=point(to);
  const sweep=from-to;
  const large=sweep>180?1:0;
  // sweep-flag 1 draws the upper half in SVG screen coordinates (left to right).
  return `M ${sx.toFixed(3)} ${sy.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(3)} ${ey.toFixed(3)}`;
 };
 const track=arcPath(180,0);
 let cursor=180;
 const segments=active.map(({n,i,pct})=>{
  const sweep=usable*n/total;
  const from=cursor,to=cursor-sweep;
  cursor=to-gap;
  // Never discard a non-zero category: tiny percentages remain visible. Larger arcs use rounded ends; tiny slices use butt caps to avoid turning into oversized dots.
  const cap=pct>=2?'round':'butt';
  return `<path class="meter-segment" data-index="${i}" data-count="${n}" d="${arcPath(from,to)}" fill="none" stroke="${COLORS[i]}" stroke-width="${stroke}" stroke-linecap="${cap}" stroke-linejoin="round"/>`;
 }).join('');
 const center=total?`${peakPct}%`:'—';
 const voteText=`${total} ${total===1?'vote':'votes'}`;
 const safeTitle=String(title||'Rating').replace(/[&<>\"]/g,'');
 return `<div class="meter-layout"><div class="meter">
 <svg class="gauge" viewBox="10 5 280 155" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${safeTitle} meter: ${total?center:'no votes'}; ${voteText}" preserveAspectRatio="xMidYMid meet">
 <path class="meter-track" d="${track}" fill="none" stroke="#242424" stroke-width="${stroke}" stroke-linecap="butt"/>
 ${segments}
 <text x="150" y="104" text-anchor="middle" class="number" style="fill:${total?COLORS[peakIndex]:'#f5f5f5'}">${center}</text>
 <text x="150" y="126" text-anchor="middle" class="glabel" style="font-size:11px;letter-spacing:.02em;font-weight:500;fill:#c4c4c4">${voteText}</text>
 </svg></div>
 <div class="legend">${LEVELS.map((l,i)=>`<div class="legendline"><i class="dot" style="background:${COLORS[i]}"></i><span>${l}</span><b>${labels[i]}</b></div>`).join('')}</div></div>`;
}
function resultCard(title,subtitle,votes){let d=derived(votes);return `<section class="panel"><div class="row"><div><h2>${title}</h2><p>${subtitle}</p></div><span class="pill">${votes.length} ratings</span></div>${meter(getData(d,'overall'),title)}</section>`}
function renderHome(){theme();app.innerHTML=`<section class="hero"><div class="kicker">MESS EXPERIENCE</div><h1>How was the food?</h1><p>Choose a meal to rate it or explore the community's ratings.</p></section>${dayNav()}<div class="grid"><button class="tile" data-meal="breakfast"><span class="emoji">☀️</span><span><strong>Breakfast</strong><small>Rate & view results</small></span></button><button class="tile" data-meal="lunch"><span class="emoji">🥗</span><span><strong>Lunch</strong><small>Rate & view results</small></span></button><button class="tile" data-meal="dinner"><span class="emoji">🌙</span><span><strong>Dinner</strong><small>Veg / Non-Veg</small></span></button><button class="tile results" id="overall"><span class="emoji">✦</span><span><strong>Overall Ratings</strong><small>Five daily result meters</small></span></button></div>`;
 bindDays();app.querySelectorAll('[data-meal]').forEach(b=>b.onclick=()=>{st.meal=b.dataset.meal;let cats=categories(st.meal,st.day);if(st.meal!=='dinner'){st.cat=cats[0]||'veg';st.session=sessionId(st.day,st.meal,st.cat);go('rate')}else go('category')});document.getElementById('overall').onclick=()=>go('overall')}
function renderCategory(){theme();let cats=categories('dinner',st.day);app.innerHTML=`<button class="back" id="back">← All meals</button><div class="kicker">${weekday()} · DINNER</div><h1>Choose dinner type.</h1><div class="choicegrid">${cats.map(c=>`<button class="choice" data-cat="${c}"><span>${c==='veg'?'🥬':'🍗'}</span><h3>${c==='veg'?'Veg':'Non-Veg'}</h3><small>Open rating page</small></button>`).join('')||'<div class="empty">No dinner options scheduled for this weekday.</div>'}</div>`;document.getElementById('back').onclick=()=>appBack('home');app.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{st.cat=b.dataset.cat;st.session=sessionId(st.day,'dinner',st.cat);go('rate')})}
function renderRate(){theme();let votes=getVotes(st.session);let cats=st.meal==='dinner'?st.cat.toUpperCase():'';app.innerHTML=`<button class="back" id="back">← ${st.meal==='dinner'?'Dinner options':'All meals'}</button><div class="kicker">${weekday()} · ${st.meal.toUpperCase()} ${cats}</div><h1>Rate your meal.</h1><p>Current results update after each submitted rating.</p><section class="panel"><div class="row"><div><h2>Taste</h2><p>How did it taste?</p></div><span class="pill">LIVE METER</span></div>${meter(getData(votes,'taste'),'Taste')}</section><section class="panel"><h2>Submit your rating</h2><p>Choose one option to rate the taste.</p><form id="vote"><div class="rating"><b>Taste</b><div class="rating-buttons">${LEVELS.map((x,i)=>`<button type="button" class="rate" data-k="taste" data-v="${i+1}">${x}</button>`).join('')}</div></div><div class="review-box"><h3>Write a Review</h3><textarea id="reviewText" maxlength="1000" rows="4" placeholder="Write your review here..."></textarea><div class="review-meta"><span class="notice">Optional · Anonymous</span><span class="notice" id="reviewCount">0/1000</span></div></div><div class="row" style="margin-top:15px"><span class="notice">Anonymous demo · no account</span><button class="primary" id="send" disabled>Post</button></div></form></section>`;
 document.getElementById('back').onclick=()=>appBack(st.meal==='dinner'?'category':'home');let chosen={};const review=document.getElementById('reviewText');review.oninput=()=>{document.getElementById('reviewCount').textContent=review.value.length+'/1000'};app.querySelectorAll('.rate').forEach(b=>b.onclick=()=>{chosen[b.dataset.k]=+b.dataset.v;app.querySelectorAll(`[data-k="${b.dataset.k}"]`).forEach(x=>x.classList.toggle('selected',x===b));document.getElementById('send').disabled=!chosen.taste||alreadyVoted()});const voteKey='tu_v23_voted_'+st.session;
 const alreadyVoted=()=>{try{return localStorage.getItem(voteKey)==='1'}catch{return false}};
 if(alreadyVoted()){document.getElementById('send').disabled=true;document.getElementById('send').textContent='Already rated';app.querySelector('#vote .notice').textContent='A rating has already been submitted from this browser for this session.'}
 document.getElementById('vote').onsubmit=e=>{e.preventDefault();if(!chosen.taste||alreadyVoted())return;let v=getVotes(st.session);v.push({taste:chosen.taste,review:document.getElementById('reviewText').value.trim().slice(0,1000),at:Date.now()});if(!save('tu_v23_votes_'+st.session,v)){alert('Could not save this rating on this device.');return}try{localStorage.setItem(voteKey,'1')}catch{}renderRate();app.insertAdjacentHTML('afterbegin','<div class="pill" style="display:inline-block;margin-bottom:10px">Rating saved on this device.</div>')}}
function collect(d,m,c){return getVotes(sessionId(d,m,c))}
function renderOverall(){theme();let breakfast=collect(st.day,'breakfast','veg'),lunch=collect(st.day,'lunch','veg'),veg=collect(st.day,'dinner','veg'),nonveg=collect(st.day,'dinner','nonveg'),all=[...breakfast,...lunch,...veg,...nonveg];app.innerHTML=`<button class="back" id="back">← Home</button><div class="kicker">THE UNKNOWN · RESULTS</div><h1>Overall Ratings</h1><p>Five separate meters for the selected weekday. Overall experience is calculated from Taste ratings.</p>${dayNav()}${resultCard('Overall Experience','All meal submissions · '+weekday(),all)}${resultCard('Dinner · Veg','Vegetarian dinner · '+weekday(),veg)}${resultCard('Dinner · Non-Veg','Non-vegetarian dinner · '+weekday(),nonveg)}${resultCard('Lunch Overall','Lunch · '+weekday(),lunch)}${resultCard('Breakfast Overall','Breakfast · '+weekday(),breakfast)}`;document.getElementById('back').onclick=()=>appBack('home');bindDays()}
function renderAdmin(){theme();app.innerHTML=`<button class="back" id="back">← Home</button><div class="kicker">LOCAL DEMO ADMIN</div><h1>Admin studio</h1><p>Configure recurring meal options and one-off event sessions.</p><section class="panel"><h2>Weekly meal schedule</h2><div class="admin-grid">${['breakfast','lunch','dinner'].map(m=>`<div class="adminbox"><h3>${m[0].toUpperCase()+m.slice(1)}</h3><label>Opens</label><input class="field" type="time" id="${m}Start" value="${cfg.schedule[m].start}"><label>Closes</label><input class="field" type="time" id="${m}End" value="${cfg.schedule[m].end}"><label><input type="checkbox" id="${m}veg" ${cfg.schedule[m].veg?'checked':''}> Veg available</label><label><input type="checkbox" id="${m}nonveg" ${cfg.schedule[m].nonveg?'checked':''}> Non-Veg available</label></div>`).join('')}</div><button class="primary" id="saveSchedule" style="margin-top:14px">Save schedule</button></section><section class="panel"><h2>Temporary event session</h2><p>For a special event or a one-time meal change. This session overrides the matching meal/category for the selected weekday in this demo.</p><div class="admin-grid"><div class="adminbox"><label>Weekday</label><select class="field" id="evDay">${DAYS.map((d,i)=>`<option value="${i}">${d}</option>`).join('')}</select><label>Meal</label><select class="field" id="evMeal"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select><label>Category</label><select class="field" id="evCat"><option value="veg">Veg</option><option value="nonveg">Non-Veg</option></select></div><div class="adminbox"><label>Opening time</label><input class="field" type="time" id="evStart" value="12:00"><label>Closing time</label><input class="field" type="time" id="evEnd" value="15:00"><label>Event name</label><input class="field" id="evName" placeholder="Special event meal"></div></div><button class="primary" id="createEvent" style="margin-top:14px">Create temporary session</button><div id="eventList" style="margin-top:14px">${cfg.events.map((e,i)=>`<div class="row" style="padding:9px 0;border-bottom:1px solid var(--line)"><span>${escapeHTML(e.name||e.meal+' '+e.cat)} · ${DAYS[e.day]} · ${escapeHTML(e.start)}–${escapeHTML(e.end)}</span><button class="secondary" data-del="${i}">Remove</button></div>`).join('')||'<div class="empty">No temporary sessions.</div>'}</div></section><p class="notice">Prototype only: admin is not securely authenticated and data is stored in this browser. Live admin permissions and timed expiry need the backend.</p>`;
 document.getElementById('back').onclick=()=>appBack('home');document.getElementById('saveSchedule').onclick=()=>{['breakfast','lunch','dinner'].forEach(m=>cfg.schedule[m]={start:document.getElementById(m+'Start').value,end:document.getElementById(m+'End').value,veg:document.getElementById(m+'veg').checked,nonveg:document.getElementById(m+'nonveg').checked});save('tu_v23_cfg',cfg);alert('Schedule saved on this device.')};document.getElementById('createEvent').onclick=()=>{let day=+document.getElementById('evDay').value,meal=document.getElementById('evMeal').value,cat=document.getElementById('evCat').value,start=document.getElementById('evStart').value,end=document.getElementById('evEnd').value;if(!start||!end||end<=start)return alert('Please choose valid opening and closing times.');cfg.events.push({id:'event_'+Date.now(),day,meal,cat,start,end,name:document.getElementById('evName').value,active:true});save('tu_v23_cfg',cfg);renderAdmin();alert('Temporary session created.')};app.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{cfg.events.splice(+b.dataset.del,1);save('tu_v23_cfg',cfg);renderAdmin()})}
function render(){if(st.page==='home')renderHome();else if(st.page==='category')renderCategory();else if(st.page==='rate')renderRate();else if(st.page==='overall')renderOverall();else if(st.page==='admin')renderAdmin()}
if(location.hash==='#admin')st.page='admin';
appHistoryDepth=0;
try{history.replaceState(snapshot(),'','#'+st.page)}catch(e){}
render();
