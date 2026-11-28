const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MEALS=['breakfast','lunch','dinner'];
const LEVELS=['Very Bad','Bad','Good','Very Good'];
const COLORS=['#F45F82','#FFBE00','#00C995','#B83FF2'];
const API_URL='https://vvgvjfghtkhnqvbhjqcb.supabase.co/functions/v1/unknown-ratings-api';
const AUTH_URL='https://vvgvjfghtkhnqvbhjqcb.supabase.co/auth/v1';
const API_KEY='sb_publishable_T_WBo0M8GVAE3Eo-bY6QQA_E1YX20vm';
const app=document.getElementById('app');
let schedules=[],events=[],pageVersion=0,poll=null,adminSession=null,adminUser=null;
let state={page:'home',day:currentBishkek().weekday,meal:'',category:'',session:null,notice:''};
function currentBishkek(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bishkek',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(new Date());
 const v={};for(const p of parts)if(p.type!=='literal')v[p.type]=p.value;
 const date=v.year+'-'+v.month+'-'+v.day;
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 return {date,weekday};
}
function dateFor(day){
 const now=currentBishkek(),d=new Date(now.date+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()-now.weekday+day);
 return d.toISOString().slice(0,10);
}
function isToday(day){return dateFor(day)===currentBishkek().date}
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
async function api(action,data={},token=null){
 const bearer=token||API_KEY;
 const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':API_KEY,'Authorization':'Bearer '+bearer},body:JSON.stringify({action,...data})});
 let json={};try{json=await res.json()}catch{}
 if(!res.ok||json.success===false)throw new Error(json.error||'Request failed ('+res.status+')');
 return json;
}
async function loadPublic(){
 const [s,e]=await Promise.all([api('weekly-schedule'),api('active-events')]);
 schedules=s.schedule||[];events=e.events||[];
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
async function getSummary(s){
 const payload=s.event_id?{event_id:s.event_id}:{rating_date:s.rating_date,meal:s.meal,category:s.category};
 const r=await api('rating-summary',payload);return r.summary||{total_ratings:0,very_bad:0,bad:0,good:0,very_good:0};
}
function setTheme(){document.body.className=state.page==='rate'?'cosmic':state.page==='overall'?'aurora':''}
let historyDepth=0;
function snap(){return {tuRatings:true,page:state.page,day:state.day,meal:state.meal,category:state.category,depth:historyDepth}}
function go(p){state.page=p;historyDepth++;try{history.pushState(snap(),'','#'+p)}catch{historyDepth=Math.max(0,historyDepth-1)}render()}
function back(fallback){if(historyDepth>0){history.back();return}state.page=fallback||'home';render()}
window.addEventListener('popstate',e=>{
 if(e.state?.tuRatings){state.page=e.state.page||'home';state.day=e.state.day??state.day;state.meal=e.state.meal||'';state.category=e.state.category||'';historyDepth=Math.max(0,e.state.depth||0)}
 else{state.page='home';state.meal='';state.category='';historyDepth=0}
 render();
});
function dayNav(){return '<div class="days">'+DAYS.map((d,i)=>'<button class="day '+(i===state.day?'active':'')+'" data-day="'+i+'">'+d+'</button>').join('')+'</div>'}
function bindDays(){app.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{state.day=Number(b.dataset.day);render()})}
function bindBack(fallback){const b=document.getElementById('back');if(b)b.onclick=()=>back(fallback)}
function resultCard(title,subtitle,summary){
 const c=Array.isArray(summary?.counts)?summary.counts:counts(summary);
 return '<section class="panel"><div class="row"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><span class="pill">'+total(c)+' ratings</span></div>'+meter({counts:c},title)+'</section>';
}
function renderHome(){
 setTheme();
 app.innerHTML='<section class="hero"><div class="kicker">MESS EXPERIENCE</div><h1>How was the food?</h1><p>Choose a meal to rate it or explore the community\\'s ratings.</p></section>'+dayNav()+
 '<div class="grid"><button class="tile" data-meal="breakfast"><span class="emoji">☀️</span><span><strong>Breakfast</strong><small>Rate & view results</small></span></button><button class="tile" data-meal="lunch"><span class="emoji">🥗</span><span><strong>Lunch</strong><small>Rate & view results</small></span></button><button class="tile" data-meal="dinner"><span class="emoji">🌙</span><span><strong>Dinner</strong><small>Veg / Non-Veg</small></span></button><button class="tile results" id="overall"><span class="emoji">✦</span><span><strong>Overall Ratings</strong><small>Five daily result meters</small></span></button></div><div class="row" style="margin-top:20px"><span class="notice">Live community ratings</span><button class="secondary" id="adminOpen">Admin</button></div>';
 bindDays();
 app.querySelectorAll('[data-meal]').forEach(b=>b.onclick=()=>{state.meal=b.dataset.meal;const cats=categoryOptions(state.day,state.meal);if(state.meal==='dinner')go('category');else{state.category=cats[0]||'all';go('rate')}});
 document.getElementById('overall').onclick=()=>go('overall');document.getElementById('adminOpen').onclick=()=>go('admin');
}
function renderCategory(){
 setTheme();const cats=categoryOptions(state.day,'dinner');
 app.innerHTML='<button class="back" id="back">← All meals</button><div class="kicker">'+DAYS[state.day]+' · DINNER</div><h1>Choose dinner type.</h1><div class="choicegrid">'+(cats.map(c=>'<button class="choice" data-cat="'+esc(c)+'"><span>'+(c==='veg'?'🥬':'🍗')+'</span><h3>'+(c==='veg'?'Veg':'Non-Veg')+'</h3><small>Open rating page</small></button>').join('')||'<div class="empty">No dinner options scheduled for this weekday.</div>')+'</div>';
 bindBack('home');app.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.category=b.dataset.cat;go('rate')});
}
async function renderRate(){
 setTheme();const id=++pageVersion,s=sessionFor(state.day,state.meal,state.category),saved=editRecord(s);
 app.innerHTML='<button class="back" id="back">← '+(state.meal==='dinner'?'Dinner options':'All meals')+'</button><div class="kicker">'+DAYS[state.day]+' · '+state.meal.toUpperCase()+' '+(state.meal==='dinner'?state.category.toUpperCase():'')+'</div><h1>Rate your meal.</h1><div id="liveMeter" class="empty">Loading live ratings…</div>';
 bindBack(state.meal==='dinner'?'category':'home');
 let summary;try{summary=await getSummary(s)}catch(e){summary={};state.notice=e.message}
 if(id!==pageVersion)return;
 const meterPanel='<section class="panel"><div class="row"><div><h2>Taste</h2><p>How did it taste?</p></div><span class="pill">LIVE METER</span></div>'+meter({counts:counts(summary)},'Taste')+'</section>';
 const head='<button class="back" id="back">← '+(state.meal==='dinner'?'Dinner options':'All meals')+'</button><div class="kicker">'+DAYS[state.day]+' · '+state.meal.toUpperCase()+' '+(state.meal==='dinner'?state.category.toUpperCase():'')+'</div><h1>Rate your meal.</h1>';
 if(!isToday(state.day)){
  app.innerHTML=head+meterPanel+'<section class="panel"><p>Past and future sessions are view-only. Ratings can only be submitted during today's scheduled meal window.</p></section>';bindBack(state.meal==='dinner'?'category':'home');return;
 }
 const existing=Number(saved?.taste_rating)||0,reviewText=saved?.review||'';
 app.innerHTML=head+meterPanel+'<section class="panel"><h2>'+(saved?'Change your rating':'Submit your rating')+'</h2><p>Choose one of the four options.</p><form id="vote"><div class="rating"><b>Taste</b><div class="rating-buttons">'+LEVELS.map((x,i)=>'<button type="button" class="rate '+(existing===i+1?'selected':'')+'" data-v="'+(i+1)+'">'+x+'</button>').join('')+'</div></div><div class="review-box"><h3>Write a Review</h3><textarea id="reviewText" maxlength="500" rows="4" placeholder="Write your review here...">'+esc(reviewText)+'</textarea><div class="review-meta"><span class="notice">Optional · Anonymous</span><span class="notice" id="reviewCount">'+reviewText.length+'/500</span></div></div><div class="row" style="margin-top:15px"><span class="notice">Your edit access is saved on this device.</span><button class="primary" id="send" '+(!existing?'disabled':'')+'>'+(saved?'Update rating':'Post')+'</button></div><div id="message" class="notice" role="status" style="margin-top:10px"></div></form></section>';
 bindBack(state.meal==='dinner'?'category':'home');
 let chosen=existing;const review=document.getElementById('reviewText');
 review.oninput=()=>document.getElementById('reviewCount').textContent=review.value.length+'/500';
 app.querySelectorAll('.rate').forEach(b=>b.onclick=()=>{chosen=Number(b.dataset.v);app.querySelectorAll('.rate').forEach(x=>x.classList.toggle('selected',x===b));document.getElementById('send').disabled=false});
 document.getElementById('vote').onsubmit=async e=>{
  e.preventDefault();if(!chosen)return;
  const btn=document.getElementById('send'),msg=document.getElementById('message');btn.disabled=true;btn.textContent=saved?'Updating…':'Posting…';
  try{
   const reviewValue=review.value.trim();
   if(saved?.edit_token){
    await api('edit-rating',{edit_token:saved.edit_token,taste_rating:chosen,review:reviewValue});
    saveEditRecord(s,{...saved,taste_rating:chosen,review:reviewValue});
   }else{
    const result=await api('submit-rating',{visitor_token:visitorToken(),meal:s.meal,category:s.category,taste_rating:chosen,review:reviewValue,event_id:s.event_id||undefined});
    saveEditRecord(s,{edit_token:result.edit_token,taste_rating:chosen,review:reviewValue});
   }
   state.notice=saved?'Your rating was updated.':'Your rating was submitted.';
   await renderRate();
  }catch(err){msg.textContent=err.message||'Unable to submit rating.';btn.disabled=false;btn.textContent=saved?'Update rating':'Post'}
 };
}
async function renderOverall(){
 setTheme();const id=++pageVersion;
 app.innerHTML='<button class="back" id="back">← Home</button><div class="kicker">THE UNKNOWN · RESULTS</div><h1>Overall Ratings</h1><p>Five meters based on actual submitted Taste ratings.</p>'+dayNav()+'<div class="empty">Loading live results…</div>';
 bindBack('home');bindDays();
 const date=dateFor(state.day),regular=[
  {rating_date:date,meal:'breakfast',category:'all',event_id:null},
  {rating_date:date,meal:'lunch',category:'all',event_id:null},
  {rating_date:date,meal:'dinner',category:'veg',event_id:null},
  {rating_date:date,meal:'dinner',category:'nonveg',event_id:null}
 ];
 const dayEvents=events.filter(e=>e.event_date===date);
 let summaries;
 try{summaries=await Promise.all([...regular.map(getSummary),...dayEvents.map(e=>getSummary({event_id:e.id}))])}
 catch(e){state.notice=e.message;summaries=regular.map(()=>({}))}
 if(id!==pageVersion)return;
 const norm=summaries.slice(0,4),extra=summaries.slice(4);
 const byCat=(cat,meal)=>[norm[meal],...dayEvents.map((e,i)=>e.meal===mealName(meal)&&e.category===cat?extra[i]:null).filter(Boolean)];
 const breakfast=[norm[0],...dayEvents.map((e,i)=>e.meal==='breakfast'?extra[i]:null).filter(Boolean)];
 const lunch=[norm[1],...dayEvents.map((e,i)=>e.meal==='lunch'?extra[i]:null).filter(Boolean)];
 const veg=[norm[2],...dayEvents.map((e,i)=>e.meal==='dinner'&&e.category==='veg'?extra[i]:null).filter(Boolean)];
 const nonveg=[norm[3],...dayEvents.map((e,i)=>e.meal==='dinner'&&e.category==='nonveg'?extra[i]:null).filter(Boolean)];
 const all=[...breakfast,...lunch,...veg,...nonveg];
 app.innerHTML='<button class="back" id="back">← Home</button><div class="kicker">THE UNKNOWN · RESULTS</div><h1>Overall Ratings</h1><p>Five meters based on actual submitted Taste ratings · '+date+'</p>'+dayNav()+
 resultCard('Overall Experience','All meal sessions · '+DAYS[state.day],sumSummaries(all))+
 resultCard('Dinner · Veg','Vegetarian dinner · '+DAYS[state.day],sumSummaries(veg))+
 resultCard('Dinner · Non-Veg','Non-vegetarian dinner · '+DAYS[state.day],sumSummaries(nonveg))+
 resultCard('Lunch Overall','Lunch · '+DAYS[state.day],sumSummaries(lunch))+
 resultCard('Breakfast Overall','Breakfast · '+DAYS[state.day],sumSummaries(breakfast));
 bindBack('home');bindDays();
}
function mealName(i){return ['breakfast','lunch','dinner'][i]}
async function verifyAdmin(){
 if(!adminSession?.access_token)return false;
 try{const r=await api('admin-check',{},adminSession.access_token);adminUser=r.user||true;return !!r.is_admin}
 catch{setAdminStore(null);adminUser=null;return false}
}
function renderAdminLogin(error=''){
 setTheme();
 app.innerHTML='<button class="back" id="back">← Home</button><div class="kicker">SECURE ADMINISTRATION</div><h1>Admin sign in.</h1><section class="panel"><p>Use the administrator account created in Supabase Authentication.</p><form id="adminLogin"><label>Email</label><input class="field" id="adminEmail" type="email" autocomplete="username" required><label style="display:block;margin-top:12px">Password</label><input class="field" id="adminPassword" type="password" autocomplete="current-password" required><button class="primary" id="loginButton" style="margin-top:15px">Sign in</button><p id="loginError" class="notice" role="alert" style="margin-top:12px">'+esc(error)+'</p></form></section>';
 bindBack('home');
 document.getElementById('adminLogin').onsubmit=async e=>{
  e.preventDefault();const btn=document.getElementById('loginButton'),err=document.getElementById('loginError');btn.disabled=true;btn.textContent='Signing in…';
  try{
   const res=await fetch(AUTH_URL+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json','apikey':API_KEY},body:JSON.stringify({email:document.getElementById('adminEmail').value.trim(),password:document.getElementById('adminPassword').value})});
   const session=await res.json();if(!res.ok)throw new Error(session.msg||session.message||'Sign in failed');
   setAdminStore(session);if(!await verifyAdmin())throw new Error('This account is not on the administrator allow-list.');
   await renderAdmin();
  }catch(err){setAdminStore(null);err.textContent=err.message||'Unable to sign in';btn.disabled=false;btn.textContent='Sign in'}
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
 '<section class="panel"><h2>Weekly meal schedule</h2><p>Changes are saved to Supabase and apply to the live site.</p><form id="scheduleForm">'+scheduleFields+'<button class="primary" id="saveSchedule">Save all 21 schedule entries</button><span class="notice" id="scheduleMsg" role="status"></span></form></section>'+
 '<section class="panel"><h2>Temporary event session</h2><p>Create a dated one-time meal session. Existing ratings remain attached if an event is deactivated.</p><form id="eventForm"><div class="admin-grid"><div class="adminbox"><label>Date</label><input class="field" id="eventDate" type="date" required><label>Meal</label><select class="field" id="eventMeal"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select><label>Category</label><select class="field" id="eventCategory"><option value="all">All</option><option value="veg">Veg</option><option value="nonveg">Non-Veg</option></select></div><div class="adminbox"><label>Event name</label><input class="field" id="eventName" maxlength="150" placeholder="Special event"><label>Opens</label><input class="field" id="eventOpen" type="time" value="12:00" required><label>Closes</label><input class="field" id="eventClose" type="time" value="15:00" required></div></div><button class="primary" id="saveEvent" style="margin-top:14px">Create event</button><span class="notice" id="eventMsg" role="status"></span></form><div id="eventsList" style="margin-top:16px">'+(events.map(ev=>'<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)"><span>'+esc(ev.event_name||ev.meal)+' · '+esc(ev.event_date)+' · '+esc(ev.category)+' · '+esc(timeValue(ev.opens_at))+'–'+esc(timeValue(ev.closes_at))+'</span><button class="secondary" data-event-delete="'+esc(ev.id)+'">Deactivate</button></div>').join('')||'<div class="empty">No active temporary events.</div>')+'</div></section>'+
 '<p class="notice">Administrator access is verified by Supabase Auth and the server-side admin_users allow-list. Never share your admin password or edit token.</p>';
 document.getElementById('logout').onclick=()=>{setAdminStore(null);adminUser=null;renderAdminLogin()};
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
 else if(state.page==='rate'){renderRate();poll=setInterval(()=>{if(document.visibilityState==='visible'&&state.page==='rate')refreshRateMeter()},25000)}
 else if(state.page==='overall'){renderOverall();poll=setInterval(()=>{if(document.visibilityState==='visible'&&state.page==='overall')renderOverall()},25000)}
 else if(state.page==='admin')renderAdmin();
}
async function refreshRateMeter(){
 const s=sessionFor(state.day,state.meal,state.category);try{const r=await getSummary(s);const panel=app.querySelector('#liveMeter');if(panel)panel.outerHTML='<section class="panel" id="liveMeter"><div class="row"><div><h2>Taste</h2><p>How did it taste?</p></div><span class="pill">LIVE METER</span></div>'+meter({counts:counts(r)},'Taste')+'</section>'}catch{}
}
if(location.hash==='#admin')state.page='admin';
historyDepth=0;try{history.replaceState(snap(),'','#'+state.page)}catch{}
app.innerHTML='<div class="empty">Connecting to live ratings…</div>';
loadPublic().then(render).catch(err=>{app.innerHTML='<div class="empty">Unable to connect to live ratings: '+esc(err.message)+'</div><button class="secondary" id="retry">Retry</button>';document.getElementById('retry').onclick=()=>{app.innerHTML='<div class="empty">Connecting…</div>';loadPublic().then(render).catch(e=>{app.innerHTML='<div class="empty">'+esc(e.message)+'</div>'})}});

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
