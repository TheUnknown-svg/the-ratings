const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MEALS=['breakfast','lunch','dinner'];
const LEVELS=['Very Bad','Bad','Good','Very Good'];
const COLORS=['#F45F82','#FFBE00','#00C995','#B83FF2'];
const API_URL='https://vvgvjfghtkhnqvbhjqcb.supabase.co/functions/v1/unknown-ratings-api';
const AUTH_URL='https://vvgvjfghtkhnqvbhjqcb.supabase.co/auth/v1';
const API_KEY='sb_publishable_T_WBo0M8GVAE3Eo-bY6QQA_E1YX20vm';
const app=document.getElementById('app');
let schedules=[],events=[],pageVersion=0,poll=null,adminSession=null,connectionIssue='',overallRefresh=null;
const summaryCache=new Map(),summaryRequests=new Map();
const PUBLIC_CACHE_KEY='tu_v2_public_cache';
function restorePublicCache(){try{const x=JSON.parse(safeRead(PUBLIC_CACHE_KEY)||'null');if(x&&Date.now()-x.savedAt<86400000){schedules=x.schedules||[];events=x.events||[]}}catch{}}
function savePublicCache(){safeWrite(PUBLIC_CACHE_KEY,JSON.stringify({savedAt:Date.now(),schedules,events}))}
const ADMIN_HASH='#manage-7f3a9c2e';
let state={page:'home',day:currentBishkek().weekday,meal:'',category:'',session:null};
function currentBishkek(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bishkek',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(new Date());
 const v={};for(const p of parts)if(p.type!=='literal')v[p.type]=p.value;
 const date=v.year+'-'+v.month+'-'+v.day;
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 return {date,weekday};
}
function dateFor(day,offset=state.weekOffset||0){
 const now=currentBishkek(),d=new Date(now.date+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()-now.weekday+day+(offset*7));
 return d.toISOString().slice(0,10);
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeRead(k){try{return localStorage.getItem(k)}catch{return null}}
function safeWrite(k,v){try{localStorage.setItem(k,v);return true}catch{return false}}
function visitorToken(){
 let v=safeRead('tu_v2_visitor_token');
 if(!v||v.length<32){v=(crypto.randomUUID?.().replace(/-/g,'')||String(Math.random()).slice(2).repeat(4))+(crypto.randomUUID?.().replace(/-/g,'')||String(Math.random()).slice(2).repeat(4));safeWrite('tu_v2_visitor_token',v)}
 return v;
}
function adminStore(){try{const raw=sessionStorage.getItem('tu_v2_admin_session');return raw?JSON.parse(raw):null}catch{return null}}
function setAdminStore(v){adminSession=v;try{if(v)sessionStorage.setItem('tu_v2_admin_session',JSON.stringify(v));else sessionStorage.removeItem('tu_v2_admin_session')}catch{}}
adminSession=adminStore();
async function api(action,data={},token=null){
 const bearer=token||API_KEY,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const res=await fetch(API_URL,{method:'POST',cache:'no-store',credentials:'omit',signal:controller.signal,headers:{'Content-Type':'application/json','apikey':API_KEY,'Authorization':'Bearer '+bearer},body:JSON.stringify({action,...data})});
  let json={};try{json=await res.json()}catch{}
  if(!res.ok||json.success===false)throw new Error(json.error||'Request failed ('+res.status+')');
  return json;
 }catch(error){
  if(error.name==='AbortError')throw new Error('The ratings server took too long to respond. Please retry.');
  throw error;
 }finally{clearTimeout(timer)}
}
async function loadPublic(){
 connectionIssue='';
 try{
  const result=await api('public-data');
  schedules=result.schedule||[];
  events=result.events||[];
  savePublicCache();
 }catch{
  connectionIssue='Live data is temporarily unavailable. Please retry.';
 }
}
function schedule(day,meal){return schedules.find(x=>Number(x.weekday)===day&&x.meal===meal)||null}
function eventsFor(day,meal){const date=dateFor(day);return events.filter(e=>e.event_date===date&&e.meal===meal)}
function categoryOptions(day,meal){
 if(meal==='breakfast'||meal==='lunch')return ['all',...eventsFor(day,meal).map(e=>e.category)].filter((x,i,a)=>a.indexOf(x)===i);
 const s=schedule(day,meal),base=[];
 if(s?.veg_enabled)base.push('veg');
 if(s?.nonveg_enabled)base.push('nonveg');
 return [...new Set([...base,...eventsFor(day,meal).map(e=>e.category)])];
}
function sessionFor(day,meal,category){
 const event=eventsFor(day,meal).find(e=>e.category===category);
 return {rating_date:dateFor(day),meal,category,event_id:event?.id||null,event_name:event?.event_name||''};
}
function sessionKey(s){return s.event_id?'event_'+s.event_id:[s.rating_date,s.meal,s.category].join('_')}
function editRecord(s){try{return JSON.parse(safeRead('tu_v2_edit_'+sessionKey(s))||'null')}catch{return null}}
function saveEditRecord(s,r){safeWrite('tu_v2_edit_'+sessionKey(s),JSON.stringify(r))}
function counts(summary){return [summary?.very_bad,summary?.bad,summary?.good,summary?.very_good].map(n=>Math.max(0,Math.floor(Number(n)||0)))}
function total(c){return c.reduce((a,b)=>a+b,0)}
function dataFromCounts(c){return {counts:c,total:total(c)}}
function sumSummaries(arr){const c=[0,0,0,0];arr.forEach(s=>counts(s).forEach((n,i)=>c[i]+=n));return dataFromCounts(c)}
async function getSummary(s,force=false){
 const key=sessionKey(s),cached=summaryCache.get(key);
 if(!cached){try{const disk=JSON.parse(safeRead('tu_v2_summary_'+key)||'null');if(disk?.value)summaryCache.set(key,disk)}catch{}}
 const current=summaryCache.get(key);
 if(summaryRequests.has(key))return summaryRequests.get(key);
 if(!force&&current&&Date.now()-current.at<8000)return current.value;
 const payload=s.event_id?{event_id:s.event_id}:{rating_date:s.rating_date,meal:s.meal,category:s.category};
 const request=api('rating-summary',payload).then(r=>{
  const value=r.summary||{total_ratings:0,very_bad:0,bad:0,good:0,very_good:0};
  const entry={at:Date.now(),value};summaryCache.set(key,entry);safeWrite('tu_v2_summary_'+key,JSON.stringify(entry));return value;
 }).finally(()=>{if(summaryRequests.get(key)===request)summaryRequests.delete(key)});
 summaryRequests.set(key,request);return request;
}
async function getSummaries(sessions,force=false){
 const values=new Array(sessions.length),missing=[];
 sessions.forEach((s,i)=>{
  const key=sessionKey(s),pending=summaryRequests.get(key);
  if(pending){values[i]=pending;return}
  let cached=summaryCache.get(key);
  if(!cached){try{const disk=JSON.parse(safeRead('tu_v2_summary_'+key)||'null');if(disk?.value){cached=disk;summaryCache.set(key,disk)}}catch{}}
  if(!force&&cached&&Date.now()-cached.at<8000){values[i]=cached.value;return}
  missing.push({i,s,key});
 });
 if(missing.length){
  try{
   const response=await api('rating-summaries',{sessions:missing.map(({s})=>s.event_id?{event_id:s.event_id}:{rating_date:s.rating_date,meal:s.meal,category:s.category})});
   const rows=Array.isArray(response.summaries)?response.summaries:[];
   missing.forEach(({i,key},j)=>{
    const item=rows[j];
    if(item?.success){
     const value=item.summary||{total_ratings:0,very_bad:0,bad:0,good:0,very_good:0};
     values[i]=value;
     const entry={at:Date.now(),value};summaryCache.set(key,entry);
     safeWrite('tu_v2_summary_'+key,JSON.stringify(entry));
    }else values[i]=null;
   });
  }catch{missing.forEach(({i})=>values[i]=null)}
 }
 return Promise.all(values.map(async value=>{try{return await value}catch{return null}}));
}

function paintMeter(panel,summary){
 if(!panel?.isConnected)return;
 const holder=document.createElement('div');
 holder.innerHTML=meter({counts:counts(summary)},'Taste');
 const fresh=holder.querySelector('svg.gauge'),current=panel.querySelector('svg.gauge');
 if(fresh&&current){
  const nextPaths=fresh.querySelectorAll('.meter-segment'),oldPaths=current.querySelectorAll('.meter-segment');
  nextPaths.forEach((next,i)=>{
   const old=oldPaths[i];if(!old)return;
   const targetStart=Number(next.getAttribute('data-start')||180),targetEnd=Number(next.getAttribute('data-end')||180);
   const fromStart=Number(old.getAttribute('data-start')??targetStart),fromEnd=Number(old.getAttribute('data-end')??targetEnd);
   ['stroke','stroke-width','opacity','stroke-linecap'].forEach(attr=>old.setAttribute(attr,next.getAttribute(attr)||''));
   old.setAttribute('data-count',next.getAttribute('data-count')||'0');
   if(old._meterFrame)cancelAnimationFrame(old._meterFrame);
   const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   if(!reduced&&typeof requestAnimationFrame==='function'){
    const started=performance.now(),duration=420;
    const animate=now=>{
     if(!old.isConnected){old._meterFrame=0;return}
     const progress=Math.min(1,(now-started)/duration),eased=1-Math.pow(1-progress,3);
     const a=fromStart+(targetStart-fromStart)*eased,b=fromEnd+(targetEnd-fromEnd)*eased;
     old.setAttribute('d',meterArcPath(a,b));
     old.setAttribute('data-start',String(a));old.setAttribute('data-end',String(b));
     if(progress<1)old._meterFrame=requestAnimationFrame(animate);
     else{old._meterFrame=0;old.setAttribute('d',next.getAttribute('d')||'');old.setAttribute('data-start',String(targetStart));old.setAttribute('data-end',String(targetEnd))}
    };
    old._meterFrame=requestAnimationFrame(animate);
   }else{
    old.setAttribute('d',next.getAttribute('d')||'');
    old.setAttribute('data-start',String(targetStart));old.setAttribute('data-end',String(targetEnd));
   }
  });
  current.setAttribute('aria-label',fresh.getAttribute('aria-label')||'');
  const nextTexts=fresh.querySelectorAll('text'),oldTexts=current.querySelectorAll('text');
  nextTexts.forEach((node,i)=>{if(oldTexts[i]){oldTexts[i].textContent=node.textContent;oldTexts[i].setAttribute('style',node.getAttribute('style')||'')}});
  const nextLegend=holder.querySelectorAll('.legendline b'),oldLegend=panel.querySelectorAll('.legendline b');
  nextLegend.forEach((node,i)=>{if(oldLegend[i])oldLegend[i].textContent=node.textContent});
 }else{panel.innerHTML=holder.innerHTML}
}

function setTheme(){document.body.className=state.page==='rate'?'cosmic':state.page==='overall'?'aurora':''}
let historyDepth=0;
function snap(){return {tuRatings:true,page:state.page,day:state.day,meal:state.meal,category:state.category,depth:historyDepth}}
function go(p){state.page=p;historyDepth++;try{history.pushState(snap(),'',p==='admin'?ADMIN_HASH:'#'+p)}catch{historyDepth=Math.max(0,historyDepth-1)}render()}
function back(fallback){if(historyDepth>0){history.back();return}state.page=fallback||'home';render()}
window.addEventListener('popstate',e=>{
 if(e.state?.tuRatings){state.page=e.state.page||'home';state.day=e.state.day??state.day;state.meal=e.state.meal||'';state.category=e.state.category||'';historyDepth=Math.max(0,e.state.depth||0)}
 else{state.page='home';state.meal='';state.category='';historyDepth=0}
 render();
});
function dayNav(){
 return '<nav class="days" aria-label="Choose weekday">'+DAYS.map((d,i)=>'<button type="button" class="day '+(i===state.day?'active':'')+'" data-day="'+i+'" aria-pressed="'+(i===state.day?'true':'false')+'">'+d.slice(0,3)+'</button>').join('')+'</nav>';
}
function bindDays(){
 app.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{state.day=Number(b.dataset.day);render()});

}
function bindBack(fallback){const b=document.getElementById('back');if(b)b.onclick=()=>back(fallback)}
function resultCard(title,subtitle,summary,key){
 const c=Array.isArray(summary?.counts)?summary.counts:counts(summary);
 return '<section class="panel result-card" data-result-card="'+esc(key||'')+'"><div class="result-heading"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><span class="pill">'+total(c)+' ratings</span></div>'+meter({counts:c},title)+'</section>';
}
function renderHome(){
 setTheme();
 app.innerHTML='<section class="hero"><div class="kicker">MESS EXPERIENCE</div><h1>How was the food?</h1><p>Choose a meal to rate it or explore the community\'s ratings.</p></section>'+dayNav()+
 '<div class="grid"><button class="tile" data-meal="breakfast"><span class="emoji">☀️</span><span><strong>Breakfast</strong><small>Rate & view results</small></span></button><button class="tile" data-meal="lunch"><span class="emoji">🥗</span><span><strong>Lunch</strong><small>Rate & view results</small></span></button><button class="tile" data-meal="dinner"><span class="emoji">🌙</span><span><strong>Dinner</strong><small>Veg / Non-Veg</small></span></button><button class="tile results" id="overall"><span class="emoji">✦</span><span><strong>Overall Ratings</strong><small>Five daily result meters</small></span></button></div>'+(connectionIssue?'<div class="empty connection-warning" role="status">'+esc(connectionIssue)+' <button class="secondary" id="retryPublic">Retry</button></div>':'<div class="notice live-note">Live community ratings</div>');
 bindDays();
 app.querySelectorAll('[data-meal]').forEach(b=>b.onclick=()=>{state.meal=b.dataset.meal;const cats=categoryOptions(state.day,state.meal);if(state.meal==='dinner')go('category');else{state.category=cats[0]||'all';go('rate')}});
 document.getElementById('overall').onclick=()=>go('overall');const retry=document.getElementById('retryPublic');if(retry)retry.onclick=()=>{retry.disabled=true;retry.textContent='Retrying…';loadPublic().then(render).catch(()=>render())};
}
function renderCategory(){
 setTheme();const cats=categoryOptions(state.day,'dinner');
 app.innerHTML='<button class="back" id="back">← All meals</button><div class="kicker">'+DAYS[state.day]+' · DINNER</div><h1>Choose dinner type.</h1><div class="choicegrid">'+(cats.map(c=>'<button class="choice" data-cat="'+esc(c)+'"><span>'+(c==='veg'?'🥬':'🍗')+'</span><h3>'+(c==='veg'?'Veg':'Non-Veg')+'</h3><small>Open rating page</small></button>').join('')||'<div class="empty">No dinner options scheduled for this weekday.</div>')+'</div>';
 bindBack('home');app.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.category=b.dataset.cat;go('rate')});
}
async function renderRate(){
 setTheme();const id=++pageVersion,s=sessionFor(state.day,state.meal,state.category);let saved=editRecord(s);
 let cachedSummary=summaryCache.get(sessionKey(s));
  if(!cachedSummary){try{cachedSummary=JSON.parse(safeRead('tu_v2_summary_'+sessionKey(s))||'null');if(cachedSummary?.value)summaryCache.set(sessionKey(s),cachedSummary)}catch{}}
  let liveCounts=counts(cachedSummary?.value||{});
 const meterPanel='<section class="panel" id="liveMeter"><div class="row"><div><h2>Taste</h2><p>How did it taste?</p></div><span class="pill">LIVE METER</span></div>'+meter({counts:liveCounts},'Taste')+'</section>';
 const head='<button class="back" id="back">← '+(state.meal==='dinner'?'Dinner options':'All meals')+'</button><div class="kicker">'+DAYS[state.day]+' · '+state.meal.toUpperCase()+' '+(state.meal==='dinner'?state.category.toUpperCase():'')+'</div><h1>Rate your meal.</h1>';
 let savedRecord=saved;
 const existing=Number(savedRecord?.taste_rating)||0,reviewText=savedRecord?.review||'';
  const savedNotice=savedRecord?'<section class="panel edit-saved" id="savedNotice"><div class="row"><div><h2>Your rating is saved</h2><p>You can change your choice or review at any time from this device.</p></div><span class="pill">SAVED</span></div><button class="secondary edit-trigger" id="editToggle" type="button">✎ Edit my rating</button></section>':'';
  app.innerHTML=head+meterPanel+savedNotice+'<section class="panel" id="votePanel" '+(savedRecord?'hidden':'')+'><h2>'+(savedRecord?'Edit your rating':'Submit your rating')+'</h2><p>Choose one of the four options.</p><form id="vote"><div class="rating"><b>Taste</b><div class="rating-buttons">'+LEVELS.map((x,i)=>'<button type="button" class="rate '+(existing===i+1?'selected':'')+'" data-v="'+(i+1)+'">'+x+'</button>').join('')+'</div></div><div class="review-box"><h3>Write a Review</h3><textarea id="reviewText" maxlength="500" rows="4" placeholder="Write your review here...">'+esc(reviewText)+'</textarea><div class="review-meta"><span class="notice">Optional · Anonymous</span><span class="notice" id="reviewCount">'+reviewText.length+'/500</span></div></div><div class="row" style="margin-top:15px"><span class="notice">Edit access is private and saved on this device.</span><button type="button" class="primary" id="send" '+(!existing?'disabled':'')+'>'+(savedRecord?'Update my rating':'Post rating')+'</button></div><div id="message" class="notice" role="status" style="margin-top:10px"></div></form></section>';
  const bindEditToggle=()=>{const toggle=document.getElementById('editToggle');if(toggle)toggle.onclick=()=>{document.getElementById('votePanel').hidden=false;toggle.hidden=true;};};
  bindEditToggle();
 bindBack(state.meal==='dinner'?'category':'home');
 let chosen=existing;const review=document.getElementById('reviewText');
 review.oninput=()=>document.getElementById('reviewCount').textContent=review.value.length+'/500';
 app.querySelectorAll('.rate').forEach(b=>b.onclick=()=>{chosen=Number(b.dataset.v);app.querySelectorAll('.rate').forEach(x=>x.classList.toggle('selected',x===b));document.getElementById('send').disabled=false});
 document.getElementById('vote').onsubmit=e=>e.preventDefault();
  document.getElementById('send').addEventListener('click',async()=>{if(!chosen)return;
  const btn=document.getElementById('send'),msg=document.getElementById('message');btn.disabled=true;btn.textContent=savedRecord?'Updating…':'Posting…';
  const beforeCounts=liveCounts.slice(),previous=Number(savedRecord?.taste_rating)||0;
  if(previous>0)liveCounts[previous-1]=Math.max(0,liveCounts[previous-1]-1);
  liveCounts[chosen-1]++;
  const optimisticSummary={total_ratings:total(liveCounts),very_bad:liveCounts[0],bad:liveCounts[1],good:liveCounts[2],very_good:liveCounts[3]};
  paintMeter(app.querySelector('#liveMeter'),optimisticSummary);
  try{
   const reviewValue=review.value.trim();
   let nextRecord,serverSummary=null;
    if(savedRecord?.edit_token){
     const result=await api('edit-rating',{edit_token:savedRecord.edit_token,taste_rating:chosen,review:reviewValue});
     serverSummary=result.summary||null;
     nextRecord={...savedRecord,taste_rating:chosen,review:reviewValue};
    }else{
     const result=await api('submit-rating',{visitor_token:visitorToken(),rating_date:s.rating_date,meal:s.meal,category:s.category,taste_rating:chosen,review:reviewValue,event_id:s.event_id||undefined});
     serverSummary=result.summary||null;
     nextRecord={edit_token:result.edit_token,taste_rating:chosen,review:reviewValue};
    }
    saveEditRecord(s,nextRecord);savedRecord=nextRecord;
    if(serverSummary)liveCounts=counts(serverSummary);
    const nextSummary=serverSummary||{total_ratings:total(liveCounts),very_bad:liveCounts[0],bad:liveCounts[1],good:liveCounts[2],very_good:liveCounts[3]};
    summaryCache.set(sessionKey(s),{at:Date.now(),value:nextSummary});
    safeWrite('tu_v2_summary_'+sessionKey(s),JSON.stringify({at:Date.now(),value:nextSummary}));
    paintMeter(app.querySelector('#liveMeter'),nextSummary);
   const summaryKey=sessionKey(s);
   summaryRequests.delete(summaryKey);
   getSummary(s,true).then(authoritative=>{
    if(id!==pageVersion||state.page!=='rate')return;
    liveCounts=counts(authoritative);
    paintMeter(app.querySelector('#liveMeter'),authoritative);
   }).catch(()=>{});
   msg.textContent='Saved — your rating meter has been updated.';
   btn.textContent='Update my rating';btn.disabled=false;
  }catch(err){liveCounts=beforeCounts;paintMeter(app.querySelector('#liveMeter'),{total_ratings:total(liveCounts),very_bad:liveCounts[0],bad:liveCounts[1],good:liveCounts[2],very_good:liveCounts[3]});msg.textContent=err.message||'Unable to submit rating.';btn.disabled=false;btn.textContent=savedRecord?'Update rating':'Post'}
 });
 // Show the form immediately; refresh only the meter after the live summary arrives.
 getSummary(s,false).then(summary=>{
  if(id!==pageVersion)return;
  liveCounts=counts(summary);
  paintMeter(app.querySelector('#liveMeter'),summary);
 }).catch(()=>{
  const panel=app.querySelector('#liveMeter');
  if(panel&&!panel.querySelector('.meter'))panel.innerHTML='<div class="notice">Live ratings could not be loaded. Your rating form is still available.</div>';
 });
}
async function renderOverall(){
 setTheme();const id=++pageVersion;
 const heading='<div class="kicker">THE UNKNOWN · RESULTS</div><h1>Overall Ratings</h1><p>Community ratings for the selected weekday.</p>';
 app.innerHTML='<button class="back" id="back">← Home</button>'+heading+dayNav()+'<div class="empty">Preparing live results…</div>';
 bindBack('home');bindDays();
 const date=dateFor(state.day);
 const regular=[
  {rating_date:date,meal:'breakfast',category:'all',event_id:null},
  {rating_date:date,meal:'lunch',category:'all',event_id:null},
  {rating_date:date,meal:'dinner',category:'veg',event_id:null},
  {rating_date:date,meal:'dinner',category:'nonveg',event_id:null}
 ];
 const dayEvents=events.filter(e=>e.event_date===date);
 const sessions=[...regular,...dayEvents.map(e=>({event_id:e.id}))];
 const results=sessions.map(()=>({total_ratings:0,very_bad:0,bad:0,good:0,very_good:0}));
 const groups={breakfast:[0],lunch:[1],veg:[2],nonveg:[3],overall:sessions.map((_,i)=>i)};
 dayEvents.forEach((event,i)=>{
  const index=i+4;
  if(event.meal==='breakfast')groups.breakfast.push(index);
  else if(event.meal==='lunch')groups.lunch.push(index);
  else if(event.meal==='dinner'&&event.category==='veg')groups.veg.push(index);
  else if(event.meal==='dinner'&&event.category==='nonveg')groups.nonveg.push(index);
 });
 const sumGroup=key=>sumSummaries(groups[key].map(i=>results[i]));
 const paintCard=key=>{
  const panel=app.querySelector('[data-result-card="'+key+'"]');
  if(!panel)return;
  const summary=sumGroup(key);
  paintMeter(panel,summary);
  const pill=panel.querySelector('.pill');
  if(pill)pill.textContent=summary.total_ratings+' ratings';
 };
 const paintCards=()=>['overall','veg','nonveg','lunch','breakfast'].forEach(paintCard);
 const setStatus=failed=>{
  const node=document.getElementById('resultsStatus');if(!node)return;
  node.innerHTML=failed?'<span>'+failed+' result '+(failed===1?'request':'requests')+' could not be loaded. Other meters remain available.</span> <button type="button" class="secondary" id="retryResults">Retry</button>':'';
  const retry=document.getElementById('retryResults');
  if(retry)retry.onclick=()=>{retry.disabled=true;retry.textContent='Retrying…';summaryCache.clear();summaryRequests.clear();sessions.forEach(session=>{try{localStorage.removeItem('tu_v2_summary_'+sessionKey(session))}catch{}});renderOverall()};
 };
 const zero={total_ratings:0,very_bad:0,bad:0,good:0,very_good:0};
 app.innerHTML='<button class="back" id="back">← Home</button>'+heading+dayNav()+
 '<div class="results-summary"><span class="results-day">'+DAYS[state.day]+'</span><span> · Selected menu day</span></div>'+
 '<div id="resultsStatus" class="results-status" role="status" aria-live="polite"></div>'+
 '<div class="results-grid">'+
 resultCard('Overall Experience','All meals and dinner categories',zero,'overall')+
 resultCard('Dinner · Veg','Vegetarian dinner',zero,'veg')+
 resultCard('Dinner · Non-Veg','Non-vegetarian dinner',zero,'nonveg')+
 resultCard('Lunch Overall','Lunch ratings',zero,'lunch')+
 resultCard('Breakfast Overall','Breakfast ratings',zero,'breakfast')+
 '</div>';
 bindBack('home');bindDays();paintCards();
 const loaded=await getSummaries(sessions);
 if(id!==pageVersion||state.page!=='overall')return;
 loaded.forEach((summary,i)=>{if(summary)results[i]=summary});
 paintCards();
 setStatus(loaded.filter(x=>!x).length);
 let refreshing=false;
 overallRefresh=async()=>{
  if(refreshing||id!==pageVersion||state.page!=='overall')return;
  refreshing=true;
  try{
   const refreshed=await getSummaries(sessions,true);
   if(id!==pageVersion||state.page!=='overall')return;
   refreshed.forEach((summary,i)=>{if(summary)results[i]=summary});
   paintCards();
   setStatus(refreshed.filter(x=>!x).length);
  }finally{refreshing=false}
 };
}
async function verifyAdmin(){
 if(!adminSession?.access_token)return false;
 try{const r=await api('admin-check',{},adminSession.access_token);return !!r.is_admin}
 catch{setAdminStore(null);return false}
}
function renderAdminLogin(error=''){
 setTheme();
 app.innerHTML='<button class="back" id="back">← Home</button><div class="kicker">SECURE ADMINISTRATION</div><h1>Admin sign in.</h1><section class="panel"><p>Use the administrator account created in Supabase Authentication.</p><form id="adminLogin"><label>Email</label><input class="field" id="adminEmail" type="email" autocomplete="username" required><label style="display:block;margin-top:12px">Password</label><input class="field" id="adminPassword" type="password" autocomplete="current-password" required><button class="primary" id="loginButton" style="margin-top:15px">Sign in</button><p id="loginError" class="notice" role="alert" style="margin-top:12px">'+esc(error)+'</p></form></section>';
 bindBack('home');
 document.getElementById('adminLogin').onsubmit=async e=>{
  e.preventDefault();const btn=document.getElementById('loginButton'),errorNode=document.getElementById('loginError');btn.disabled=true;btn.textContent='Signing in…';
  try{
   const res=await fetch(AUTH_URL+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json','apikey':API_KEY},body:JSON.stringify({email:document.getElementById('adminEmail').value.trim(),password:document.getElementById('adminPassword').value})});
   const session=await res.json();if(!res.ok)throw new Error(session.msg||session.message||'Sign in failed');
   setAdminStore(session);if(!await verifyAdmin())throw new Error('This account is not on the administrator allow-list.');
   await renderAdmin();
  }catch(error){setAdminStore(null);errorNode.textContent=error.message||'Unable to sign in';btn.disabled=false;btn.textContent='Sign in'}
 };
}
function timeValue(v){return String(v||'').slice(0,5)}
async function renderAdmin(){
 setTheme();const ok=await verifyAdmin();if(!ok){renderAdminLogin();return}
 const id=++pageVersion;
 app.innerHTML='<div class="kicker">SECURE ADMINISTRATION</div><h1>Admin studio</h1><div class="empty">Loading settings…</div>';
 let s,e;try{[s,e]=await Promise.all([api('weekly-schedule',{},adminSession.access_token),api('active-events',{},adminSession.access_token)])}
 catch(err){app.innerHTML='<div class="empty">'+esc(err.message)+'</div><button class="secondary" id="adminRetry">Retry</button>';document.getElementById('adminRetry').onclick=renderAdmin;return}
 if(id!==pageVersion)return;schedules=s.schedule||[];events=e.events||[];
 const scheduleFields=DAYS.map((day,d)=>'<section class="panel"><h2>'+day+'</h2><div class="admin-grid">'+MEALS.map(m=>{
  const item=schedules.find(x=>Number(x.weekday)===d&&x.meal===m)||{opens_at:'07:00:00',closes_at:'10:00:00',veg_enabled:true,nonveg_enabled:false};
  return '<div class="adminbox" data-schedule="'+d+'-'+m+'"><h3>'+m[0].toUpperCase()+m.slice(1)+'</h3><label>Opens</label><input class="field" type="time" id="open-'+d+'-'+m+'" value="'+timeValue(item.opens_at)+'"><label>Closes</label><input class="field" type="time" id="close-'+d+'-'+m+'" value="'+timeValue(item.closes_at)+'"><label><input type="checkbox" id="veg-'+d+'-'+m+'" '+(item.veg_enabled?'checked':'')+'> Veg enabled</label><label><input type="checkbox" id="nonveg-'+d+'-'+m+'" '+(item.nonveg_enabled?'checked':'')+'> Non-Veg enabled</label></div>'
 }).join('')+'</div></section>').join('');
 app.innerHTML='<div class="row"><div><div class="kicker">SECURE ADMINISTRATION</div><h1>Admin studio</h1></div><button class="secondary" id="logout">Sign out</button></div>'+
 '<section class="panel"><h2>Weekly meal schedule</h2><p>Changes are saved to Supabase and apply to the live site. Ratings stay open 24/7; opening and closing times are informational only.</p><form id="scheduleForm">'+scheduleFields+'<button class="primary" id="saveSchedule">Save all 21 schedule entries</button><span class="notice" id="scheduleMsg" role="status"></span></form></section>'+
 '<section class="panel"><h2>Temporary event session</h2><p>Create a dated one-time meal session. Ratings stay open 24/7 on the event date. Existing ratings remain attached if an event is deactivated.</p><form id="eventForm"><div class="admin-grid"><div class="adminbox"><label>Date</label><input class="field" id="eventDate" type="date" required><label>Meal</label><select class="field" id="eventMeal"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select><label>Category</label><select class="field" id="eventCategory"><option value="all">All</option><option value="veg">Veg</option><option value="nonveg">Non-Veg</option></select></div><div class="adminbox"><label>Event name</label><input class="field" id="eventName" maxlength="150" placeholder="Special event"><label>Opens</label><input class="field" id="eventOpen" type="time" value="12:00" required><label>Closes</label><input class="field" id="eventClose" type="time" value="15:00" required></div></div><button class="primary" id="saveEvent" style="margin-top:14px">Create event</button><span class="notice" id="eventMsg" role="status"></span></form><div id="eventsList" style="margin-top:16px">'+(events.map(ev=>'<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)"><span>'+esc(ev.event_name||ev.meal)+' · '+esc(ev.event_date)+' · '+esc(ev.category)+' · '+esc(timeValue(ev.opens_at))+'–'+esc(timeValue(ev.closes_at))+'</span><button class="secondary" data-event-delete="'+esc(ev.id)+'">Deactivate</button></div>').join('')||'<div class="empty">No active temporary events.</div>')+'</div></section>'+
 '<p class="notice">Administrator access is verified by Supabase Auth and the server-side admin_users allow-list. Never share your admin password or edit token.</p>';
 document.getElementById('logout').onclick=()=>{setAdminStore(null);renderAdminLogin()};
 document.getElementById('scheduleForm').onsubmit=async ev=>{
  ev.preventDefault();const btn=document.getElementById('saveSchedule'),msg=document.getElementById('scheduleMsg');btn.disabled=true;msg.textContent='Saving…';
  const rows=[];for(let d=0;d<7;d++)for(const m of MEALS){const o=document.getElementById('open-'+d+'-'+m).value,c=document.getElementById('close-'+d+'-'+m).value;if(!o||!c||o>=c){msg.textContent='Check opening and closing times for '+DAYS[d]+' '+m+'.';btn.disabled=false;return}rows.push({weekday:d,meal:m,opens_at:o,closes_at:c,veg_enabled:document.getElementById('veg-'+d+'-'+m).checked,nonveg_enabled:document.getElementById('nonveg-'+d+'-'+m).checked})}
  try{await api('admin-save-schedule',{schedule:rows},adminSession.access_token);msg.textContent='Saved successfully.';await loadPublic()}catch(err){msg.textContent=err.message}finally{btn.disabled=false}
 };
 document.getElementById('eventForm').onsubmit=async ev=>{
  ev.preventDefault();const btn=document.getElementById('saveEvent'),msg=document.getElementById('eventMsg');btn.disabled=true;msg.textContent='Saving…';
  const meal=document.getElementById('eventMeal').value,category=document.getElementById('eventCategory').value;
  if((meal==='breakfast'||meal==='lunch')&&category!=='all'){msg.textContent='Breakfast and lunch events must use All.';btn.disabled=false;return}
  if(meal==='dinner'&&category==='all'){msg.textContent='Dinner events must use Veg or Non-Veg.';btn.disabled=false;return}
  try{await api('admin-save-event',{event_date:document.getElementById('eventDate').value,meal,category,event_name:document.getElementById('eventName').value,opens_at:document.getElementById('eventOpen').value,closes_at:document.getElementById('eventClose').value},adminSession.access_token);msg.textContent='Event created.';await renderAdmin()}catch(err){msg.textContent=err.message;btn.disabled=false}
 };
 app.querySelectorAll('[data-event-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Deactivate this event? Existing ratings will be preserved.'))return;b.disabled=true;try{await api('admin-delete-event',{id:b.dataset.eventDelete},adminSession.access_token);await renderAdmin()}catch(err){alert(err.message);b.disabled=false}});
}
function render(){
 if(poll){clearInterval(poll);poll=null}
 if(state.page==='home')renderHome();
 else if(state.page==='category')renderCategory();
 else if(state.page==='rate'){renderRate();poll=setInterval(()=>{if(document.visibilityState==='visible'&&state.page==='rate')refreshRateMeter()},20000)}
 else if(state.page==='overall'){renderOverall();poll=setInterval(()=>{if(document.visibilityState==='visible'&&state.page==='overall'&&overallRefresh)overallRefresh()},30000)}
 else if(state.page==='admin')renderAdmin();
}
async function refreshRateMeter(){
  const s=sessionFor(state.day,state.meal,state.category);try{const r=await getSummary(s,true);paintMeter(app.querySelector('#liveMeter'),r)}catch{}
 }
if(location.hash===ADMIN_HASH)state.page='admin';
historyDepth=0;try{history.replaceState(snap(),'',state.page==='admin'?ADMIN_HASH:'#'+state.page)}catch{}
restorePublicCache();
render();
loadPublic().then(()=>{if(state.page==='home'||state.page==='category')render()}).catch(()=>{});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.page==='rate')refreshRateMeter()});

function getPercentLabels(counts){
 const total=counts.reduce((a,b)=>a+b,0);
 if(!total)return counts.map(()=> '0%');
 return counts.map(n=>{
  if(!n)return '0%';
  const rounded=Math.round(n*100/total);
  return rounded===0?'<1%':rounded+'%';
 });
}
function meterArcPath(from,to){
 const cx=150,cy=130,r=105;
 const point=deg=>{
  const rad=deg*Math.PI/180;
  return [cx+r*Math.cos(rad),cy-r*Math.sin(rad)];
 };
 const [sx,sy]=point(from),[ex,ey]=point(to);
 const sweep=from-to,large=sweep>180?1:0;
 return `M ${sx.toFixed(3)} ${sy.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(3)} ${ey.toFixed(3)}`;
}
function meter(data,title){
 const source=Array.isArray(data&&data.counts)?data.counts:[];
 const safeCounts=LEVELS.map((_,i)=>{
  const n=Number(source[i]??0);
  return Number.isFinite(n)&&n>0?Math.floor(n):0;
 });
 const totalVotes=safeCounts.reduce((a,b)=>a+b,0);
 const labels=getPercentLabels(safeCounts);
 const peakIndex=totalVotes?safeCounts.indexOf(Math.max(...safeCounts)):-1;
 const peakPct=totalVotes?Math.round(safeCounts[peakIndex]*100/totalVotes):0;
 const cx=150,cy=130,r=105,stroke=20;
 const activeCount=safeCounts.filter(n=>n>0).length;
 const gap=activeCount>1?2.8:0;
 const usable=Math.max(0,180-gap*(activeCount-1));
 const track=meterArcPath(180,0);
 let cursor=180;
 const segments=safeCounts.map((n,i)=>{
  const sweep=totalVotes&&n?usable*n/totalVotes:0;
  const start=cursor,end=cursor-sweep,d=meterArcPath(start,end);
  if(n)cursor=end-gap;
  return `<path class="meter-segment" data-index="${i}" data-count="${n}" data-start="${start}" data-end="${end}" d="${d}" fill="none" stroke="${COLORS[i]}" stroke-width="${stroke}" stroke-linecap="butt" stroke-linejoin="round" opacity="${n?1:0}"/>`;
 }).join('');
 const center=totalVotes?`${peakPct}%`:'—';
 const voteText=`${totalVotes} ${totalVotes===1?'vote':'votes'}`;
 const safeTitle=String(title||'Rating').replace(/[&<>"]/g,'');
 return `<div class="meter-layout"><div class="meter">
 <svg class="gauge" viewBox="10 5 280 155" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${safeTitle} meter: ${totalVotes?center:'no votes'}; ${voteText}" preserveAspectRatio="xMidYMid meet">
 <path class="meter-track" d="${track}" fill="none" stroke="#242424" stroke-width="${stroke}" stroke-linecap="butt"/>
 ${segments}
 <text x="150" y="104" text-anchor="middle" class="number" style="fill:${totalVotes?COLORS[peakIndex]:'#f5f5f5'}">${center}</text>
 <text x="150" y="126" text-anchor="middle" class="glabel" style="font-size:11px;letter-spacing:.02em;font-weight:500;fill:#c4c4c4">${voteText}</text>
 </svg></div>
 <div class="legend">${LEVELS.map((l,i)=>`<div class="legendline"><i class="dot" style="background:${COLORS[i]}"></i><span>${l}</span><b>${labels[i]}</b></div>`).join('')}</div></div>`;
}
