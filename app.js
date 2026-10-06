'use strict';
const holidays=[
{name:"New Year's Day",local:'A short start-of-year break',start:'2026-01-01',end:'2026-01-03',level:'busy'},
{name:'Spring Festival',local:'Chinese New Year · 春节',start:'2026-02-15',end:'2026-02-23',level:'high'},
{name:'Qingming Festival',local:'Tomb-Sweeping Day · 清明节',start:'2026-04-04',end:'2026-04-06',level:'busy'},
{name:'Labour Day',local:'May Day holiday · 劳动节',start:'2026-05-01',end:'2026-05-05',level:'high'},
{name:'Dragon Boat Festival',local:'Duanwu · 端午节',start:'2026-06-19',end:'2026-06-21',level:'busy'},
{name:'Mid-Autumn Festival',local:'Moon Festival · 中秋节',start:'2026-09-25',end:'2026-09-27',level:'busy'},
{name:'National Day',local:'Golden Week · 国庆节',start:'2026-10-01',end:'2026-10-07',level:'high'}];
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
 const rush=overlap(start,end,'2026-02-02','2026-03-13');
 const unknown=start<'2026-01-01'||end>'2026-12-31';
 let level=unknown?'unknown':matches.some(h=>h.level==='high')?'high':matches.length||rush?'busy':'clear';
 let title=unknown?'Some dates are outside our verified calendar':matches.some(h=>h.level==='high')?'You’re travelling during a major holiday':matches.length?'Your trip overlaps a public holiday':rush?'No holiday overlap, but it’s travel-rush season':'No national holiday overlap';
 let detail=matches.length?matches.map(h=>h.name+' ('+dateRange(h.start,h.end)+')').join('; ')+'. '+days+' '+(days===1?'day':'days')+' of your trip '+(days===1?'overlaps':'overlap')+' an official break.':unknown?'We can check only the 2026 portion of your trip. Unverified dates are not marked as quiet.':rush?'Your dates overlap the 2 February–13 March Spring Festival travel rush.':'Your dates fall outside the seven official 2026 holiday breaks. A useful starting point for a calmer trip.';
 let advice=unknown?'Check the official schedule for every year of your trip before booking.':level==='high'?'If your dates are flexible, move your trip outside the holiday. If not, secure transport and attraction reservations early.':level==='busy'?'Allow for busier transport and popular sights. Compare nearby dates before booking.':'Weekends, school breaks and local events can still be busy. Check your exact route before booking.';
 if(rush&&matches.length)advice+=' The wider Spring Festival travel rush runs 2 February–13 March.';
 if(!unknown&&!matches.length&&!rush&&start<='2026-08-31'&&end>='2026-07-01')advice+=' July and August may coincide with school summer breaks; dates vary locally.';
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
document.getElementById('holiday-list').innerHTML=holidays.map(h=>`<article class="holiday"><span class="month">${date(h.start).toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase()}</span><div><h3>${h.name}</h3><p>${h.local}</p></div><div class="holiday-date">${dateRange(h.start,h.end)}<small class="${h.level}-label">${h.level==='high'?'Major travel peak':'Short holiday'} · ${Math.round((date(h.end)-date(h.start))/DAY)+1} days</small></div></article>`).join('');
document.getElementById('trip-form').addEventListener('submit',event=>{event.preventDefault();try{renderTrip(document.getElementById('arrival').value,document.getElementById('departure').value)}catch(e){const error=document.getElementById('form-error');error.textContent=e.message;error.hidden=false;document.getElementById('trip-result').replaceChildren()}});
renderTrip('2026-10-01','2026-10-07');
const context=document.modelContext;
if(context?.registerTool){try{Promise.resolve(context.registerTool({name:'check_china_travel_dates',title:'Check China travel dates',description:'Check arrival and departure against verified 2026 mainland China holidays and show the result on this page. Other years are flagged as unverified.',inputSchema:{type:'object',properties:{arrival:{type:'string',description:'Arrival date, YYYY-MM-DD'},departure:{type:'string',description:'Departure date, YYYY-MM-DD'}},required:['arrival','departure'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object')throw new Error('Arrival and departure are required.');return renderTrip(input.arrival,input.departure)}})).catch(()=>{})}catch{}}

// Counts China-local calendar days, independent of the visitor's time zone.
const countdownHolidays=[...holidays.map(h=>({...h,fullBreakVerified:true})),
 {name:"New Year's Day",start:'2027-01-01',end:'2027-01-01',fullBreakVerified:false}];
function chinaDate(now){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=type=>parts.find(p=>p.type===type).value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
function getCountdown(now=new Date()){
 const today=chinaDate(now);
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
  el('countdown-note').textContent=h.fullBreakVerified?'Countdown to the start of the official holiday break.':'1 January is a fixed holiday date; the full 2027 break is not yet verified.';
  el('countdown-days').textContent=String(result.days);
  el('countdown-unit').textContent=result.days===0?'STARTS TODAY':result.days===1?'DAY TO GO':'DAYS TO GO';
 }
 el('countdown-current').hidden=!result.current;
 el('countdown-current').textContent=result.current?`${result.current.name} holiday is on now · through ${shortDate(result.current.end)}.`:'';
 return result;
}
renderCountdown();
setInterval(()=>renderCountdown(),1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderCountdown()});
