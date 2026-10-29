import {addDays,date,principalSnapshots} from './money-engine.mjs';

export function setLoanDetails(model,id,{principal,asOf,finalPaymentDate,apr}){
 const next=structuredClone(model),a=next.accounts.find(a=>a.id===id&&a.type==='loan');if(!a)throw Error('Choose a loan account.');
 date(asOf);if(asOf<next.start||!Number.isSafeInteger(principal)||principal<0)throw Error('Enter a current principal and a balance date on or after tracking starts.');
 if(apr!==null&&(!Number.isFinite(apr)||apr<0||apr>1000))throw Error('Enter a valid loan APR, or leave it unknown.');
 if(finalPaymentDate){date(finalPaymentDate);if(finalPaymentDate<asOf)throw Error('The final scheduled payment must be on or after the balance date.');}
 a.principalSnapshots=[...principalSnapshots(a).filter(s=>s.date!==asOf),{date:asOf,balance:-principal}].sort((a,b)=>a.date.localeCompare(b.date));a.credit={...a.credit,purchaseApr:apr,finalPaymentDate:finalPaymentDate||null};
 let s=next.schedules.find(s=>s.id===a.credit.scheduleId),reference=next.schedules.find(s=>s.id===a.credit.referenceScheduleId);
 if(!s&&reference){
  if(reference.frequency!=='monthly')throw Error('A linked loan payment plan currently requires a monthly schedule.');
  const start=addDays(asOf,1);if(next.transactions.some(t=>t.scheduleKey?.startsWith(reference.id+':')&&t.date>=start))throw Error('Review future recorded loan payments before changing their schedule.');
  reference.stoppedFrom=start;
  s={...structuredClone(reference),id:'loan-payment:'+a.id+':'+start,name:reference.name,anchor:start,to:a.id,enabled:true,estimated:true};delete s.stoppedFrom;delete s.skipped;
  if(s.overrides)s.overrides=Object.fromEntries(Object.entries(s.overrides).filter(([key,o])=>(o.date||key)>=start));
  if(next.schedules.some(x=>x.id===s.id))throw Error('This dated loan payment plan already exists.');next.schedules.push(s);
  a.credit={...a.credit,mode:'fixed',scheduleId:s.id,paymentStart:start,paymentAmount:Math.abs(s.amount),dueDay:s.day};
 }
 if(s){if(finalPaymentDate)s.end=finalPaymentDate;else delete s.end;}
 return next;
}
