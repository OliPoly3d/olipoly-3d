import {date,validate,statuses} from './money-engine.mjs';
export const incomeTypes={gift:'Gift / birthday money',windfall:'Windfall',friend:'Friend repayment',other:'Other one-time income',distribution:'OliPoly owner payout'};
export function incomingOwner(model,t){
 const entry=t.kind==='transfer'&&t.funding==='distribution'?t.entries.find(e=>e.amount>0):t.kind==='income'?t.entries[0]:null;
 return entry?(t.kind==='income'&&t.expenseEntity||model.accounts.find(a=>a.id===entry.account)?.entity):null;
}
export function addOneTimeIncome(model,{id,when,description,amount,account,incomeType='other',from,status='plan'}){
 date(when);if(when<model.start)throw Error('Date is before your opening balance.');
 if(!id||!description?.trim()||!Number.isSafeInteger(amount)||amount<=0||!Object.hasOwn(incomeTypes,incomeType)||!['plan',...statuses].includes(status))throw Error('Enter a description, positive amount and valid income type.');
 const destination=model.accounts.find(a=>a.id===account&&a.type==='cash');if(!destination)throw Error('Choose a receiving cash account.');
 const distribution=incomeType==='distribution',source=model.accounts.find(a=>a.id===from&&a.type==='cash'&&a.entity==='business');
 if(distribution&&(!source||destination.entity!=='household'))throw Error('An owner payout needs a business cash source and a household cash destination.');
 const next=structuredClone(model),category=incomeTypes[incomeType],funding=distribution?'distribution':undefined;
 if(status==='plan')next.schedules.push({id:'one-time-'+id,name:description.trim(),frequency:'monthly',anchor:when,end:when,day:Number(when.slice(-2)),account:distribution?from:account,amount:distribution?-amount:amount,...(distribution?{to:account}:{}),category,funding,incomeType,oneTime:true,estimated:true});
 else next.transactions.push({id,description:description.trim(),date:when,kind:distribution?'transfer':'income',entries:distribution?[{account:from,amount:-amount},{account,amount}]:[{account,amount}],category,funding,incomeType,status});
 return validate(next);
}
