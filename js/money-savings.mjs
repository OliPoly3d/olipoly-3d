import {balances,date} from './money-engine.mjs';
export const savingsCategory=bucket=>'Savings · '+bucket.name;

export function validateSavings(model){
 const buckets=model.savingsBuckets||[],ids=new Set(),links=new Set();
 if(!Array.isArray(buckets)||!Array.isArray(model.savingsMoves||[]))throw Error('Invalid savings buckets.');
 for(const b of buckets){
  if(!b.id||ids.has(b.id)||!b.name?.trim())throw Error('Give each savings bucket a unique ID and name.');ids.add(b.id);date(b.start);
  if(!Number.isSafeInteger(b.opening)||b.opening<0||!model.accounts.some(a=>a.id===b.account&&a.type==='cash'))throw Error('Choose a cash account and nonnegative opening allocation.');
  if(b.goalAmount!=null&&(!Number.isSafeInteger(b.goalAmount)||b.goalAmount<0))throw Error('Savings goals must be nonnegative cents.');if(b.goalDate)date(b.goalDate);
  if(!Array.isArray(b.scheduleIds||[]))throw Error('Invalid bucket funding schedules.');
  for(const id of b.scheduleIds||[]){const s=model.schedules.find(s=>s.id===id);if(!s||![s.account,s.to].includes(b.account)||links.has(id))throw Error('A schedule can belong to one bucket and must touch its bank account.');links.add(id);}
 }
 for(const t of [...model.transactions,...model.schedules])if(t.savingsBucket){const b=buckets.find(b=>b.id===t.savingsBucket);if(!b||!(t.entries?t.entries.some(e=>e.account===b.account):[t.account,t.to].includes(b.account)))throw Error('The savings bucket must belong to an account used by this entry.');}
 const moveIds=new Set();for(const move of model.savingsMoves||[]){date(move.date);const from=buckets.find(b=>b.id===move.from),to=buckets.find(b=>b.id===move.to);if(!move.id||moveIds.has(move.id)||!from||!to||from.id===to.id||from.account!==to.account||move.date<from.start||move.date<to.start||!Number.isSafeInteger(move.amount)||move.amount<=0||!move.note?.trim())throw Error('Move savings between two different buckets in the same bank account and include a reason.');moveIds.add(move.id);}
 return model;
}
export function bucketForEntry(model,entry){
 if(entry.savingsBucket)return entry.savingsBucket;
 const schedule=entry.scheduleKey?.slice(0,-11);return (model.savingsBuckets||[]).find(b=>b.scheduleIds?.includes(schedule))?.id||model.schedules.find(s=>s.id===schedule)?.savingsBucket||null;
}
export function savingsSummary(model,asOf,events=model.transactions,bankBalances=balances(model,asOf)){
 date(asOf);validateSavings(model);
 const buckets=(model.savingsBuckets||[]).map(b=>{let incoming=0,outgoing=0,moved=0;
  for(const t of events)if(t.date>=b.start&&t.date<=asOf&&bucketForEntry(model,t)===b.id)for(const e of t.entries.filter(e=>e.account===b.account)){if(e.amount>=0)incoming+=e.amount;else outgoing-=e.amount;}
  for(const move of model.savingsMoves||[])if(move.date>=b.start&&move.date<=asOf){if(move.to===b.id)moved+=move.amount;if(move.from===b.id)moved-=move.amount;}
  return {...b,active:b.start<=asOf,incoming,outgoing,moved,balance:b.start<=asOf?b.opening+incoming-outgoing+moved:0};
 });
 const accounts=[...new Set(buckets.map(b=>b.account))].map(id=>{const allocated=buckets.filter(b=>b.account===id).reduce((n,b)=>n+b.balance,0),bank=bankBalances[id];return {id,bank,allocated,unallocated:bank-allocated};});
 return {buckets,accounts};
}
export function moveSavings(model,move){const next=structuredClone(model);next.savingsMoves=[...(next.savingsMoves||[]),move];validateSavings(next);const summary=savingsSummary(next,move.date);if(summary.buckets.find(b=>b.id===move.from).balance<0)throw Error('This move exceeds that bucket’s available balance.');return next;}
