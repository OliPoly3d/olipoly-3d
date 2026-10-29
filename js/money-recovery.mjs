import {validate,balances,balanceUnknownAt,date} from './money-engine.mjs';
import {validateBudgets} from './money-budget.mjs';
import {validateConfidence} from './money-confidence.mjs';
import {monthFingerprint,assertMonthLocks} from './money-month-close.mjs';

export function backupEnvelope(model,{owner,revision,asOf}){return {format:'olipoly-money-backup',version:1,owner,revision,exportedAt:asOf,body:structuredClone(model)};}
export function readBackup(input,owner){
 const enveloped=input?.format==='olipoly-money-backup';if(enveloped&&(input.version!==1||input.owner!==owner))throw Error('This backup belongs to a different account or uses an unsupported format.');
 const model=structuredClone(enveloped?input.body:input);validateConfidence(validateBudgets(validate(model)));
 for(const c of model.monthClosures||[])if(monthFingerprint(model,c.month,c.entity)!==c.signature)throw Error('This backup contains a closed-month signature that does not match its contents.');
 return {model,legacy:!enveloped,revision:enveloped?input.revision:null};
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const comparable=value=>JSON.stringify(canonical(value));
export function recoveryPreview(current,candidate,asOf){
 validateConfidence(validateBudgets(validate(candidate)));date(asOf);
 const changes=[];for(const [key,label,name] of [['accounts','Account','name'],['transactions','Transaction','description'],['schedules','Schedule','name'],['budgets','Budget','name'],['seasonalItems','YOY item','name'],['savingsBuckets','Savings bucket','name'],['savingsMoves','Savings allocation','note'],['reviewDecisions','Decision','name']]){
  const old=new Map((current[key]||[]).map(x=>[x.id,x])),next=new Map((candidate[key]||[]).map(x=>[x.id,x]));
  for(const [id,value] of old)if(!next.has(id))changes.push({type:label,change:'Remove',name:value[name]||id});else if(comparable(value)!==comparable(next.get(id)))changes.push({type:label,change:'Change',name:value[name]||id});
  for(const [id,value] of next)if(!old.has(id))changes.push({type:label,change:'Add',name:value[name]||id});
 }
 const oldBalances=balances(current,asOf),newBalances=balances(candidate,asOf),accounts=[...new Set([...current.accounts,...candidate.accounts].map(a=>a.id))].map(id=>{const before=current.accounts.find(a=>a.id===id),after=candidate.accounts.find(a=>a.id===id);return {id,name:after?.name||before.name,before:!before||balanceUnknownAt(before,asOf)?null:oldBalances[id],after:!after||balanceUnknownAt(after,asOf)?null:newBalances[id],debt:(after||before).type!=='cash'};});
 const reopened=(current.monthClosures||[]).filter(c=>{try{return !candidate.monthClosures?.some(n=>n.month===c.month&&n.entity===c.entity&&n.signature===c.signature)||monthFingerprint(candidate,c.month,c.entity)!==c.signature;}catch{return true;}});
 return {changes,accounts,reopened,startBefore:current.start,startAfter:candidate.start};
}
export function restorePlan(current,candidate,{reason,reopenClosed=false,asOf,source,revision}){
 if(!reason?.trim())throw Error('Explain why you are restoring this plan.');
 const preview=recoveryPreview(current,candidate,asOf);if(preview.reopened.length&&!reopenClosed)throw Error('Confirm reopening the affected closed months before restoring.');
 const next=structuredClone(candidate),reopened=new Set(preview.reopened.map(c=>c.entity+':'+c.month));
 next.monthClosures=(next.monthClosures||[]).filter(c=>!reopened.has(c.entity+':'+c.month));
 next.monthReopenHistory=[...(current.monthReopenHistory||[]),...(candidate.monthReopenHistory||[]).filter(c=>!(current.monthReopenHistory||[]).some(x=>comparable(c)===comparable(x))),...preview.reopened.map(c=>({month:c.month,entity:c.entity,reason:'Plan recovery: '+reason.trim(),asOf}))];
 next.recoveryHistory=[...(current.recoveryHistory||[]),{asOf,source,previousRevision:revision,reason:reason.trim(),reopened:preview.reopened.map(c=>({month:c.month,entity:c.entity}))}];
 validateConfidence(validateBudgets(validate(next)));assertMonthLocks(current,next);return next;
}
