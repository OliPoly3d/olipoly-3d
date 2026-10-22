import {possibleDuplicates} from './money-duplicates.mjs';
import {debtHidden} from './money-privacy.mjs';

export function setupDuplicateReview({getDraft,record,action,message}){
 const dialog=document.getElementById('duplicateDialog'),rows=document.getElementById('duplicateRows');
 let pending=null,returnFocus=null;
 const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const privateEntry=t=>t.entries.some(e=>getDraft()?.accounts.find(a=>a.id===e.account)?.type!=='cash');
 function clear(restoreFocus=false){
  pending=null;if(dialog.open&&dialog.close)dialog.close();else dialog.removeAttribute('open');
  rows.replaceChildren();dialog.removeAttribute('data-debt-private');
  if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus();returnFocus=null;
 }
 function review(candidate,proceed,{planned=false}={}){
  const matches=possibleDuplicates(getDraft(),candidate);
  if(!matches.length)return false;
  if(privateEntry(candidate)&&debtHidden()){message('Show debt to review this possible duplicate before recording.');return true;}
  clear();returnFocus=document.activeElement;
  const signature=JSON.stringify(matches);pending={candidate:structuredClone(candidate),proceed,signature,planned};
  dialog.toggleAttribute('data-debt-private',privateEntry(candidate));
  document.getElementById('duplicateProceed').textContent=planned?'Add a separate expectation':'Record a separate transaction';
  for(const {transaction:t,expected,reason} of matches){
   const item=node('div','');item.className='notice';item.toggleAttribute('data-debt-private',privateEntry(t));
   item.append(node('strong',(expected?'Expected · ':'Recorded · ')+t.date+' · '+t.description),node('p',t.entries.map(e=>(getDraft().accounts.find(a=>a.id===e.account)?.name||'Account')+' '+money(e.amount)).join(' → ')),node('p',reason));
   const edit=node('button',expected?'Match this expected entry':'Review / edit recorded entry');edit.type='button';
   edit.onclick=()=>{const proposed=pending?.candidate;clear();if(expected&&proposed)record({...t,date:proposed.date,description:proposed.description,entries:proposed.entries,note:proposed.note||t.note,status:'forecast'});else record(t);};
   item.append(edit);rows.append(item);
  }
  if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
  document.getElementById('duplicateCancel').focus();return true;
 }
 document.getElementById('duplicateProceed').onclick=()=>{
  if(!pending)return;const proposal=pending;
  const latest=possibleDuplicates(getDraft(),proposal.candidate);
  if(JSON.stringify(latest)!==proposal.signature){review(proposal.candidate,proposal.proceed,{planned:proposal.planned});message('The plan changed. Review the updated matches first.');return;}
  clear();action(proposal.proceed);
 };
 document.getElementById('duplicateCancel').onclick=()=>{clear(true);message('Cancelled. Your entry is still in the form; nothing was recorded.');};
 dialog.addEventListener('cancel',()=>clear(true));
 for(const id of ['transactionForm','oneTimeIncomeForm'])for(const event of ['input','change'])document.getElementById(id).addEventListener(event,()=>clear());
 const privacyChanged=()=>{if(pending&&privateEntry(pending.candidate)&&debtHidden())clear();};
 window.addEventListener('storage',privacyChanged);document.getElementById('debtPrivacy').addEventListener('click',privacyChanged);
 return {review,clear};
}
