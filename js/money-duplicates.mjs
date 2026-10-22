import {addDays,date,occurrences} from './money-engine.mjs';
import {planningForecast} from './money-planning.mjs';

const normalized=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function similarDescription(a,b){
 const left=normalized(a),right=normalized(b);
 return left.length>=4&&right.length>=4&&(left===right||(' '+left+' ').includes(' '+right+' ')||(' '+right+' ').includes(' '+left+' '));
}
function sameAccounts(left,right){
 if(left.kind!==right.kind||left.entries.length!==right.entries.length)return false;
 return left.entries.every(e=>right.entries.some(r=>r.account===e.account&&Math.sign(r.amount)===Math.sign(e.amount)));
}
function amountDifference(left,right){return Math.max(...left.entries.map(e=>Math.abs(e.amount-right.entries.find(r=>r.account===e.account).amount)));}

// Suggestions only: never merge/delete or infer that a second purchase is impossible.
export function possibleDuplicates(model,candidate){
 date(candidate.date);
 const end=addDays(candidate.date,7),expected=occurrences(model,end);
 // Full-balance and capped card payments must use the same amounts as Bills.
 if(model.accounts.some(a=>a.credit?.scheduleId)){
  const horizon=addDays(model.start,1130),payments=new Map(planningForecast(model,end<horizon?end:horizon).planned.filter(t=>t.creditPayment).map(t=>[t.scheduleKey,t]));
  for(let i=0;i<expected.length;i++)if(payments.has(expected[i].scheduleKey))expected[i]=payments.get(expected[i].scheduleKey);
 }
 const actual=model.transactions.filter(t=>t.id!==candidate.id);
 return [...actual.map(transaction=>({transaction,expected:false})),...expected.map(transaction=>({transaction,expected:true}))].filter(({transaction:t,expected:isExpected})=>{
  if(t.scheduleKey&&candidate.scheduleKey===t.scheduleKey&&isExpected)return false;
  if(!sameAccounts(candidate,t))return false;
  const days=Math.abs((+date(candidate.date)- +date(t.date))/86400000),difference=amountDifference(candidate,t),name=similarDescription(candidate.description,t.description);
  // Amount/date catches renamed entries; name/date also catches variable bills.
  return days<=3&&(difference===0||difference<=5&&name)||isExpected&&days<=7&&name;
 }).map(match=>({...match,reason:match.expected?'Similar expected entry — matching it avoids forecasting it again':'Similar recorded entry — check before recording twice'}));
}
