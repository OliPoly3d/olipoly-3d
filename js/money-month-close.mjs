import {occurrences,balances,addDays,date,principalSnapshots} from './money-engine.mjs';
import {budgetMonth,monthBounds,seasonalMonth} from './money-budget.mjs';
import {checkpointValid} from './money-confidence.mjs';
import {savingsSummary} from './money-savings.mjs';
const owner=(m,t)=>t.expenseEntity||m.accounts.find(a=>a.id===t.entries[0].account)?.entity;
// Names and review notes may change; amounts, dates, ownership and ledger history may not.
export function monthFingerprint(m,month,entity){
 const {first,last}=monthBounds(month),accounts=m.accounts.filter(a=>a.entity===entity),ids=new Set(accounts.map(a=>a.id));
 const transactions=m.transactions.filter(t=>t.date>=first&&t.date<=last&&(owner(m,t)===entity||t.entries.some(e=>ids.has(e.account)))).map(t=>({id:t.id,date:t.date,kind:t.kind,category:t.category,status:t.status,entries:t.entries,scheduleKey:t.scheduleKey||null,expenseEntity:t.expenseEntity||null,...(t.allocations?{allocations:t.allocations}:{}),...(t.refundOf?{refundOf:t.refundOf}:{})})).sort((a,b)=>a.id.localeCompare(b.id));
 const expected=occurrences(m,last).filter(t=>t.date>=first&&(owner(m,t)===entity||t.entries.some(e=>ids.has(e.account)))).map(t=>({key:t.scheduleKey,date:t.date,kind:t.kind,category:t.category,entries:t.entries})).sort((a,b)=>a.key.localeCompare(b.key));
 const budgets=budgetMonth(m,month,entity,last).buckets.map(b=>({id:b.id,name:b.name,aliases:b.aliases||[],allowance:b.allowance,account:b.funding?.[month]||b.account,timing:b.timing?.[month]||{mode:m.planning?.budgetTiming==='month-end'||b.seasonal||b.oneTimeMonth?'month-end':'weekly',weekday:b.weekday??5}})).sort((a,b)=>a.id.localeCompare(b.id));
 const opening=balances(m,addDays(first,-1)),signature={start:m.start,accounts:accounts.map(a=>({id:a.id,type:a.type,opening:opening[a.id],unknown:!!a.balanceUnknown})).sort((a,b)=>a.id.localeCompare(b.id)),transactions,expected,budgets,seasonal:seasonalMonth(m,month,entity).items.map(s=>({id:s.id,expected:s.expected}))};
 const buckets=(m.savingsBuckets||[]).filter(b=>ids.has(b.account)&&b.start<=last);if(buckets.length)signature.savings={buckets:buckets.map(b=>({id:b.id,account:b.account,start:b.start,opening:b.opening,scheduleIds:b.scheduleIds||[]})),moves:(m.savingsMoves||[]).filter(move=>move.date>=first&&move.date<=last&&buckets.some(b=>b.id===move.from)),allocations:m.transactions.filter(t=>t.date>=first&&t.date<=last&&t.savingsBucket&&t.entries.some(e=>ids.has(e.account))).map(t=>[t.id,t.savingsBucket])};
 if(buckets.length){signature.savings.moves=signature.savings.moves.map(({id,date,from,to,amount})=>({id,date,from,to,amount}));signature.savings.closing=savingsSummary(m,last).buckets.filter(b=>buckets.some(x=>x.id===b.id)).map(b=>[b.id,b.balance]);}
 const snapshots=accounts.flatMap(a=>principalSnapshots(a).filter(s=>s.date<=last).map(s=>({account:a.id,...s})));if(snapshots.length)signature.principalSnapshots=snapshots;
 return JSON.stringify(signature);
}
export function closeRequirements(m,month,entity,asOf){
 const {first,last}=monthBounds(month),reasons=[];date(asOf);if(month>=asOf.slice(0,7))reasons.push('Wait until the month has ended.');if(last<m.start)reasons.push('This month predates tracking.');
 for(const a of m.accounts.filter(a=>a.entity===entity&&a.type==='cash')){const r=m.reconciliations?.find(r=>r.account===a.id);if(!r||r.asOf<last||!checkpointValid(m,r))reasons.push('Verify '+a.name+' at month-end or later.');}
 if(m.transactions.some(t=>t.date>=first&&t.date<=last&&t.status==='pending'&&(owner(m,t)===entity||t.entries.some(e=>m.accounts.some(a=>a.id===e.account&&a.entity===entity)))))reasons.push('Settle or correct pending transactions.');
 if(occurrences(m,last).some(t=>t.date>=first&&owner(m,t)===entity))reasons.push('Record or skip every expected deposit, bill and transfer.');
 if(budgetMonth(m,month,entity,last).missing)reasons.push('Complete this month’s category targets.');
 if((m.unscheduledBills||[]).some(b=>b.entity===entity))reasons.push('Resolve unknown bills.');return reasons;
}
export function closeMonth(m,month,entity,asOf){
 if(m.monthClosures?.some(c=>c.month===month&&c.entity===entity))throw Error('This month is already closed.');const reasons=closeRequirements(m,month,entity,asOf);if(reasons.length)throw Error(reasons.join(' '));
 const next=structuredClone(m),ids=m.accounts.filter(a=>a.entity===entity&&a.type==='cash').map(a=>a.id),b=balances(m,monthBounds(month).last);next.monthClosures=[...(next.monthClosures||[]),{month,entity,closedOn:asOf,signature:monthFingerprint(m,month,entity),cash:ids.reduce((n,id)=>n+b[id],0)}];return next;
}
export function reopenMonth(m,month,entity,reason,asOf){
 if(!reason.trim())throw Error('Explain why you are reopening the month.');const next=structuredClone(m);if(!next.monthClosures?.some(c=>c.month===month&&c.entity===entity))throw Error('This month is not closed.');next.monthClosures=next.monthClosures.filter(c=>c.month!==month||c.entity!==entity);next.monthReopenHistory=[...(next.monthReopenHistory||[]),{month,entity,reason:reason.trim(),asOf}];return next;
}
export function assertMonthLocks(previous,next){
 for(const c of previous.monthClosures||[]){const retained=next.monthClosures?.find(x=>x.month===c.month&&x.entity===c.entity);if(!retained){if(!next.monthReopenHistory?.some(r=>r.month===c.month&&r.entity===c.entity&&r.reason?.trim()&&!previous.monthReopenHistory?.some(old=>JSON.stringify(old)===JSON.stringify(r))))throw Error('Reopen '+c.month+' with a reason first.');continue;}
  if(monthFingerprint(next,c.month,c.entity)!==c.signature)throw Error(c.month+' is closed for '+c.entity+'. Record a current-month correction, or reopen that month with a reason.');
 }
}

export function monthEndChecklist(m,month,entity,asOf){
 const {first,last}=monthBounds(month),relevant=t=>owner(m,t)===entity||t.entries.some(e=>m.accounts.find(a=>a.id===e.account)?.entity===entity),pending=m.transactions.filter(t=>t.date>=first&&t.date<=last&&t.status==='pending'&&relevant(t)),expected=occurrences(m,last).filter(t=>t.date>=first&&owner(m,t)===entity),accounts=m.accounts.filter(a=>a.type==='cash'&&a.entity===entity).filter(a=>{const r=m.reconciliations?.find(r=>r.account===a.id);return !r||r.asOf<last||!checkpointValid(m,r);}),budgets=budgetMonth(m,month,entity,last).buckets.filter(b=>b.allowance===null||!b.account&&!b.funding?.[month]),unknown=(m.unscheduledBills||[]).filter(b=>b.entity===entity);
 return {pending,expected,accounts,budgets,unknown,ended:month<asOf.slice(0,7),reasons:closeRequirements(m,month,entity,asOf)};
}
