import {balanceUnknownAt,balances,date} from './money-engine.mjs';
import {validateBudgets,budgetMonth} from './money-budget.mjs';
import {scenarioSnapshot} from './money-credit.mjs';
import {savingsSummary} from './money-savings.mjs';

export function planningSnapshot(model,asOf,overrides={}){
 const next=scenarioSnapshot(model,asOf,overrides),month=asOf.slice(0,7);
 for(const entity of ['household','business','custodial'])for(const b of budgetMonth(model,month,entity,asOf).buckets)if(b.allowance!==null){const target=next.budgets.find(x=>x.id===b.id);target.overrides={...target.overrides,[month]:Math.max(0,b.remaining)};}
 return next;
}

export function resetBaseline(model,start,values,includedKeys=[]){
 date(start);if(start<model.start)throw Error('Choose a new opening date on or after the current one.');
 const next=structuredClone(model),bucketBalances=savingsSummary(model,start).buckets;next.start=start;next.transactions=[];
 for(const b of next.savingsBuckets||[]){b.opening=bucketBalances.find(x=>x.id===b.id).balance;b.start=start;}next.savingsMoves=(next.savingsMoves||[]).filter(move=>move.date>start);
 for(const a of next.accounts){
  delete a.principalSnapshots;
  if(!Object.hasOwn(values,a.id))throw Error('Supply every opening balance.');
  const value=values[a.id];if(value===null&&a.type==='loan'){a.opening=0;a.balanceUnknown=true;continue;}
  if(!Number.isSafeInteger(value))throw Error('Opening balances must be exact cents.');
  a.opening=a.type==='cash'?value:-value;a.balanceUnknown=false;
  if(a.credit)a.credit.promoBalance=Math.min(a.credit.promoBalance||0,Math.max(0,-a.opening));
 }
 for(const s of next.schedules){
  if(s.overrides)for(const key of Object.keys(s.overrides))if((s.overrides[key].date||key)<start)delete s.overrides[key];
  const included=includedKeys.filter(k=>k.startsWith(s.id+':')).map(k=>k.slice(-10));
  if(included.length)s.skipped=[...new Set([...(s.skipped||[]),...included])];
 }
 next.baseline={...next.baseline,date:start,reviewed:true,note:'Opening balances replace prior actual activity. Earlier revisions retain that history.'};
 return validateBudgets(next);
}
export function annualSummary(model,projection,year,entity){
 const accounts=model.accounts.filter(a=>a.entity===entity),cash=accounts.filter(a=>a.type==='cash'),cards=accounts.filter(a=>a.type==='card'),loans=accounts.filter(a=>a.type==='loan');
 const selected=projection.days.filter(d=>d.date.startsWith(String(year))),months=new Map();
 for(const d of selected){
  const key=d.date.slice(0,7),m=months.get(key)||{month:key,income:0,spending:0,interest:0,payments:0,cash:0,cardDebt:0,loanDebt:0,low:Infinity,complete:true,debtComplete:true};
  for(const t of d.events){
   const owner=t.expenseEntity||model.accounts.find(a=>a.id===t.entries[0].account)?.entity;
   if(t.kind==='income'&&owner===entity)m.income+=t.entries[0].amount;
   if(t.kind==='expense'&&owner===entity){m.spending-=t.entries[0].amount;if(t.creditInterest||t.category?.toLowerCase()==='interest')m.interest-=t.entries[0].amount;}
   if(t.kind==='transfer')for(const e of t.entries)if(e.amount>0&&[...cards,...loans].some(a=>a.id===e.account))m.payments+=e.amount;
  }
  m.cash=cash.reduce((n,a)=>n+d.closing[a.id],0);m.cardDebt=cards.reduce((n,a)=>n+Math.max(0,-d.closing[a.id]),0);m.loanDebt=loans.reduce((n,a)=>n+Math.max(0,-d.closing[a.id]),0);
  m.low=Math.min(m.low,cash.reduce((n,a)=>n+d.low[a.id],0));
  m.complete=!(projection.incompleteFrom[entity]&&key>=projection.incompleteFrom[entity]);
  m.cardComplete=!cards.some(a=>balanceUnknownAt(a,d.date)||d.credit?.[a.id]?.missingFrom);
  m.debtComplete=![...cards,...loans].some(a=>balanceUnknownAt(a,d.date)||d.credit?.[a.id]?.missingFrom);
  months.set(key,m);
 }
 const rows=[...months.values()],last=rows.at(-1);
 return {year,entity,rows,first:selected[0]?.date,last:selected.at(-1)?.date,partial:!selected.length||selected[0].date!==year+'-01-01'||selected.at(-1).date!==year+'-12-31',complete:rows.every(m=>m.complete),cardComplete:rows.every(m=>m.cardComplete),debtComplete:rows.every(m=>m.debtComplete),income:rows.reduce((n,m)=>n+m.income,0),spending:rows.reduce((n,m)=>n+m.spending,0),interest:rows.reduce((n,m)=>n+m.interest,0),payments:rows.reduce((n,m)=>n+m.payments,0),cash:last?.cash??0,cardDebt:last?.cardDebt??0,loanDebt:last?.loanDebt??0};
}
export function currentInventory(model,asOf){const b=balances(model,asOf);return model.accounts.filter(a=>a.type!=='cash').map(a=>({...a,balance:balanceUnknownAt(a,asOf)?null:Math.max(0,-b[a.id])}));}
