import {validate,cents,monthly,balances,statuses} from './money-engine.mjs';
import {validateBudgets,monthBounds,shiftMonth} from './money-budget.mjs';
import {planningForecast,clearPlanningCache} from './money-planning.mjs';
import {setupDuplicateReview} from './money-duplicate-review.mjs';
import {validateConfidence,ensureMonthlyBaselines,missingBaselineOwners} from './money-confidence.mjs';
import {assertMonthLocks} from './money-month-close.mjs';
import {setupConfidence} from './money-confidence-ui.mjs';
import {setupDashboard} from './money-dashboard.mjs';
import {setupWorkbench} from './money-workbench.mjs';
import {setupSections,revealSection,sectionPreview} from './money-sections.mjs';
import {addOneTimeIncome} from './money-income.mjs';
import {setupDebtPrivacy} from './money-privacy.mjs';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const today=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/New_York'}).format(new Date());
let model=null,revision=null,userId=null,busy=false,generation=0;
function message(text){$('message').textContent=text;}
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function lock(){generation++;model=null;revision=null;userId=null;$('app').hidden=true;$('login').hidden=false;$('logout').hidden=true;for(const id of ['accounts','transactions','months','days','metrics','schedules','forecastNote'])$(id).replaceChildren();for(const f of document.forms)f.reset();resetSchedule(false);dashboard.clear();workbench.clear();confidence.clear();duplicateReview.clear();clearPlanningCache();for(const select of $('oneTimeIncomeForm').querySelectorAll('select[name=account],select[name=from]'))select.replaceChildren();for(const preview of document.querySelectorAll('.section-preview'))preview.textContent='';for(const panel of document.querySelectorAll('#app details'))panel.open=false;}
window.addEventListener('olipoly-auth-changed',e=>{if(userId && e.detail?.user?.id!==userId){lock();message('Signed out. Sign in to continue.');}});
window.addEventListener('storage',e=>{if(['sb_token','sb_user','olipoly_auth_session_v1'].includes(e.key)){lock();message('Sign-in changed in another tab. Sign in again.');}});
async function api(path,options={}) {
  const session=await window.OliPolyAuth.recover();
  if(!session?.user || (userId && session.user.id!==userId)) {lock();throw Error('Sign in again.');}
  const res=await fetch(window.OliPolyAuth.SUPABASE_URL+'/rest/v1/'+path,{...options,cache:'no-store',headers:{...window.OliPolyAuth.authHeaders(),Prefer:'return=representation',...(options.headers||{})}});
  const body=await res.json().catch(()=>null);
  if(!res.ok) throw Error(res.status===404?'Money storage is not installed yet. Apply the reviewed database setup before using this page.':body?.message||'Could not reach Money storage.');
  return body;
}
async function load(){
  const session=await window.OliPolyAuth.recover();
  if(!session?.user){lock();message('Sign in to open Money.');return;}
  userId=session.user.id;const gen=++generation;
  const access=await api('money_access?select=user_id&user_id=eq.'+encodeURIComponent(userId));
  if(gen!==generation)return;
  if(!access?.length){lock();message('Money access has not been enabled for this account.');return;}
  const rows=await api('money_plans?select=body,revision&user_id=eq.'+encodeURIComponent(userId));
  if(gen!==generation)return;
  if(rows.length!==1)throw Error('Your Money plan has not been provisioned. Complete the database setup.');
  model=validateConfidence(validateBudgets(validate(rows[0].body)));revision=rows[0].revision;
  $('login').hidden=true;$('app').hidden=false;$('logout').hidden=false;
  $('end').min=model.start.slice(0,7);$('end').max=shiftMonth($('end').min,35);
  if(!$('end').value||$('end').value<$('end').min||$('end').value>$('end').max)$('end').value=$('end').max;
  let baselineNote='';try{if(await ensureAutomaticBaselines())baselineNote=' Monthly comparison baseline saved automatically.';}catch(e){baselineNote=' Automatic baseline was not saved: '+e.message;}
  if(gen!==generation)return;
  $('transactionForm').elements.date.value=today();render();message('Loaded. Opening balances are as of '+model.start+'.'+baselineNote);
}
async function persist(next){
  validateConfidence(validateBudgets(validate(next)));assertMonthLocks(model,next);const gen=generation;
  const rows=await api(`money_plans?user_id=eq.${encodeURIComponent(userId)}&revision=eq.${revision}`,{method:'PATCH',body:JSON.stringify({body:next,revision:revision+1})});
  if(gen!==generation)throw Error('Sign-in changed; reload to verify the saved state.');
  if(rows.length!==1)throw Error('This plan changed in another tab. Refresh before saving again; your entry has not been applied.');
  return {body:validateConfidence(validateBudgets(validate(rows[0].body))),revision:rows[0].revision};
}
async function ensureAutomaticBaselines(){
 const next=ensureMonthlyBaselines(model,today());if(next===model)return false;
 const previous=model,result=await persist(next);model=result.body;revision=result.revision;
 dashboard.rebaseSnapshots(previous,model);return true;
}
async function save(next){
 const result=await persist(next);model=result.body;revision=result.revision;render();message('Saved. All views updated.');
}
async function action(fn,{baseline=true}={}){
 if(busy)return;busy=true;
 const controls=new Map([...document.querySelectorAll('button')].map(c=>[c,c.disabled]));
 for(const c of controls.keys())c.disabled=true;
 $('app').inert=true;$('login').inert=true;
 try{if(baseline&&model&&await ensureAutomaticBaselines())confidence.render(dashboard.draft());await fn();}catch(e){message(e.message);}finally{busy=false;$('app').inert=false;$('login').inert=false;for(const [c,disabled] of controls)if(c.isConnected)c.disabled=c.dataset.disabled===undefined?disabled:c.dataset.disabled==='true';}
}
// A returning tab captures the new current month without discarding a dirty preview.
function resumeMonth(){if(model&&!busy&&document.visibilityState!=='hidden'&&missingBaselineOwners(model,today()).length)action(async()=>{});}
window.addEventListener('focus',resumeMonth);document.addEventListener('visibilitychange',resumeMonth);
function row(parent,values){const r=node('tr');for(const v of values)r.append(v instanceof Node?v:node('td',v));parent.append(r);return r;}
function option(select,value,label){const o=node('option',label);o.value=value;select.append(o);}
function render(){
  const selection=$('account').value;const selects=[$('account'),...document.querySelectorAll('.accountOptions'),$('scheduleTo')];
  for(const s of selects){const old=s.value;s.replaceChildren();if(s.id==='scheduleTo')option(s,'','None');for(const a of model.accounts)option(s,a.id,a.name);if([...s.options].some(o=>o.value===old))s.value=old;}
  if(selection && model.accounts.some(a=>a.id===selection))$('account').value=selection;
  const posted=balances(model,today(),true),adjusted=balances(model,today());
  $('accounts').replaceChildren();for(const a of model.accounts)row($('accounts'),[a.name,a.entity,a.balanceUnknown?'Unknown':money(posted[a.id]),a.balanceUnknown?'Unknown':money(adjusted[a.id])]).toggleAttribute('data-debt-private',a.type!=='cash');
  $('schedules').replaceChildren();for(const s of model.schedules){const div=node('div',undefined,'schedule');div.dataset.scheduleId=s.id;div.toggleAttribute('data-debt-private',[s.account,s.to].filter(Boolean).some(id=>model.accounts.find(a=>a.id===id)?.type!=='cash'));const kind=scheduleKind(s);const credit=model.accounts.find(a=>a.credit?.scheduleId===s.id);const info=node('span',s.name+' · '+({expense:'Bill',income:'Income',transfer:'Transfer'}[kind])+' · '+(credit?.credit.mode==='full'?'Full projected balance':money(credit?.credit.paymentAmount??Math.abs(s.amount)))+' · '+(s.oneTime?'One time':s.frequency));info.append(node('small',(s.estimated?'Provisional':'Confirmed')+' · '+(s.stoppedFrom?'Stopped from '+s.stoppedFrom:s.enabled===false?'Paused':'Active')));const edit=node('button','Edit');edit.onclick=()=>{const credit=model.accounts.find(a=>a.credit?.scheduleId===s.id);if(credit)workbench.selectCredit(credit.id);else editSchedule(s.id);};const b=node('button',s.stoppedFrom||s.enabled===false?'Resume':'Pause');b.onclick=()=>action(async()=>{const next=structuredClone(dashboard.draft());const target=next.schedules.find(x=>x.id===s.id);if(target.stoppedFrom){delete target.stoppedFrom;target.enabled=true;}else target.enabled=s.enabled===false;await save(next);});const controls=node('div',undefined,'row-actions');controls.append(edit,b);div.append(info,controls);$('schedules').append(div);}
  sectionPreview('adminSection',model.accounts.length+' accounts · '+model.schedules.filter(s=>s.enabled!==false&&!s.stoppedFrom&&!s.oneTime).length+' recurring schedules');
  transactionControls();dashboard.render();
}
function renderForecast(plan=dashboard.draft()){
  $('metrics').replaceChildren();$('months').replaceChildren();$('days').replaceChildren();$('forecastNote').textContent='';if(!plan?.accounts.length)return;
  if(!$('end').value||!$('end').validity.valid)throw Error('Choose a forecast month within the available range.');
  const a=plan.accounts.find(a=>a.id===$('account').value);$('forecastSection').toggleAttribute('data-debt-view',a.type!=='cash');$('forecastSectionPreview').toggleAttribute('data-debt-private',a.type!=='cash');const result=planningForecast(plan,monthBounds($('end').value).last),{days}=result;
  const incomplete=result.incompleteFrom[a.entity],missing=result.issues.filter(i=>i.entity===a.entity&&i.month===incomplete),debtFrom=result.days.at(-1)?.credit?.[a.id]?.missingFrom?.slice(0,7);
  $('forecastNote').textContent=incomplete?'Incomplete from '+incomplete+': '+missing.map(i=>i.category+' ('+i.reason+')').join(', ')+'. Set these budgets in the monthly dashboard. Later balances stay incomplete until all earlier missing months are filled.':'Category and YOY budgets are included. This is a planning projection, not a guaranteed balance.';
  if(result.creditWarnings.length)$('forecastNote').textContent+=' '+result.creditWarnings.join(' · ')+'.';
  const future=days.filter(d=>d.date>=today());const low=future.length?Math.min(...future.map(d=>d.low[a.id])):null;
  const posted=balances(plan,today(),true)[a.id],adjusted=balances(plan,today())[a.id];
  sectionPreview('forecastSection',a.name+' · '+(a.balanceUnknown||incomplete||debtFrom?'Incomplete forecast':low==null?'Outside horizon':'Lowest '+money(low)));
  for(const [label,value] of [['Posted balance',posted],['After pending',adjusted],['Lowest projected balance',low]]){const e=node('div',undefined,'metric'),unknown=a.balanceUnknown||(incomplete||debtFrom)&&label==='Lowest projected balance';e.append(node('span',label),node('strong',unknown?'Incomplete plan':value===null?'Outside horizon':money(value),!unknown&&value!==null&&value<a.reserve?'low':''));$('metrics').append(e);}
  const reserves=new Map();for(const t of result.planned.filter(t=>t.kind==='expense')){const key=t.date.slice(0,7);reserves.set(key,(reserves.get(key)||0)-t.entries.filter(e=>e.account===a.id).reduce((n,e)=>n+e.amount,0));}
  for(const m of monthly(days,a.id)){const unknown=a.balanceUnknown||incomplete&&m.month>=incomplete||debtFrom&&m.month>=debtFrom;const r=row($('months'),[m.month,a.balanceUnknown||incomplete&&m.month>incomplete||debtFrom&&m.month>debtFrom?'Incomplete plan':money(m.opening),money(reserves.get(m.month)||0),unknown?'Incomplete plan':money(m.low),unknown?'Incomplete plan':money(m.closing),unknown?(a.balanceUnknown?'Principal needed':debtFrom&&m.month>=debtFrom?'APR needed':'Missing budgets'):'Included']);if(!unknown&&m.low<a.reserve)r.className='low';}
  for(const d of future.slice(0,60)){const activity=node('td',undefined,'activity'),unknown=a.balanceUnknown||incomplete&&d.date.slice(0,7)>=incomplete||d.credit?.[a.id]?.missingFrom;for(const t of d.events.filter(t=>t.entries.some(e=>e.account===a.id))){const line=node('div',t.description+(t.status==='plan'?' (planning reserve)':t.estimated?' (provisional)':'')+' '+money(t.entries.find(e=>e.account===a.id).amount));line.toggleAttribute('data-debt-private',t.entries.some(e=>plan.accounts.find(a=>a.id===e.account)?.type!=='cash'));if(t.status==='forecast'){const b=node('button','Record');b.onclick=()=>match(t);line.append(b);}activity.append(line);}const r=row($('days'),[d.date,activity,unknown?'Incomplete plan':money(d.low[a.id]),unknown?'Incomplete plan':money(d.closing[a.id])]);if(!unknown&&d.low[a.id]<a.reserve)r.className='low';}
}
function transactionControls(){
 const f=$('transactionForm'),transfer=f.elements.kind.value==='transfer';
 $('transactionCategoryLabel').hidden=transfer;f.elements.category.disabled=transfer;
 $('transactionDestinationLabel').hidden=!transfer;f.elements.to.disabled=!transfer;f.elements.to.required=transfer;
 $('transactionTransferHelp').hidden=!transfer;
 const m=dashboard.draft();if(!m)return;
 const ids=[f.elements.account.value,...(transfer?[f.elements.to.value]:[])];$('transactionEntry').toggleAttribute('data-debt-private',ids.some(id=>m.accounts.find(a=>a.id===id)?.type!=='cash'));
}
$('transactionForm').addEventListener('change',transactionControls);
let editorReturnFocus=null;
function cancelEditor(announce=true){
 duplicateReview.clear();const f=$('transactionForm');f.reset();f.elements.scheduleKey.value='';f.elements.editTransactionId.value='';f.elements.date.value=today();
 transactionControls();$('transactionEntry').open=false;if(editorReturnFocus?.isConnected)editorReturnFocus.focus();
 if(announce)message('Cancelled. No transaction was saved. Your plan preview is unchanged.');
}
function match(t){
 duplicateReview.clear();editorReturnFocus=document.activeElement;
 const f=$('transactionForm');f.reset();
 for(const k of ['date','description','kind','category','scheduleKey','note','funding','expenseEntity','incomeType'])f.elements[k].value=t[k]||'';
 f.elements.editTransactionId.value=t.status==='forecast'?'':t.id;f.elements.status.value=t.status==='forecast'?'cleared':t.status;
 const outgoing=t.entries.find(e=>e.amount<0)||t.entries[0];
 f.elements.account.value=outgoing.account;f.elements.amount.value=((t.kind==='adjustment'?outgoing.amount:Math.abs(outgoing.amount))/100).toFixed(2);
 if(t.kind==='transfer')f.elements.to.value=t.entries.find(e=>e.account!==outgoing.account).account;
 transactionControls();revealSection(f);f.scrollIntoView({behavior:'smooth'});f.elements.amount.focus();
 message(t.status==='forecast'?'Check the date, account and actual amount, then record.':'Edit the transaction and record the correction.');
}
$('loginForm').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target;await window.OliPolyAuth.login(f.email.value,f.password.value);f.password.value='';await load();});};
$('logout').onclick=()=>{window.OliPolyAuth.logout();lock();message('Signed out.');};
$('refresh').onclick=()=>{if(dashboard.hasChanges()){message('Save or reset the preview before refreshing.');return;}action(load,{baseline:false});};
$('account').onchange=()=>action(async()=>renderForecast());$('end').onchange=()=>action(async()=>renderForecast());
$('clearMatch').onclick=()=>cancelEditor();
$('transactionForm').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();cancelEditor();}};
$('accountForm').onsubmit=e=>{e.preventDefault();action(async()=>{const f=new FormData(e.target),next=structuredClone(dashboard.draft());next.accounts.push({id:crypto.randomUUID(),name:f.get('name'),entity:f.get('entity'),type:f.get('type'),opening:cents(f.get('opening')),reserve:cents(f.get('reserve'))});await save(next);e.target.reset();});};
$('transactionForm').onsubmit=e=>{e.preventDefault();action(async()=>{
  transactionControls();const f=new FormData(e.target),kind=f.get('kind'),amount=cents(f.get('amount')),account=f.get('account');
  if(kind!=='adjustment' && amount<=0)throw Error('Enter a positive amount.');
  if(kind==='adjustment' && !f.get('note'))throw Error('Please explain this balance adjustment.');
  const entries=[{account,amount:kind==='expense'||kind==='transfer'?-amount:amount}];if(kind==='transfer')entries.push({account:f.get('to'),amount});
  const id=f.get('editTransactionId')||crypto.randomUUID();const transaction={id,date:f.get('date'),description:f.get('description'),kind,category:kind==='transfer'?undefined:f.get('category'),incomeType:f.get('incomeType')||undefined,status:f.get('status'),entries,expenseEntity:f.get('expenseEntity'),funding:f.get('funding')||(f.get('expenseEntity')==='business'&&model.accounts.find(a=>a.id===account)?.entity==='household'?'contribution':''),note:f.get('note'),scheduleKey:f.get('scheduleKey')||null};
  const commit=async()=>{
   const next=structuredClone(dashboard.draft()),existing=next.transactions.findIndex(t=>t.id===id);
   if(existing>=0)next.transactions[existing]=transaction;else next.transactions.push(transaction);
   await save(next);e.target.reset();e.target.elements.scheduleKey.value='';e.target.elements.editTransactionId.value='';e.target.elements.date.value=today();transactionControls();
  };
  const trial=structuredClone(dashboard.draft()),existing=trial.transactions.findIndex(t=>t.id===id);if(existing>=0)trial.transactions[existing]=transaction;else trial.transactions.push(transaction);
  validateConfidence(validateBudgets(validate(trial)));assertMonthLocks(model,trial);
  if(!duplicateReview.review(transaction,commit))await commit();
});};
function scheduleKind(s){return s.to?'transfer':s.amount<0?'expense':'income';}
function scheduleControls(){
 const f=$('scheduleForm'),transfer=f.elements.kind.value==='transfer',monthly=f.elements.frequency.value==='monthly',bonus=!monthly&&f.elements.kind.value==='income';
 $('scheduleToLabel').hidden=!transfer;f.elements.to.disabled=!transfer;f.elements.to.required=transfer;
 $('scheduleDayLabel').hidden=!monthly;f.elements.day.disabled=!monthly;
 $('scheduleBonusLabel').hidden=!bonus;f.elements.firstPayBonus.disabled=!bonus;
}
function resetSchedule(announce=true){
 const f=$('scheduleForm');f.reset();f.elements.editScheduleId.value='';$('scheduleHeading').textContent='Add recurring schedule';$('saveSchedule').textContent='Add schedule';$('cancelSchedule').hidden=true;$('scheduleEditNote').hidden=true;$('scheduleEditNote').textContent='';scheduleControls();
 if(announce)message('Schedule editing cancelled. Nothing was saved.');
}
function editSchedule(id){
 const s=dashboard.draft().schedules.find(s=>s.id===id);if(!s)return;
 resetSchedule(false);const f=$('scheduleForm');
 for(const key of ['name','account','to','frequency','anchor','end','category'])f.elements[key].value=s[key]||'';
 f.elements.editScheduleId.value=s.id;f.elements.kind.value=scheduleKind(s);f.elements.amount.value=(Math.abs(s.amount)/100).toFixed(2);f.elements.day.value=s.day||Number(s.anchor.slice(-2));f.elements.firstPayBonus.value=((s.firstPayBonus||0)/100).toFixed(2);f.elements.estimated.value=String(s.estimated===true);
 $('scheduleHeading').textContent='Edit '+s.name;$('saveSchedule').textContent='Save schedule';$('cancelSchedule').hidden=false;
 const exceptions=(s.changes||[]).length+Object.keys(s.overrides||{}).length;
 $('scheduleEditNote').textContent='Updates this recurring schedule. Recorded transactions stay unchanged. To change only one payment, edit its Expected amount in the monthly dashboard.'+(exceptions?' '+exceptions+' existing dated or month-specific edits are kept; changing Bill / Income changes their direction too.':'');$('scheduleEditNote').hidden=false;scheduleControls();
 for(let parent=f.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
 f.scrollIntoView({behavior:'smooth'});f.elements.kind.focus();
}
$('scheduleKind').onchange=scheduleControls;$('scheduleForm').elements.frequency.onchange=scheduleControls;
$('scheduleForm').elements.anchor.onchange=e=>{if(!$('scheduleForm').elements.editScheduleId.value)$('scheduleForm').elements.day.value=Number(e.target.value.slice(-2));};
$('cancelSchedule').onclick=()=>resetSchedule();
$('scheduleForm').onkeydown=e=>{if(e.key==='Escape'&&e.currentTarget.elements.editScheduleId.value){e.preventDefault();resetSchedule();}};
$('scheduleForm').onsubmit=e=>{e.preventDefault();action(async()=>{
 const f=new FormData(e.target),next=structuredClone(dashboard.draft()),id=f.get('editScheduleId'),previous=id?next.schedules.find(s=>s.id===id):null;
 if(id&&!previous)throw Error('This schedule is no longer available. Refresh and try again.');
 const kind=f.get('kind'),amount=cents(f.get('amount')),bonus=cents(f.get('firstPayBonus')||'0');if(!['expense','income','transfer'].includes(kind)||amount<=0||bonus<0)throw Error('Choose a schedule type and enter a positive amount.');
 const anchor=f.get('anchor'),frequency=f.get('frequency'),day=frequency==='monthly'?Number(f.get('day')):Number(anchor.slice(-2));
 if(f.get('end')&&f.get('end')<anchor)throw Error('Last date must be on or after the start date.');
 if(previous&&(next.transactions.some(t=>t.scheduleKey?.startsWith(id+':'))||Object.keys(previous.overrides||{}).length||previous.skipped?.length)&&(anchor!==previous.anchor||frequency!==previous.frequency||frequency==='monthly'&&day!==previous.day))throw Error('This schedule has recorded history or dated edits. Keep its repeat dates, or pause it and add a new schedule for different timing.');
 const signed=n=>kind==='income'?Math.abs(n):-Math.abs(n);
 const target={...previous,id:id||crypto.randomUUID(),name:f.get('name').trim(),account:f.get('account'),to:kind==='transfer'?f.get('to'):null,amount:signed(amount),frequency,anchor,end:f.get('end')||null,day,firstPayBonus:kind==='income'&&frequency==='biweekly'?bonus:0,category:f.get('category').trim(),estimated:f.get('estimated')==='true'};
 if(kind==='transfer'&&!target.to)throw Error('Choose a transfer destination.');
 if(previous&&kind!==scheduleKind(previous)){
  if(previous.changes)target.changes=previous.changes.map(c=>({...c,amount:signed(c.amount)}));
  if(previous.overrides)target.overrides=Object.fromEntries(Object.entries(previous.overrides).map(([key,value])=>{const o={...value,amount:signed(value.amount)};delete o.to;return [key,o];}));
 }
 if(previous)next.schedules[next.schedules.indexOf(previous)]=target;else next.schedules.push(target);
 await save(next);resetSchedule(false);message('Schedule saved. Income, bills and forecasts updated.');
});};
$('export').onclick=()=>{if(!model)return;const blob=new Blob([JSON.stringify(model,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='money-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=e=>action(async()=>{const file=e.target.files[0];if(!file)return;if(model.accounts.length||model.transactions.length||model.schedules.length)throw Error('Opening-plan import is only available for an empty plan. Existing data will not be overwritten.');if(file.size>2000000)throw Error('Opening plan exceeds 2 MB.');const incoming=validateBudgets(validate(JSON.parse(await file.text())));await save(incoming);e.target.value='';});
function incomeControls(plan=dashboard.draft()){
 if(!plan)return;const f=$('oneTimeIncomeForm'),entity=$('budgetEntity').value;
 f.elements.incomeType.querySelector('option[value="distribution"]').disabled=entity!=='household';if(entity!=='household'&&f.elements.incomeType.value==='distribution')f.elements.incomeType.value='other';
 const payout=f.elements.incomeType.value==='distribution';
 for(const [key,owner] of [['account',entity],['from','business']]){const old=f.elements[key].value;f.elements[key].replaceChildren();for(const a of plan.accounts.filter(a=>a.type==='cash'&&a.entity===owner))option(f.elements[key],a.id,a.name);if([...f.elements[key].options].some(o=>o.value===old))f.elements[key].value=old;}
 $('incomeFromLabel').hidden=!payout;f.elements.from.disabled=!payout;f.elements.from.required=payout;f.elements.when.min=plan.start;if(!f.elements.when.value)f.elements.when.value=today()<plan.start?plan.start:today();
 const planned=f.elements.status.value==='plan';$('addOneTimeIncome').textContent=planned?'Add to budget preview':payout?'Record owner payout':'Record income';
 $('oneTimeIncomeHelp').textContent=planned?'Expected deposits appear once on this date. Save changes keeps the forecast; Record in the Income table replaces the expectation when the money arrives.':'Check the date, net amount and accounts. Recording saves this actual deposit together with your current plan preview.';
}
function resetOneTimeIncome(){duplicateReview.clear();const f=$('oneTimeIncomeForm');f.reset();incomeControls();}
$('oneTimeIncomeForm').elements.incomeType.onchange=()=>incomeControls();$('oneTimeIncomeForm').elements.status.onchange=()=>incomeControls();
$('cancelOneTimeIncome').onclick=()=>{resetOneTimeIncome();$('oneTimeIncomeEntry').open=false;message('Cancelled. No income entry was added.');};
$('oneTimeIncomeForm').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();$('cancelOneTimeIncome').click();}};
$('oneTimeIncomeForm').onsubmit=e=>{e.preventDefault();action(async()=>{
 const f=new FormData(e.target),values={id:crypto.randomUUID(),when:f.get('when'),description:f.get('description'),amount:cents(f.get('amount')),account:f.get('account'),incomeType:f.get('incomeType'),from:f.get('from'),status:f.get('status')};
 const trial=addOneTimeIncome(dashboard.draft(),values),planned=values.status==='plan';
 validateConfidence(validateBudgets(validate(trial)));assertMonthLocks(model,trial);
 const candidate=planned?{id:values.id,date:values.when,description:values.description,kind:values.incomeType==='distribution'?'transfer':'income',entries:values.incomeType==='distribution'?[{account:values.from,amount:-values.amount},{account:values.account,amount:values.amount}]:[{account:values.account,amount:values.amount}]}:trial.transactions.at(-1);
 const commit=async()=>{if(planned){dashboard.update(next=>addOneTimeIncome(next,values));resetOneTimeIncome();message('One-time deposit added to the budget preview. Save changes keeps it; Record it when received.');}else{await save(addOneTimeIncome(dashboard.draft(),values));resetOneTimeIncome();$('oneTimeIncomeEntry').open=false;message('Deposit recorded. Balances, income and forecasts updated.');}};
 if(!duplicateReview.review(candidate,commit,{planned}))await commit();
});};
setupSections();setupDebtPrivacy();
const dashboard=setupDashboard({
 getModel:()=>model,today,record:match,action,message,savePlan:save,cancelRecord:()=>cancelEditor(false),onPreview:plan=>{duplicateReview.clear();renderForecast(plan);workbench.render(plan);incomeControls(plan);confidence.render(plan);resumeMonth();},
 setStatus:async(id,status)=>{const next=structuredClone(dashboard.draft());next.transactions.find(t=>t.id===id).status=status;await save(next);}
});
const workbench=setupWorkbench({getDraft:()=>dashboard.draft(),updateDraft:fn=>dashboard.update(fn),today,message,action});
const confidence=setupConfidence({getDraft:()=>dashboard.draft(),updateDraft:fn=>dashboard.update(next=>validateConfidence(fn(next))),today,message,record:match,editSchedule,selectCredit:id=>workbench.selectCredit(id)});
const duplicateReview=setupDuplicateReview({getDraft:()=>dashboard.draft(),record:match,action,message});
await new Promise(resolve=>{if(document.readyState==='complete')resolve();else window.addEventListener('load',resolve,{once:true});});
await action(load);
