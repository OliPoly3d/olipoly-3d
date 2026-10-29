import {validate} from './money-engine.mjs';

function occurrence(model,key){
  const source=model.schedules.find(s=>s.id===key?.slice(0,-11));
  if(!source)throw Error('The recurring plan was not found.');
  return {source,day:key.slice(-10)};
}
function oneOff(t){
 const outgoing=t.entries.find(e=>e.amount<0)||t.entries[0];
 if(t.kind==='refund')throw Error('A linked refund is an actual receipt. Delete or edit it, or plan a separate expected receipt.');
 return {id:'planned-'+t.id,name:t.description,frequency:'monthly',anchor:t.date,end:t.date,day:Number(t.date.slice(-2)),account:outgoing.account,amount:outgoing.amount,category:t.category||'Other',estimated:true,oneTime:true,incomeType:t.incomeType,expenseEntity:t.expenseEntity,funding:t.funding,...(t.allocations?{allocations:t.allocations}:{}),...(t.kind==='transfer'?{to:t.entries.find(e=>e.account!==outgoing.account).account}:{})};
}
export function changeExpectation(model,key,action){
  const next=structuredClone(model),{source,day}=occurrence(next,key);
  if(action==='skip')source.skipped=[...new Set([...(source.skipped||[]),day])];
  else if(action==='restore')source.skipped=(source.skipped||[]).filter(d=>d!==day);
  else if(action==='stop')source.stoppedFrom=day;
  else throw Error('Choose how to change the expected item.');
  return validate(next);
}
export function removeActual(model,id,mode){
  const next=structuredClone(model),t=next.transactions.find(t=>t.id===id);
  if(!t)throw Error('Transaction was not found.');
  if(!['delete','plan'].includes(mode))throw Error('Choose whether to delete or put back in the budget.');
  if(mode==='plan'&&t.kind==='adjustment')throw Error('A balance adjustment cannot be a budget item.');
  if(model.transactions.some(x=>x.kind==='refund'&&x.refundOf===id))throw Error('This purchase has linked refunds. Edit or reclassify those receipts before removing the purchase.');
  if(mode==='plan'&&t.kind==='refund')throw Error('A linked refund is an actual receipt. Edit or delete it rather than putting it back in the budget.');
  next.transactions=next.transactions.filter(x=>x.id!==id);
  if(t.scheduleKey){
    const source=next.schedules.find(s=>s.id===t.scheduleKey.slice(0,-11));
    if(source){
      const day=t.scheduleKey.slice(-10);
      if(mode==='delete')source.skipped=[...new Set([...(source.skipped||[]),day])];
      else{
        if(source.enabled===false||source.stoppedFrom&&day>=source.stoppedFrom){
          source.skipped=[...new Set([...(source.skipped||[]),day])];
          next.schedules.push(oneOff(t));return validate(next);
        }
        const outgoing=t.entries.find(e=>e.amount<0)||t.entries[0];
        source.overrides={...source.overrides,[day]:{date:t.date,amount:outgoing.amount,account:outgoing.account,...(t.kind==='transfer'?{to:t.entries.find(e=>e.account!==outgoing.account).account}:{})}};
        source.skipped=(source.skipped||[]).filter(d=>d!==day);
      }
      return validate(next);
    }
  }
  if(mode==='plan'){
    next.schedules.push(oneOff(t));
  }
  return validate(next);
}
