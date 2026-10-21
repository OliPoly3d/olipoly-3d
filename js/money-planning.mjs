import {forecast, occurrences, balances} from './money-engine.mjs';
import {budgetMonth, monthBounds, shiftMonth, validateBudgets} from './money-budget.mjs';

// Monthly planning adds only unspent targets and unplanned everyday-card payoffs.
// Every daily/monthly balance still comes from the original posting engine.
export function planningForecast(model, end) {
  validateBudgets(model);
  const base = forecast(model,end), planned = [], adjustments = Object.fromEntries(model.accounts.map(a=>[a.id,0]));
  const scheduled = occurrences(model,end);
  const committed = {...model,transactions:[...model.transactions,...scheduled]};
  const warnings = new Set(), issues = [], incompleteFrom = {};
  function incomplete(month,entity,category,reason) {
    issues.push({month,entity,category,reason});
    incompleteFrom[entity] ||= month;
    warnings.add(reason);
  }
  for (const d of base) {
    if (d.date !== monthBounds(d.date.slice(0,7)).last) continue;
    const month = d.date.slice(0,7);
    for (const entity of ['household','business','custodial']) {
      const result = budgetMonth(committed,month,entity,d.date);
      for (const b of result.buckets) {
        if (b.allowance === null) {incomplete(month,entity,b.shortName||b.name,'Missing category targets');continue;}
        const amount = Math.max(0,b.remaining);
        if (!amount) continue;
        const account = model.accounts.find(a=>a.id===(b.funding?.[month]||b.account) && a.type==='cash' && a.entity===entity);
        if (!account) {incomplete(month,entity,b.shortName||b.name,'Budget funding account needed');continue;}
        planned.push({id:'budget:'+b.id+':'+month,date:d.date,description:b.name+' — remaining budget',kind:'expense',category:b.name,status:'plan',entries:[{account:account.id,amount:-amount}]});
        adjustments[account.id]-=amount;
      }
    }
    for (const p of model.planning?.cardPayoffs || []) {
      if (p.enabled===false) continue;
      const amount=Math.max(0,-(d.closing[p.card]+adjustments[p.card]));
      if (!amount) continue;
      planned.push({id:'payoff:'+p.card+':'+month,date:d.date,description:'Planned full card payoff',kind:'transfer',status:'plan',entries:[{account:p.from,amount:-amount},{account:p.card,amount}]});
      adjustments[p.from]-=amount;adjustments[p.card]+=amount;
    }
  }
  return {days:forecast(model,end,planned),planned,warnings:[...warnings],issues,incompleteFrom};
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
  const end=monthBounds(shiftMonth(month,1)).last;
  const all=occurrences({...model,transactions:[]},end,{includeSkipped:true});
  const matched=new Map(model.transactions.filter(t=>t.scheduleKey).map(t=>[t.scheduleKey,t]));
  const keys=new Set(all.map(t=>t.scheduleKey));
  // Preserve recorded history when the source schedule is stopped or removed.
  for(const actual of matched.values())if(!keys.has(actual.scheduleKey))all.push({...actual,id:actual.scheduleKey,status:'forecast',nominalDate:actual.scheduleKey.slice(-10)});
  return all.filter(t=>(t.date.slice(0,7)===month || matched.get(t.scheduleKey)?.date.slice(0,7)===month) &&
    (kind==='income' ? t.kind==='income' : t.entries.some(e=>e.amount<=0)) &&
    model.accounts.find(a=>a.id===t.entries[0].account)?.entity===entity)
    .map(t=>({...t,actual:matched.get(t.scheduleKey)}));
}
