import {spendingParts,transactionOwner} from './money-categories.mjs';
import {date,addDays,balances,principalSnapshots,balanceUnknownAt} from './money-engine.mjs';

const validMoney=n=>Number.isSafeInteger(n)&&n>=0;
const validApr=n=>n===null||n===undefined||Number.isFinite(n)&&n>=0&&n<=1000;
export function validateCredit(model){
 for(const a of model.accounts){
  const c=a.credit;if(!c)continue;
  if(a.type==='cash')throw Error('Credit terms need a debt account.');
  for(const key of ['purchaseApr','purchasePromoApr','promoApr','postPromoApr','transferFeePercent'])if(!validApr(c[key]))throw Error('APR or fee must be blank or a nonnegative percentage.');
  for(const change of c.transferFeeChanges||[]){date(change.date);if(change.percent==null||!validApr(change.percent))throw Error('Enter a valid future transfer fee.');}
  for(const key of ['promoBalance','minimum','payoffQuote'])if(c[key]!==undefined&&c[key]!==null&&!validMoney(c[key]))throw Error('Invalid credit amount.');
  for(const key of ['promoStart','promoEnd','purchasePromoEnd','transferDeadline','finalPaymentDate'])if(c[key])date(c[key]);
  if(c.promoStart&&c.promoEnd&&c.promoStart>c.promoEnd)throw Error('Promotion start must be on or before its end.');
  if(c.purchasePromoEnd&&c.purchasePromoApr==null)throw Error('Enter the purchase promotional APR.');
  if(c.termsProvisional!==undefined&&typeof c.termsProvisional!=='boolean')throw Error('Invalid provisional terms setting.');
  if(c.termsNotes!==undefined&&typeof c.termsNotes!=='string')throw Error('Invalid credit notes.');
  if(c.minimumAsOf)date(c.minimumAsOf);
  if(c.promoScope&&!['balance_transfer','purchases','all'].includes(c.promoScope))throw Error('Invalid promotion scope.');
  if(c.mode&&!['fixed','full'].includes(c.mode))throw Error('Invalid payment plan.');
  if(c.purchaseGrace!==undefined&&typeof c.purchaseGrace!=='boolean')throw Error('Invalid purchase grace-period setting.');
  if(c.dueDay!==null&&c.dueDay!==undefined&&(!Number.isInteger(c.dueDay)||c.dueDay<1||c.dueDay>31))throw Error('Due day must be 1–31.');
  if(c.warnDays!==undefined&&(!Number.isInteger(c.warnDays)||c.warnDays<0||c.warnDays>730))throw Error('Invalid promotion warning window.');
  if(c.scheduleId&&!model.schedules.some(s=>s.id===c.scheduleId&&s.to===a.id))throw Error('Credit payment schedule is missing.');
 }
 return model;
}
export function transferFeeAt(credit={},asOf){return [...(credit.transferFeeChanges||[])].filter(c=>c.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.percent??credit.transferFeePercent;}
export function creditRates(c={},day){
 const active=!!c.promoEnd&&day<=c.promoEnd&&(!c.promoStart||day>=c.promoStart);
 const purchaseActive=!!c.purchasePromoEnd&&day<=c.purchasePromoEnd;
 return {active,purchase:c.purchasePromoEnd?(purchaseActive?c.purchasePromoApr:c.purchaseApr):active&&['all','purchases'].includes(c.promoScope)?c.promoApr:c.purchaseApr,promo:active?c.promoApr:c.postPromoApr};
}
// Planning estimate: credits pay the higher APR bucket first. Issuer allocation
// of minimum payments, grace periods, statement cycles and fees may differ.
export function reducePromo(promo,total,payment,rates){
 const purchases=Math.max(0,total-promo);
 if((rates.promo??-1)>(rates.purchase??-1))return Math.max(0,promo-payment);
 return Math.max(0,promo-Math.max(0,payment-purchases));
}
export function creditState(account){return {promo:Math.min(account.credit?.promoBalance||0,Math.max(0,-account.opening)),accrued:0,interest:0,missingFrom:null};}
export function creditActivity(account,state,day,events){
 const c=account.credit||{},rates=creditRates(c,day);
 for(const t of events)for(const entry of t.entries.filter(e=>e.account===account.id)){
  if(entry.amount>0){state.promo=reducePromo(state.promo,Math.max(0,state.total||0),entry.amount,rates);state.total=Math.max(0,(state.total||0)-entry.amount);}
  else{if(!c.purchasePromoEnd&&rates.active&&['all','purchases'].includes(c.promoScope)&&t.kind==='expense'&&t.category!=='Interest')state.promo-=entry.amount;state.total=(state.total||0)-entry.amount;}
 }
}
export function accrueCredit(account,state,day,total){
 const rates=creditRates(account.credit,day),promo=Math.min(state.promo,total),purchase=Math.max(0,total-promo);
 if(account.type==='card'&&account.credit?.purchaseGrace===true)rates.purchase=0;
 const missing=promo>0&&rates.promo==null||purchase>0&&rates.purchase==null;
 if(missing)state.missingFrom ||= day;
 state.accrued+=(promo*(rates.promo??0)+purchase*(rates.purchase??0))/100/365;
 return missing;
}
export function installPaymentPlan(model,id,{mode='fixed',amount=0,day,from,monthly={},asOf}){
 const next=structuredClone(model),a=next.accounts.find(a=>a.id===id&&a.type!=='cash');if(!a)throw Error('Choose a credit account.');
 date(asOf);if(asOf<next.start)throw Error('Payment plan begins before tracking.');
 if(!validMoney(amount)||!Number.isInteger(day)||day<1||day>31||!['fixed','full'].includes(mode))throw Error('Set a valid payment, due day and payment mode.');
 if(!next.accounts.some(a=>a.id===from&&a.type==='cash'))throw Error('Choose a cash account for payments.');
 const linked=next.schedules.filter(s=>s.to===id&&s.enabled!==false&&!s.stoppedFrom);
 let s=next.schedules.find(s=>s.id===a.credit?.scheduleId)||next.schedules.find(s=>s.id===a.credit?.referenceScheduleId);
 if(!s&&linked.length>1)throw Error('This card has multiple recurring payment schedules. Pause the extras before applying one payment plan.');
 s ||= linked[0];
 const base=mode==='full'?Math.max(1,Math.max(0,-a.opening)):Math.max(1,amount);
 if(!s){s={id:'credit-payment:'+id,name:a.name+' payment',account:from,to:id,frequency:'monthly',anchor:asOf,day,amount:-base};next.schedules.push(s);}
 // Keep matching keys and already recorded history when changing future timing.
 if(s.frequency!=='monthly'||s.day!==day){s.stoppedFrom=asOf;s={id:'credit-payment:'+id+':'+asOf,name:a.name+' payment',account:from,to:id,frequency:'monthly',anchor:asOf,day,amount:-base};if(next.schedules.some(x=>x.id===s.id))throw Error('A payment plan already uses that start date. Edit its existing due day instead.');next.schedules.push(s);}
 else{s.account=from;s.enabled=true;delete s.stoppedFrom;s.changes=[...(s.changes||[]).filter(c=>c.date<asOf),{date:asOf,amount:-base}];}
 s.to=id;s.funding=next.accounts.find(x=>x.id===from).entity!==a.entity?'contribution':undefined;s.expenseEntity=a.entity;
 s.overrides={...s.overrides};
 for(const [month,value] of Object.entries(monthly)){
  date(month+'-01');if(!validMoney(value))throw Error('Monthly payments must be nonnegative cents.');
  const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate(),when=month+'-'+String(Math.min(day,last)).padStart(2,'0');
  if(when>=asOf)s.overrides[when]={...s.overrides[when],amount:-value,account:from,to:id};
 }
 a.credit={...a.credit,mode,dueDay:day,scheduleId:s.id,paymentStart:asOf,paymentAmount:amount};
 next.planning={...next.planning,cardPayoffs:(next.planning?.cardPayoffs||[]).map(p=>p.card===id?{...p,enabled:false}:p)};
 return validateCredit(next);
}
export function scenarioSnapshot(model,asOf,overrides={}){
 date(asOf);if(asOf<model.start)throw Error('Scenario date precedes the opening balance.');
 const next=structuredClone(model),current=balances(model,asOf);next.start=asOf;
 for(const a of next.accounts){if(a.credit)a.credit.promoBalance=actualPromoBalance(model,a,asOf);a.opening=current[a.id];if(!balanceUnknownAt(a,asOf)){a.balanceUnknown=false;const future=principalSnapshots(a).filter(s=>s.date>asOf);if(future.length){a.principalSnapshots=future;}else{delete a.principalSnapshots;}}if(overrides[a.id]!==undefined){if(!validMoney(overrides[a.id]))throw Error('Scenario debt must be a nonnegative amount.');a.opening=-overrides[a.id];a.balanceUnknown=false;delete a.principalSnapshots;}}
 const included=next.transactions.filter(t=>t.date<=asOf);next.transactions=next.transactions.filter(t=>t.date>asOf);
 // Future recorded refunds still need their original category basis after older postings become the snapshot opening.
 const futureSources=new Set(next.transactions.filter(t=>t.kind==='refund').map(t=>t.refundOf));next.refundContext=[];
 for(const original of [...(model.refundContext||[]),...included.filter(t=>t.kind==='expense')])if(futureSources.has(original.id)){
  const remaining=new Map();for(const part of spendingParts(original))remaining.set(part.category,(remaining.get(part.category)||0)+part.amount);for(const receipt of included.filter(t=>t.kind==='refund'&&t.refundOf===original.id))for(const p of spendingParts(receipt))remaining.set(p.category,(remaining.get(p.category)||0)+p.amount);
  const allocations=[...remaining].filter(([,amount])=>amount>0).map(([category,amount])=>({category,amount}));next.refundContext.push({...original,date:asOf,expenseEntity:transactionOwner(model,original),entries:[{account:original.entries[0].account,amount:-allocations.reduce((n,p)=>n+p.amount,0)}],allocations});
 }if(!next.refundContext.length)delete next.refundContext;
 for(const t of included.filter(t=>t.scheduleKey)){const id=t.scheduleKey.slice(0,-11),s=next.schedules.find(s=>s.id===id);if(s)s.skipped=[...new Set([...(s.skipped||[]),t.scheduleKey.slice(-10)])];}
 for(const s of next.schedules)if(s.overrides)for(const key of Object.keys(s.overrides))if(s.overrides[key].date&&s.overrides[key].date<asOf)delete s.overrides[key];
 return next;
}
export function transferScenario(model,from,to,amount,fee=0){
 if(from===to||!validMoney(amount)||amount===0||!validMoney(fee))throw Error('Choose different debt accounts and a positive transfer.');
 const next=structuredClone(model),a=next.accounts.find(a=>a.id===from&&a.type!=='cash'),b=next.accounts.find(a=>a.id===to&&a.type!=='cash');
 if(!a||!b||a.entity!==b.entity||amount>Math.max(0,-a.opening))throw Error('Transfer must stay within one owner and the source debt balance.');
 if(b.credit?.transferDeadline&&next.start>b.credit.transferDeadline)throw Error('The receiving account’s promotional transfer deadline has passed. Update its terms before using this offer.');
 a.opening+=amount;b.opening-=amount+fee;
 if(a.credit)a.credit.promoBalance=Math.min(a.credit.promoBalance||0,Math.max(0,-a.opening));
 if(b.credit?.promoEnd&&next.start<=b.credit.promoEnd&&['balance_transfer','all'].includes(b.credit.promoScope))b.credit.promoBalance=(b.credit.promoBalance||0)+amount+fee;
 return next;
}
export function promoSummary(model,account,asOf,projection){
 const c=account.credit;if(!c?.promoEnd)return null;
 const days=Math.ceil((+date(c.promoEnd)- +date(asOf))/86400000);
 let opportunities=0;for(let d=asOf;d<=c.promoEnd&&opportunities<1000;d=addDays(d,1)){const dt=date(d),last=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate();if(dt.getUTCDate()===Math.min(c.dueDay||1,last))opportunities++;}
 const point=projection?.days.find(d=>d.date===c.promoEnd),remaining=point?.credit?.[account.id]?.promo??null;
 return {days,urgent:days<=(c.warnDays??180),remaining,opportunities,target:opportunities?Math.ceil(actualPromoBalance(model,account,asOf)/opportunities):null};
}
export function actualPromoBalance(model,account,asOf){
 const state={...creditState(account),total:Math.max(0,-account.opening)};
 for(const t of [...model.transactions].filter(t=>t.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date)))creditActivity(account,state,t.date,[t]);
 return Math.min(state.promo,Math.max(0,-balances(model,asOf)[account.id]));
}
