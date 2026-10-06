'use strict';
let calendarData=null;
let holidays=[];
let verifiedYears=[];
let updateStatus=null;
let dataLoadFailed=false;
const DAY=86400000;
function date(s){return new Date(s+'T00:00:00Z')}
function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(+date(s))&&date(s).toISOString().slice(0,10)===s}
function shortDate(s){return date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})}
function dateRange(start,end){return start.slice(0,7)===end.slice(0,7)?date(start).toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})+' '+Number(start.slice(8))+'–'+Number(end.slice(8)):shortDate(start)+' – '+shortDate(end)}
function overlap(a,b,c,d){return a<=d&&b>=c}
function evaluateTrip(start,end){
 if(!validDate(start)||!validDate(end))throw new Error('Choose a valid arrival and departure date.');
 if(start>end)throw new Error('Departure must be on or after arrival.');
 const matches=holidays.filter(h=>overlap(start,end,h.start,h.end));
 const days=matches.reduce((sum,h)=>sum+Math.round((date(end<h.end?end:h.end)-date(start>h.start?start:h.start))/DAY)+1,0);
 const rushPeriods=(calendarData?.travelRush??[]).filter(r=>overlap(start,end,r.start,r.end));
 const rush=rushPeriods.length>0;
 const firstYear=Number(start.slice(0,4)), lastYear=Number(end.slice(0,4));
 const unknown=!calendarData || lastYear-firstYear>100 || Array.from({length:lastYear-firstYear+1},(_,i)=>String(firstYear+i)).some(y=>!verifiedYears.includes(y));
 let level=unknown?'unknown':matches.some(h=>h.level==='high')?'high':matches.length||rush?'busy':'clear';
 let title=unknown?'Some dates are outside our verified calendar':matches.some(h=>h.level==='high')?'You’re travelling during a major holiday':matches.length?'Your trip overlaps a public holiday':rush?'No holiday overlap, but it’s travel-rush season':'No national holiday overlap';
 let detail=matches.length?matches.map(h=>h.name+' ('+dateRange(h.start,h.end)+')').join('; ')+'. '+days+' '+(days===1?'day':'days')+' of your trip '+(days===1?'overlaps':'overlap')+' an official break.':unknown?'Some dates have no verified annual schedule yet. Unverified dates are not marked as quiet.':rush?'Your dates overlap a verified Spring Festival travel-rush period.':'Your dates fall outside the verified national holiday breaks. A useful starting point for a calmer trip.';
 let advice=unknown?'Check the official schedule for every year of your trip before booking.':level==='high'?'If your dates are flexible, move your trip outside the holiday. If not, secure transport and attraction reservations early.':level==='busy'?'Allow for busier transport and popular sights. Compare nearby dates before booking.':'Weekends, school breaks and local events can still be busy. Check your exact route before booking.';
 if(rush&&matches.length)advice+=' The wider Spring Festival travel rush runs '+rushPeriods.map(r=>dateRange(r.start,r.end)+' '+r.start.slice(0,4)).join('; ')+'.';
 if(!unknown&&!matches.length&&!rush&&Array.from({length:lastYear-firstYear+1},(_,i)=>firstYear+i).some(y=>overlap(start,end,y+'-07-01',y+'-08-31')))advice+=' July and August may coincide with school summer breaks; dates vary locally.';
 return {level,title,detail,advice,holidayDays:days,holidays:matches.map(h=>h.name),springFestivalTravelRush:rush,verifiedAllDates:!unknown};
}
function renderTrip(start,end){
 const result=evaluateTrip(start,end);
 document.getElementById('form-error').hidden=true;
 const box=document.createElement('div');box.className='result '+result.level;
 const icon=document.createElement('span');icon.className='result-icon';icon.setAttribute('aria-hidden','true');icon.textContent=result.level==='clear'?'✓':'!';
 const content=document.createElement('div');const h=document.createElement('h3');h.textContent=result.title;const p=document.createElement('p');p.textContent=result.detail;const advice=document.createElement('p');advice.className='result-detail';advice.textContent=result.advice;content.append(h,p,advice);box.append(icon,content);document.getElementById('trip-result').replaceChildren(box);
 document.getElementById('arrival').value=start;document.getElementById('departure').value=end;return result;
}
document.getElementById('trip-form').addEventListener('submit',event=>{event.preventDefault();try{renderTrip(document.getElementById('arrival').value,document.getElementById('departure').value)}catch(e){const error=document.getElementById('form-error');error.textContent=e.message;error.hidden=false;document.getElementById('trip-result').replaceChildren()}});

const context=document.modelContext;
if(context?.registerTool){try{Promise.resolve(context.registerTool({name:'check_china_travel_dates',title:'Check China travel dates',description:'Check arrival and departure against verified mainland China holidays and show the result on this page. Years without a verified annual schedule are flagged as unverified.',inputSchema:{type:'object',properties:{arrival:{type:'string',description:'Arrival date, YYYY-MM-DD'},departure:{type:'string',description:'Departure date, YYYY-MM-DD'}},required:['arrival','departure'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object')throw new Error('Arrival and departure are required.');return renderTrip(input.arrival,input.departure)}})).catch(()=>{})}catch{}}

// Counts China-local calendar days, independent of the visitor's time zone.
function chinaDate(now){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=type=>parts.find(p=>p.type===type).value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
function getCountdown(now=new Date()){
 const today=chinaDate(now);
 const countdownHolidays=holidays.map(h=>({...h,fullBreakVerified:true}));
 // Only the immediately following January 1 is safe to show without a full schedule.
 const lastYear=Number(verifiedYears.at(-1));
 if(lastYear && today<=(lastYear+1)+'-01-01')countdownHolidays.push({name:"New Year's Day",start:(lastYear+1)+'-01-01',end:(lastYear+1)+'-01-01',fullBreakVerified:false});
 countdownHolidays.sort((a,b)=>a.start.localeCompare(b.start));
 const next=countdownHolidays.find(h=>h.start>=today);
 const current=countdownHolidays.find(h=>h.start<today&&h.end>=today);
 if(!next)return {state:'unknown',today,current:current??null};
 return {state:'ready',today,holiday:next,days:Math.round((date(next.start)-date(today))/DAY),current:current??null};
}
let lastCountdownDate='';
function renderCountdown(now=new Date()){
 const result=getCountdown(now);
 if(result.today===lastCountdownDate)return result;
 lastCountdownDate=result.today;
 const el=id=>document.getElementById(id);
 document.querySelector('.holiday-countdown').dataset.state=result.state;
 if(result.state==='unknown'){
  el('countdown-eyebrow').textContent='CHINA PUBLIC HOLIDAYS';
  el('countdown-name').textContent='Next holiday not yet verified';
  el('countdown-date').textContent='Check the official holiday schedule.';
  el('countdown-note').textContent='The countdown will resume when the next holiday is added.';
  el('countdown-days').textContent='—';el('countdown-unit').textContent='AWAITING DATES';
 }else{
  const h=result.holiday;
  el('countdown-eyebrow').textContent=result.days===0?'PUBLIC HOLIDAY STARTS TODAY':'NEXT PUBLIC HOLIDAY IN CHINA';
  el('countdown-name').textContent=h.name;
  el('countdown-date').textContent=date(h.start).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  el('countdown-note').textContent=h.fullBreakVerified?'Countdown to the start of the official holiday break.':'1 January is a fixed holiday date; the full '+h.start.slice(0,4)+' break is not yet verified.';
  el('countdown-days').textContent=String(result.days);
  el('countdown-unit').textContent=result.days===0?'STARTS TODAY':result.days===1?'DAY TO GO':'DAYS TO GO';
 }
 el('countdown-current').hidden=!result.current;
 el('countdown-current').textContent=result.current?`${result.current.name} holiday is on now · through ${shortDate(result.current.end)}.`:'';
 return result;
}

function validateCalendar(data){
 if(data?.schemaVersion!==1||!data.years||!Object.keys(data.years).length)throw new Error('Calendar unavailable');
 for(const [year,entry] of Object.entries(data.years)){
  if(!/^20\d{2}$/.test(year)||!Array.isArray(entry.holidays)||entry.holidays.length<6||entry.holidays.length>7)throw new Error('Invalid calendar');
  const source=new URL(entry.source);
  if(source.protocol!=='https:'||source.hostname!=='www.gov.cn')throw new Error('Invalid source');
  let previous=null;
  for(const h of entry.holidays){
   if(typeof h.name!=='string'||typeof h.local!=='string'||!validDate(h.start)||!validDate(h.end)||h.start>h.end||!['busy','high'].includes(h.level)|| (previous&&previous>=h.start))throw new Error('Invalid holiday');
   previous=h.end;
  }
 }
 return data;
}
function renderCalendar(){
 const label=verifiedYears.join(', ');
 document.querySelector('.scope').textContent='Mainland China · '+label;
 document.querySelector('footer p').textContent='Mainland China · '+label;
 document.querySelector('.year-label').textContent=label+' · Official dates';
 const list=document.getElementById('holiday-list');list.replaceChildren();
 for(const year of verifiedYears){
  if(verifiedYears.length>1){const heading=document.createElement('h3');heading.textContent=year;list.append(heading)}
  for(const h of calendarData.years[year].holidays){
   const article=document.createElement('article');article.className='holiday';
   const month=document.createElement('span');month.className='month';month.textContent=date(h.start).toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase();
   const copy=document.createElement('div');const name=document.createElement('h3');name.textContent=h.name;const local=document.createElement('p');local.textContent=h.local;copy.append(name,local);
   const when=document.createElement('div');when.className='holiday-date';when.textContent=dateRange(h.start,h.end);
   const impact=document.createElement('small');impact.className=h.level+'-label';impact.textContent=(h.level==='high'?'Major travel peak':'Short holiday')+' · '+(Math.round((date(h.end)-date(h.start))/DAY)+1)+' days';when.append(impact);article.append(month,copy,when);list.append(article);
  }
 }
 const sources=document.getElementById('annual-sources');sources.replaceChildren();
 for(const year of verifiedYears){const link=document.createElement('a');link.href=calendarData.years[year].source;link.target='_blank';link.rel='noreferrer';link.textContent=year+' State Council holiday schedule';sources.append(link)}
}
function renderUpdateStatus(now=new Date()){
 const node=document.getElementById('update-status');
 const last=calendarData?.lastSuccessfulCheck;
 const age=last?+now-Date.parse(last):Infinity;
 const stale=!Number.isFinite(age)||age>48*60*60*1000||age< -5*60*1000;
 const problem=dataLoadFailed||updateStatus?.state!=='ok'||stale;
 node.classList.toggle('update-warning',problem);
 const formatted=last?new Date(last).toLocaleString('en-GB',{timeZone:'Asia/Shanghai',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' China time':null;
 node.textContent=!calendarData?'Calendar could not be loaded. Please try again.':problem?'Automatic checks need attention. Showing previously verified dates.'+(formatted?' Last successful check: '+formatted+'.':''):'Official schedules checked: '+formatted+'.';
}
let refreshing=false;
async function refreshCalendar(){
 if(refreshing)return;refreshing=true;
 try{
  const response=await fetch('data/holidays.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Calendar request failed');
  const candidate=validateCalendar(await response.json());
  calendarData=candidate;verifiedYears=Object.keys(candidate.years).sort();holidays=verifiedYears.flatMap(y=>candidate.years[y].holidays).sort((a,b)=>a.start.localeCompare(b.start));dataLoadFailed=false;
  renderCalendar();lastCountdownDate='';renderCountdown();
  try{renderTrip(document.getElementById('arrival').value,document.getElementById('departure').value)}catch{/* Preserve invalid input while refreshing. */}
  try{const status=await fetch('data/update-status.json',{cache:'no-store'});if(!status.ok)throw new Error();updateStatus=await status.json()}catch{updateStatus=null}
 }catch{dataLoadFailed=true;if(!calendarData){renderTrip(document.getElementById('arrival').value,document.getElementById('departure').value);renderCountdown()}}
 finally{refreshing=false;renderUpdateStatus()}
}
refreshCalendar();
setInterval(()=>{renderCountdown();renderUpdateStatus()},1000);
setInterval(refreshCalendar,60*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderCountdown();refreshCalendar()}});
