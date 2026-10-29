// Review, reconciliation and comparisons consume the shared posting engine.
import {balanceUnknownAt,balances,occurrences,addDays,date,validate} from './money-engine.mjs';
import {budgetMonth,monthBounds,shiftMonth,validateBudgets} from './money-budget.mjs';
import {planningSnapshot} from './money-insights.mjs';
import {planningForecast} from './money-planning.mjs';
import {calendarFrequency} from './money-recurrence.mjs';
import {validateScenarioSettings} from './money-scenarios.mjs';
const cashIds=(m,entity)=>new Set(m.accounts.filter(a=>a.type==='cash'&&a.entity===entity).map(a=>a.id));
export function validateConfidence(m){
 validateScenarioSettings(m);
 for(const a of m.accounts){
  if(a.payoutReserve!==undefined&&(!Number.isSafeInteger(a.payoutReserve)||a.payoutReserve<0))throw Error('Payout reserve must be nonnegative cents.');
  if(a.cashRules&&!Array.isArray(a.cashRules))throw Error('Invalid cash buffers.');
  for(const r of a.cashRules||[]){if(!r.id||!r.label||!Number.isInteger(r.day)||r.day<1||r.day>31||!['opening','closing'].includes(r.point)||!Number.isSafeInteger(r.amount)||r.amount<0||r.month!==undefined&&(!Number.isInteger(r.month)||r.month<1||r.month>12))throw Error('Invalid dated cash buffer.');}
 }
 for(const key of ['reconciliations','forecastSnapshots','monthClosures','monthReopenHistory','weeklyReviews','budgetMoves'])if(m[key]&&!Array.isArray(m[key]))throw Error('Invalid review history.');
 for(const c of m.monthClosures||[]){monthBounds(c.month);date(c.closedOn);if(!['household','business','custodial'].includes(c.entity)||typeof c.signature!=='string'||!Number.isSafeInteger(c.cash))throw Error('Invalid closed month.');}
 for(const r of m.reconciliations||[]){date(r.asOf);if(!m.accounts.some(a=>a.id===r.account)||!['posted','pending'].includes(r.basis)||!Number.isSafeInteger(r.bankBalance)||typeof r.signature!=='string')throw Error('Invalid reconciliation checkpoint.');}
 for(const s of m.forecastSnapshots||[]){monthBounds(s.month);date(s.asOf);if(s.source!==undefined&&!['automatic','manual'].includes(s.source))throw Error('Invalid baseline source.');if(!['household','business','custodial'].includes(s.entity)||!s.components||['opening','income','spending','transfers','adjustments','closing'].some(k=>!Number.isSafeInteger(s.components[k])))throw Error('Invalid forecast comparison.');}
 for(const r of m.weeklyReviews||[]){date(r.asOf);if(!r.id||!['household','business','custodial'].includes(r.entity)||!['reviewed','followups'].includes(r.status)||['followups','checked','accounts','expected','pending','missingTargets'].some(k=>!Number.isSafeInteger(r[k])||r[k]<0))throw Error('Invalid weekly review.');}
 for(const r of m.budgetMoves||[]){date(r.asOf);monthBounds(r.month);monthBounds(r.through);if(!r.id||!['household','business','custodial'].includes(r.entity)||!Number.isSafeInteger(r.amount)||r.amount<=0||!r.from||!r.to)throw Error('Invalid budget-move history.');}
 return m;
}
export function reconciliation(m,account,asOf,basis,bankBalance){
 date(asOf);if(asOf<m.start||!['posted','pending'].includes(basis)||!Number.isSafeInteger(bankBalance))throw Error('Check the date, balance and comparison basis.');
 const a=m.accounts.find(a=>a.id===account);if(!a||balanceUnknownAt(a,asOf))throw Error('Enter the account’s principal first.');
 const relevant=m.transactions.filter(t=>t.date<=asOf&&t.entries.some(e=>e.account===account)&&(basis==='pending'||t.status!=='pending'));
 const signature=JSON.stringify([m.start,a.opening,relevant.map(t=>[t.id,t.date,t.status,t.entries.filter(e=>e.account===account)])]);
 const ledger=balances(m,asOf,basis==='posted')[account];return {account,asOf,basis,bankBalance,signature,ledger,difference:bankBalance-ledger};
}
export function checkpointValid(m,r){try{return reconciliation(m,r.account,r.asOf,r.basis,r.bankBalance).signature===r.signature&&reconciliation(m,r.account,r.asOf,r.basis,r.bankBalance).difference===0;}catch{return false;}}
export function verifyBalance(m,values,{adjust=false,reason='',id}={}){
 const next=structuredClone(m);let r=reconciliation(next,values.account,values.asOf,values.basis,values.bankBalance);
 if(r.difference){if(!adjust)throw Error('Resolve the difference before marking verified.');if(r.basis!=='posted'||!reason.trim()||!id)throw Error('A posted-balance adjustment needs an explicit reason.');next.transactions.push({id,date:r.asOf,description:'Reconciliation adjustment',kind:'adjustment',status:'reconciled',note:reason.trim(),entries:[{account:r.account,amount:r.difference}]});r=reconciliation(next,r.account,r.asOf,r.basis,r.bankBalance);}
 next.reconciliations=[...(next.reconciliations||[]).filter(x=>x.account!==r.account),r];return validateConfidence(validateBudgets(validate(next)));
}
export function attentionItems(m,asOf,entity,end=monthBounds(shiftMonth(asOf.slice(0,7),11)).last){
 const items=[],owner=id=>m.accounts.find(a=>a.id===id)?.entity;
 for(const a of m.accounts.filter(a=>a.entity===entity)){
  const debt=a.type!=='cash',r=m.reconciliations?.find(r=>r.account===a.id);
  if(balanceUnknownAt(a,asOf))items.push({text:a.name+': principal is unknown',action:'opening',id:a.id,debt});
  else if((a.type!=='card'||balances(m,asOf)[a.id]!==0||m.transactions.some(t=>t.date>=addDays(asOf,-30)&&t.entries.some(e=>e.account===a.id)))&&(!r||!checkpointValid(m,r)||r.asOf<addDays(asOf,-7)))items.push({text:a.name+': '+(r?'balance verification needs updating':'balance not yet verified'),action:'reconcile',id:a.id,debt});
  const c=a.credit||{},owed=Math.max(0,-balances(m,asOf)[a.id]);
  if(debt&&(owed>0&&c.termsProvisional||owed>0&&(c.purchaseApr==null||!c.dueDay||c.minimum==null||!c.minimumAsOf||c.minimumAsOf<addDays(asOf,-45))))items.push({text:a.name+': review rates, minimum, due date or provisional terms',action:'credit',id:a.id,debt:true});
  for(const ending of new Set([c.promoEnd,c.purchasePromoEnd].filter(Boolean)))if(owed>0&&ending<=addDays(asOf,c.warnDays??180))items.push({text:a.name+': promotional rate '+(ending<asOf?'expired ':'ends ')+ending,action:'credit',id:a.id,debt:true});
 }
 for(const t of occurrences(m,asOf).filter(t=>t.date<asOf&&owner(t.entries[0].account)===entity))items.push({text:t.description+' · '+t.date+': not recorded',action:'record',transaction:t,debt:t.entries.some(e=>m.accounts.find(a=>a.id===e.account)?.type!=='cash')});
 for(const b of (m.unscheduledBills||[]).filter(b=>b.entity===entity))items.push({text:b.name+': '+b.reason,action:'bill',id:b.id||b.name});
 const p=planningForecast(m,end),missing=p.issues.filter(i=>i.entity===entity),seen=new Set();for(const i of missing)if(!seen.has(i.category)){seen.add(i.category);items.push({text:i.category+': '+i.reason+' from '+i.month,action:'budget',month:i.month});}
 for(const s of m.schedules.filter(s=>s.enabled!==false&&!s.stoppedFrom&&s.estimated&&s.reviewStatus!=='confirmed'&&s.reviewStatus!=='estimated'&&owner(s.account)===entity&&(!s.end||s.end>=asOf)&&s.anchor<=addDays(asOf,90)))items.push({text:s.name+': provisional schedule',action:'schedule',id:s.id,debt:[s.account,s.to].filter(Boolean).some(id=>m.accounts.find(a=>a.id===id)?.type!=='cash')});
 for(const s of (m.seasonalItems||[]).filter(s=>s.entity===entity&&s.review))items.push({text:s.name+': '+s.review,action:'seasonal',id:s.id});
 return items.map(item=>({...item,priority:item.action==='record'||item.action==='bill'||item.action==='opening'||item.action==='budget'&&item.month<=asOf.slice(0,7)?'Act now':item.action==='credit'||item.action==='reconcile'?'Coming up':'Planning'}));
}
export function cashCapacity(m,account,asOf,{business=false}={}){
 const a=m.accounts.find(a=>a.id===account&&a.type==='cash');if(!a)throw Error('Select a cash account.');
 const future=occurrences(m,addDays(asOf,45)).sort((a,b)=>a.date.localeCompare(b.date)),nextPay=future.find(t=>{const s=m.schedules.find(s=>t.scheduleKey.startsWith(s.id+':'));return t.date>asOf&&t.kind==='income'&&t.entries[0].account===account&&s&&!s.oneTime&&!calendarFrequency(s);});
 const end=business?addDays(asOf,30):nextPay?addDays(nextPay.date,-1):addDays(asOf,30),snapshot=planningSnapshot(m,asOf),projection=planningForecast(snapshot,end),reasons=[];
 if(projection.incompleteFrom[a.entity])reasons.push('Missing category targets or funding');
 if((m.unscheduledBills||[]).some(b=>b.entity===a.entity))reasons.push('Unscheduled obligations');
 if(occurrences(m,asOf).some(t=>t.date<asOf&&t.entries.some(e=>e.account===account&&e.amount<0)))reasons.push('Overdue expectations need recording or removing');
 if(projection.creditWarnings.some(w=>m.accounts.some(x=>x.entity===a.entity&&w.startsWith(x.name+':'))))reasons.push('Credit interest or payment details need review');
 const r=m.reconciliations?.find(r=>r.account===account);if(!r||!checkpointValid(m,r)||r.asOf<addDays(asOf,-7))reasons.push('Verify the current bank balance');
 if(business&&a.payoutReserve===undefined)reasons.push('Confirm additional tax / working-cash reserve');
 const floor=Math.max(a.reserve||0,business?a.payoutReserve||0:0);let headroom=Infinity,low=Infinity;
 for(const d of projection.days){low=Math.min(low,d.low[account]);headroom=Math.min(headroom,d.low[account]-floor);
  for(const rule of a.cashRules||[])if(Number(d.date.slice(-2))===Math.min(rule.day,monthBounds(d.date.slice(0,7)).days)&&(!rule.month||rule.month===Number(d.date.slice(5,7))))headroom=Math.min(headroom,d[rule.point][account]-Math.max(floor,rule.amount));
 }
 return {end,nextPay:nextPay?.date,low,floor,headroom,available:Math.max(0,headroom),complete:!reasons.length,reasons:[...new Set(reasons)]};
}
export function categoryTrend(m,month,entity,id,asOf){
 return Array.from({length:12},(_,i)=>{const key=shiftMonth(month,i-11),b=budgetMonth(m,key,entity,asOf).buckets.find(b=>b.id===id),prior=shiftMonth(key,-12),old=budgetMonth(m,prior,entity,asOf).buckets.find(b=>b.id===id);return {month:key,target:b?.allowance??null,actual:key<m.start.slice(0,7)||key>asOf.slice(0,7)?null:b?.spent??0,prior:prior<m.start.slice(0,7)||prior>asOf.slice(0,7)?null:old?.spent??0,partial:key===asOf.slice(0,7)||key===m.start.slice(0,7)&&m.start.slice(-2)!=='01'};});
}
export function cashComponents(m,month,entity,days){
 const selected=days.filter(d=>d.date.startsWith(month)),ids=cashIds(m,entity),sum=values=>[...ids].reduce((n,id)=>n+(values?.[id]||0),0),out={opening:sum(selected[0]?.opening),income:0,spending:0,transfers:0,adjustments:0,closing:sum(selected.at(-1)?.closing)};
 for(const d of selected)for(const t of d.events){const amount=t.entries.filter(e=>ids.has(e.account)).reduce((n,e)=>n+e.amount,0);if(t.kind==='income')out.income+=amount;else if(['expense','refund'].includes(t.kind))out.spending-=amount;else if(t.kind==='transfer')out.transfers+=amount;else out.adjustments+=amount;}
 return out;
}
export function saveForecastSnapshot(m,month,entity,asOf){
 if(month<asOf.slice(0,7)||month<m.start.slice(0,7))throw Error('Save a baseline for this month or a future month; past forecasts cannot be recreated.');
 if(m.forecastSnapshots?.some(s=>s.month===month&&s.entity===entity))throw Error('A baseline is already saved for this month.');
 const p=planningForecast(m,monthBounds(month).last),next=structuredClone(m);next.forecastSnapshots=[...(next.forecastSnapshots||[]),{month,entity,asOf,source:'manual',complete:!(p.incompleteFrom[entity]&&p.incompleteFrom[entity]<=month)&&!p.creditWarnings.length&&!(m.unscheduledBills||[]).some(b=>b.entity===entity),components:cashComponents(m,month,entity,p.days)}];return validateConfidence(next);
}
export function missingBaselineOwners(model,asOf){
 date(asOf);const month=asOf.slice(0,7);if(asOf<model.start)return [];
 return ['household','business','custodial'].filter(entity=>model.accounts.some(a=>a.entity===entity&&a.type==='cash')&&!model.forecastSnapshots?.some(s=>s.month===month&&s.entity===entity)&&!model.monthClosures?.some(c=>c.month===month&&c.entity===entity));
}
// Capture the saved current-month plan once per owner; never backfill past months.
export function ensureMonthlyBaselines(model,asOf){
 let next=model;
 for(const entity of missingBaselineOwners(model,asOf)){
  next=saveForecastSnapshot(next,asOf.slice(0,7),entity,asOf);
  next.forecastSnapshots.at(-1).source='automatic';
 }
 return next;
}
export function forecastComparison(m,snapshot,asOf){
 // Actual-only postings; future schedules and budget reserves never count as actual.
 const end=monthBounds(snapshot.month).last<asOf?monthBounds(snapshot.month).last:asOf,days=[];let previous=balances(m,addDays(m.start,-1));
 for(let d=m.start;d<=end;d=addDays(d,1)){const closing=balances(m,d);days.push({date:d,opening:previous,closing,events:m.transactions.filter(t=>t.date===d)});previous=closing;}
 const actual=cashComponents(m,snapshot.month,snapshot.entity,days),p=snapshot.components,bridge={opening:actual.opening-p.opening,income:actual.income-p.income,spending:p.spending-actual.spending,transfers:actual.transfers-p.transfers,adjustments:actual.adjustments-p.adjustments};
 const closed=snapshot.month<asOf.slice(0,7),verified=[...cashIds(m,snapshot.entity)].every(id=>{const r=m.reconciliations?.find(r=>r.account===id);return r&&r.asOf>=monthBounds(snapshot.month).last&&checkpointValid(m,r)&&!m.transactions.some(t=>t.status==='pending'&&t.date<=monthBounds(snapshot.month).last&&t.entries.some(e=>e.account===id));});
 return {actual,bridge,variance:actual.closing-p.closing,final:closed&&verified,status:closed?(verified?'Verified month':'Recorded totals · provisional'):'In progress · month to date versus full plan'};
}
