import {forecast, occurrences, balances,validate,addDays,forecastEnd,principalSnapshots} from './money-engine.mjs';
import {budgetMonth, monthBounds, shiftMonth, validateBudgets,weeklyDates} from './money-budget.mjs';
import {creditState,creditActivity,creditRates,reducePromo,accrueCredit} from './money-credit.mjs';
import {incomingOwner} from './money-income.mjs';

const forecastCache=new Map();
export function clearPlanningCache(){forecastCache.clear();}
// Build budget reserves, debt payments and estimated interest as postings.
// The shared posting engine owns every daily/monthly balance.
export function planningForecast(model, end) {
  validateBudgets(validate(model));
  const cacheKey=end+JSON.stringify(model);if(forecastCache.has(cacheKey))return forecastCache.get(cacheKey);
  const managed=model.accounts.filter(a=>a.credit?.scheduleId),linked=new Map(managed.map(a=>[a.credit.scheduleId,a]));
  const effective={...model,schedules:model.schedules.map(s=>linked.has(s.id)?{...s,enabled:false}:s)};
  const base = forecast(effective,end), planned = [], adjustments = Object.fromEntries(model.accounts.map(a=>[a.id,0]));
  const scheduled = occurrences(model,end);
  const candidates=new Map();for(const t of scheduled.filter(t=>linked.has(t.scheduleKey.slice(0,-11)))){if(!candidates.has(t.date))candidates.set(t.date,[]);candidates.get(t.date).push(t);}
  const creditors=model.accounts.filter(a=>a.type!=='cash'&&(!a.balanceUnknown||principalSnapshots(a).length)),states=Object.fromEntries(creditors.map(a=>[a.id,{...creditState(a),total:Math.max(0,-a.opening)}]));
  const creditWarnings=new Set(),creditDaily=new Map();
  const recordedInterest=new Set(model.transactions.filter(t=>t.kind==='expense'&&t.category?.trim().toLowerCase()==='interest').map(t=>t.entries[0].account+':'+t.date.slice(0,7)));
  const committed = {...model,transactions:[...model.transactions,...scheduled]};
  const warnings = new Set(), issues = [], incompleteFrom = {};
  function incomplete(month,entity,category,reason) {
    issues.push({month,entity,category,reason});
    incompleteFrom[entity] ||= month;
    warnings.add(reason);
  }
  const budgetPosts=new Map();
  for(let month=model.start.slice(0,7);month<=end.slice(0,7);month=shiftMonth(month,1)){
   const bounds=monthBounds(month);
   for(const entity of ['household','business','custodial'])for(const b of budgetMonth(committed,month,entity,bounds.last).buckets){
    if(b.allowance===null){incomplete(month,entity,b.shortName||b.name,'Missing category targets');continue;}
    const amount=Math.max(0,b.remaining);if(!amount)continue;
    const account=model.accounts.find(a=>a.id===(b.funding?.[month]||b.account)&&a.type==='cash'&&a.entity===entity);
    if(!account){incomplete(month,entity,b.shortName||b.name,'Budget funding account needed');continue;}
    const start=model.start>bounds.first?model.start:bounds.first;
    const timing=b.timing?.[month]||{mode:model.planning?.budgetTiming==='month-end'||b.seasonal||b.oneTimeMonth?'month-end':'weekly',weekday:b.weekday??5};
    let dates;
    if(timing.mode==='daily'){dates=[];for(let when=start;when<=bounds.last;when=addDays(when,1))dates.push(when);}
    else if(timing.mode==='date')dates=[timing.date<start?start:timing.date];
    else if(timing.mode==='weekly')dates=weeklyDates(month,timing.weekday??5,start);
    else dates=[bounds.last];
    if(!dates.length)dates.push(bounds.last);
    const share=Math.floor(amount/dates.length),extra=amount%dates.length;
    dates.forEach((when,i)=>{const part=share+(i<extra?1:0);if(!part||when>end)return;const t={id:'budget:'+b.id+':'+month+':'+when,date:when,description:b.name+' — unspent budget allowance',kind:'expense',category:b.name,status:'plan',budgetReserve:true,entries:[{account:account.id,amount:-part}]};if(!budgetPosts.has(when))budgetPosts.set(when,[]);budgetPosts.get(when).push(t);});
   }
  }
  for (const d of base) {
    const post=t=>{planned.push(t);for(const e of t.entries)adjustments[e.account]+=e.amount;};
    for(const a of creditors){const state=states[a.id];state.total=Math.max(0,-d.opening[a.id]-adjustments[a.id]);creditActivity(a,state,d.date,d.events);state.promo=Math.min(state.promo,Math.max(0,-d.closing[a.id]-adjustments[a.id]));}
    for(const t of candidates.get(d.date)||[]){
      const a=linked.get(t.scheduleKey.slice(0,-11)),c=a.credit,state=states[a.id],final=a.type==='loan'&&c.finalPaymentDate===d.date;
      if(final&&state?.accrued>0){const interest=Math.max(0,Math.round(state.accrued));state.accrued=0;state.interest+=interest;if(interest)post({id:'interest:'+a.id+':'+d.date,date:d.date,description:a.name+' — estimated final interest',kind:'expense',category:'Interest',expenseEntity:a.entity,status:'plan',creditInterest:true,entries:[{account:a.id,amount:-interest}]});}
      const total=Math.max(0,-d.closing[a.id]-adjustments[a.id]);
      const source=model.schedules.find(s=>s.id===c.scheduleId),override=source.overrides?.[t.nominalDate];
      const paid=model.transactions.filter(x=>x.kind==='transfer'&&x.date.slice(0,7)===t.date.slice(0,7)&&x.date<=t.date).reduce((n,x)=>n+x.entries.filter(e=>e.account===a.id&&e.amount>0).reduce((sum,e)=>sum+e.amount,0),0);
      const target=final&&!override?total:t.date<(c.paymentStart||model.start)?Math.abs(t.entries[0].amount):c.mode==='full'&&!override?total:c.mode==='fixed'&&c.paymentAmount===0&&!override?0:Math.abs(t.entries[0].amount);
      const wanted=final&&!override||c.mode==='full'&&!override?target:Math.max(0,target-paid),amount=Math.min(wanted,total);
      if(c.minimum!=null&&total>0&&wanted<Math.min(Math.max(0,c.minimum-paid),total))creditWarnings.add(a.name+': planned payment below latest entered statement minimum');
      const payment={...t,creditPayment:true,estimated:true,entries:[{account:t.entries[0].account,amount:-amount},{account:a.id,amount}]};
      if(states[a.id]){states[a.id].promo=reducePromo(states[a.id].promo,total,amount,creditRates(c,d.date));states[a.id].total=Math.max(0,total-amount);}
      post(payment);
    }
    for(const a of creditors){const snapshots=principalSnapshots(a);if(snapshots.some(s=>s.date===d.date)){states[a.id].accrued=0;continue;}if(snapshots.length&&d.date< snapshots[0].date)continue;const total=Math.max(0,-d.closing[a.id]-adjustments[a.id]);if(accrueCredit(a,states[a.id],d.date,total))creditWarnings.add(a.name+': interest incomplete — enter missing APR');}
    for(const t of budgetPosts.get(d.date)||[])post(t);
    const monthEnd=d.date===monthBounds(d.date.slice(0,7)).last;
    if(monthEnd)for(const a of creditors){const state=states[a.id],known=recordedInterest.has(a.id+':'+d.date.slice(0,7)),interest=known?0:Math.max(0,Math.round(state.accrued));state.accrued=known?0:state.accrued-interest;state.interest+=interest;if(interest)post({id:'interest:'+a.id+':'+d.date,date:d.date,description:a.name+' — estimated interest',kind:'expense',category:'Interest',expenseEntity:a.entity,status:'plan',creditInterest:true,entries:[{account:a.id,amount:-interest}]});}
    creditDaily.set(d.date,Object.fromEntries(creditors.map(a=>[a.id,{promo:states[a.id].promo,interest:states[a.id].interest,missingFrom:states[a.id].missingFrom}])));
    if (!monthEnd) continue;
    const month = d.date.slice(0,7);
    for (const p of model.planning?.cardPayoffs || []) {
      if (p.enabled===false||managed.some(a=>a.id===p.card)) continue;
      const amount=Math.max(0,-(d.closing[p.card]+adjustments[p.card]));
      if (!amount) continue;
      planned.push({id:'payoff:'+p.card+':'+month,date:d.date,description:'Planned full card payoff',kind:'transfer',status:'plan',entries:[{account:p.from,amount:-amount},{account:p.card,amount}]});
      adjustments[p.from]-=amount;adjustments[p.card]+=amount;
    }
    for(const a of creditors)states[a.id].promo=Math.min(states[a.id].promo,Math.max(0,-d.closing[a.id]-adjustments[a.id]));
    creditDaily.set(d.date,Object.fromEntries(creditors.map(a=>[a.id,{promo:states[a.id].promo,interest:states[a.id].interest,missingFrom:states[a.id].missingFrom}])));
  }
  const days=forecast(effective,end,planned);for(const d of days)d.credit=creditDaily.get(d.date);
  const result={days,planned,warnings:[...warnings],issues,incompleteFrom,creditWarnings:[...creditWarnings]};if(forecastCache.size>=8)forecastCache.delete(forecastCache.keys().next().value);forecastCache.set(cacheKey,result);return result;
}

export function monthProjection(model, month, asOf) {
  const {first,last} = monthBounds(month);
  const result = planningForecast(model,last);
  const days = result.days.filter(d=>d.date>=first);
  const current = balances(model,asOf),opening=days[0]?.opening || {};
  const closing=days.at(-1)?.closing || {};
  return {...result,opening,closing,current,month};
}

// Stable keys link expected and actual dates without duplicating forecast postings.
export function expectedRows(model, month, entity, kind) {
  const requestedEnd=monthBounds(shiftMonth(month,1)).last,limit=forecastEnd(model.start),end=requestedEnd<limit?requestedEnd:limit;
  const all=occurrences({...model,transactions:[]},end,{includeSkipped:true});
  if(model.accounts.some(a=>a.credit?.scheduleId)){
    const paymentRows=new Map(planningForecast(model,end).planned.filter(t=>t.creditPayment).map(t=>[t.scheduleKey,t]));
    for(let i=0;i<all.length;i++)if(paymentRows.has(all[i].scheduleKey))all[i]=paymentRows.get(all[i].scheduleKey);
  }
  const matched=new Map(model.transactions.filter(t=>t.scheduleKey).map(t=>[t.scheduleKey,t]));
  const keys=new Set(all.map(t=>t.scheduleKey));
  // Preserve recorded history when the source schedule is stopped or removed.
  for(const actual of matched.values())if(!keys.has(actual.scheduleKey))all.push({...actual,id:actual.scheduleKey,status:'forecast',nominalDate:actual.scheduleKey.slice(-10)});
  if(kind==='income')for(const actual of model.transactions.filter(t=>!t.scheduleKey&&incomingOwner(model,t)===entity))all.push({...actual,actual});
  return all.filter(t=>(t.date.slice(0,7)===month || matched.get(t.scheduleKey)?.date.slice(0,7)===month) &&
    (kind==='income' ? incomingOwner(model,t)===entity : t.entries.some(e=>e.amount<=0)&&model.accounts.find(a=>a.id===t.entries[0].account)?.entity===entity))
    .map(t=>({...t,actual:t.actual||matched.get(t.scheduleKey)}));
}
