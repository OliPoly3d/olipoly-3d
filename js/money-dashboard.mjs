import {cents, date} from './money-engine.mjs';
import {budgetMonth, seasonalMonth, monthBounds, shiftMonth, validateBudgets} from './money-budget.mjs';
import {monthProjection, expectedRows} from './money-planning.mjs';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const monthName=m=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T00:00:00Z'));
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function cell(row,content,label){const td=el('td');if(content instanceof Node)td.append(content);else td.textContent=content;if(label)td.dataset.label=label;row.append(td);return td;}
function amountInput(value,label){const input=el('input');input.type='number';input.step='0.01';input.inputMode='decimal';input.value=value===null?'':(value/100).toFixed(2);input.setAttribute('aria-label',label);return input;}
function accountSelect(model,value,label,cashOnly=false,entity){const s=el('select');s.setAttribute('aria-label',label);for(const a of model.accounts.filter(a=>(!cashOnly||a.type==='cash')&&(!entity||a.entity===entity))){const o=el('option',a.name);o.value=a.id;s.append(o);}s.value=value||'';return s;}
const ids=['accountSummary','monthMetrics','balanceChart','monthChart','incomeRows','incomeTotals','billRows','billTotals','categoryRows','categoryTotals','seasonalHead','seasonalRows','seasonalTotals','planningSettings','transactions','unknownBills'];
export function setupDashboard({getModel,today,savePlan,record,action,message,setStatus}){
 let saved=null,draft=null,dirty=false;
 function resetDraft(){saved=getModel();draft=saved?structuredClone(saved):null;dirty=false;}
 function getDraft(){if(saved!==getModel())resetDraft();return draft;}
 function mark(){dirty=true;$('planState').textContent='Previewing changes';$('savePlan').dataset.disabled='false';$('savePlan').disabled=false;preview();}
 function run(fn){try{fn();}catch(e){message(e.message);}}
 $('budgetMonth').value=today().slice(0,7);
 for(const [id,delta] of [['prevMonth',-1],['nextMonth',1]])$(id).onclick=()=>run(()=>{const m=shiftMonth($('budgetMonth').value,delta);if(m>=$('budgetMonth').min&&m<=$('budgetMonth').max){$('budgetMonth').value=m;render();}});
 $('budgetMonth').onchange=()=>run(render);$('budgetEntity').onchange=()=>run(render);$('chartAccount').onchange=()=>run(preview);
 $('savePlan').onclick=()=>{if(!dirty)return;action(async()=>{validateBudgets(getDraft());await savePlan(structuredClone(getDraft()));});};
 $('resetPlan').onclick=()=>{resetDraft();render();message('Preview reset to the saved plan.');};
 $('repeatSeasonal').onclick=()=>run(()=>{
  const model=getDraft(),month=$('budgetMonth').value,year=Number(month.slice(0,4));
  for(const item of seasonalMonth(model,month,$('budgetEntity').value).items){
   const target=model.seasonalItems.find(i=>i.id===item.id);
   target.changes=[...(target.changes||[]).filter(c=>c.year<year),{year,amount:item.expected}];
   for(const key of Object.keys(target.overrides||{}))if(key>=month)delete target.overrides[key];
  }
  mark();render();message('Preview repeats these amounts for this calendar month in future years. Save changes to keep it.');
 });
 function clear(){saved=null;draft=null;dirty=false;for(const id of ids)$(id).replaceChildren();for(const id of ['monthHeading','projectionNote','seasonalHeading','seasonalBudgetNote','transactionNote','planState'])$(id).textContent='';$('chartAccount').replaceChildren();}
 function render(){
  const model=getDraft();if(!model)return;
  const min=model.start.slice(0,7),max=shiftMonth(min,35),input=$('budgetMonth');input.min=min;input.max=max;
  if(!input.value||input.value<min)input.value=min;if(input.value>max)input.value=max;
  const month=input.value,entity=$('budgetEntity').value;
  $('monthHeading').textContent=monthName(month);
  $('planState').textContent=dirty?'Previewing changes':'Plan saved';$('savePlan').dataset.disabled=String(!dirty);$('savePlan').disabled=!dirty;
  const previous=$('chartAccount').value;$('chartAccount').replaceChildren();
  for(const a of model.accounts.filter(a=>a.entity===entity&&a.type==='cash')){const o=el('option',a.name);o.value=a.id;$('chartAccount').append(o);}
  if([...$('chartAccount').options].some(o=>o.value===previous))$('chartAccount').value=previous;
  renderExpected(model,month,entity,'income','incomeRows','incomeTotals');
  renderExpected(model,month,entity,'bills','billRows','billTotals');
  renderCategories(model,month,entity);renderSeasonal(model,month,entity);renderTransactions(model,month,entity);renderSettings(model,entity);
  const select=$('transactionCategory'),chosen=select.value;select.replaceChildren();
  const choices=new Map((model.budgets||[]).map(b=>[b.name,b.shortName||b.name]));
  for(const s of model.schedules)if(s.category&&!choices.has(s.category))choices.set(s.category,s.category);
  choices.set('Other','Other');for(const t of model.transactions)if(t.category&&!choices.has(t.category))choices.set(t.category,t.category);
  for(const [name,label] of choices){const o=el('option',label);o.value=name;select.append(o);}if(choices.has(chosen))select.value=chosen;
  $('unknownBills').replaceChildren();for(const b of (model.unscheduledBills||[]).filter(b=>b.entity===entity))$('unknownBills').append(el('p',b.name+' — '+b.reason,'notice'));
  preview();
 }
 function preview(){
  const model=getDraft();if(!model)return;
  const month=$('budgetMonth').value,entity=$('budgetEntity').value,p=monthProjection(model,month,today());
  const relevant=model.accounts.filter(a=>a.entity===entity);$('accountSummary').replaceChildren();
  for(const a of relevant){const row=el('tr');cell(row,a.name,'Account');cell(row,money(p.opening[a.id]??0),'Month opening');cell(row,money(p.current[a.id]??0),'Current');const td=cell(row,money(p.closing[a.id]??0),'Projected month-end');if(p.closing[a.id]<a.reserve)td.className='low';$('accountSummary').append(row);}
  const account=$('chartAccount').value,days=p.days.filter(d=>d.date.startsWith(month));
  let incoming=0,outgoing=0;for(const d of days)for(const t of d.events)for(const e of t.entries)if(e.account===account){if(e.amount>0)incoming+=e.amount;else outgoing-=e.amount;}
  $('monthMetrics').replaceChildren();for(const [label,value] of [['Expected in',incoming],['Expected out',outgoing],['Projected month-end',p.closing[account]??0]]){const card=el('div',undefined,'metric');card.append(el('span',label),el('strong',money(value),value<0?'low':''));$('monthMetrics').append(card);}
  $('projectionNote').textContent=(month===model.start.slice(0,7)&&model.start.slice(-2)!=='01'?'Opening month starts '+model.start+'; variable targets are prorated. ':'')+(p.warnings.length?'Plan incomplete: '+p.warnings.join('; ')+'. ':'')+'Projected balances include the saved plan plus changes currently shown. Negative credit-card balances mean money owed.';
  balanceGraph(days,account);
  const b=budgetMonth(model,month,entity,today());$('monthChart').replaceChildren();
  const max=Math.max(1,...b.buckets.flatMap(x=>[x.allowance||0,x.spent]));
  for(const item of b.buckets){const row=el('div',undefined,'comparison-row');row.append(el('strong',item.shortName||item.name));const chart=el('div');for(const [label,value,cls] of [['Expected',item.allowance,'planned'],['Actual',item.spent,'actual']]){const line=el('div',undefined,'comparison-line');const track=el('div',undefined,'bar-track');const fill=el('span',undefined,cls);fill.style.width=(value||0)/max*100+'%';track.append(fill);line.append(track,el('span',label+': '+(value===null?'Set target':money(value))));chart.append(line);}row.append(chart);$('monthChart').append(row);}
  for(const item of b.buckets){const row=[...document.querySelectorAll('[data-budget-id]')].find(r=>r.dataset.budgetId===item.id);if(row){row.querySelector('[data-value="spent"]').textContent=money(item.spent);const remainder=row.querySelector('[data-value="remaining"]');remainder.textContent=item.remaining===null?'Set target':money(item.remaining);remainder.classList.toggle('low',item.remaining!==null&&item.remaining<0);}}
 }
 function balanceGraph(days,account){
  $('balanceChart').replaceChildren();if(!days.length||!account)return;
  const values=[days[0].opening[account],...days.map(d=>d.closing[account])],lo=Math.min(...values),hi=Math.max(...values),range=Math.max(1,hi-lo);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 560 180');svg.setAttribute('role','img');svg.setAttribute('aria-label','Projected balance from '+money(values[0])+' to '+money(values.at(-1)));
  const path=document.createElementNS(svg.namespaceURI,'polyline');path.setAttribute('points',values.map((v,i)=>(10+i/(values.length-1)*540)+','+(160-(v-lo)/range*140)).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#a38cf4');path.setAttribute('stroke-width','3');svg.append(path);
  $('balanceChart').append(svg,el('p','Opening '+money(values[0])+' → Month-end '+money(values.at(-1)),'help'));
 }
 function renderExpected(model,month,entity,kind,id,totalId){
  $(id).replaceChildren();let expected=0,actual=0;
  for(const t of expectedRows(model,month,entity,kind)){
   const row=el('tr'),entry=t.entries[0],label=t.description;
   const name=el('div');name.append(el('strong',label));if(t.estimated)name.append(el('small','Estimate · adjust as needed'));cell(row,name,kind==='income'?'Income':'Bill');
   const when=el('input');when.type='date';when.value=t.date;when.setAttribute('aria-label','Date for '+label);cell(row,when,'Date');
   const account=accountSelect(model,entry.account,'Account for '+label),accountBox=el('div');accountBox.append(account);let destination=null;if(t.kind==='transfer'){destination=accountSelect(model,t.entries[1].account,'Destination for '+label);accountBox.append(el('small','To'),destination);}cell(row,accountBox,'Account');
   const amount=amountInput(Math.abs(entry.amount),'Expected '+label);amount.min='0';cell(row,amount,'Expected');
   const text=t.actual?money(Math.abs(t.actual.entries[0].amount))+' · '+t.actual.status+' · '+t.actual.date:'—';cell(row,text,'Actual');
   const button=el('button',t.actual?'Edit actual':'Record');cell(row,button,'');
   if(t.actual){when.disabled=true;account.disabled=true;amount.disabled=true;if(destination)destination.disabled=true;if(t.actual.date.startsWith(month)&&t.actual.date<=today())actual+=Math.abs(t.actual.entries[0].amount);}
   if(t.date.startsWith(month))expected+=Math.abs(entry.amount);
   button.onclick=()=>record(t.actual||t);button.disabled=!t.actual&&entry.amount===0;button.dataset.disabled=String(button.disabled);
   const change=()=>run(()=>{
    const n=cents(amount.value);if(n<0)throw Error('Use a positive expected amount.');date(when.value);if(when.value<model.start)throw Error('Date is before your opening balance.');
    if(destination&&destination.value===account.value)throw Error('Choose different transfer accounts.');
    const source=model.schedules.find(s=>s.id===t.scheduleKey.slice(0,-11));
    source.overrides={...source.overrides,[t.nominalDate]:{amount:kind==='income'?n:-n,date:when.value,account:account.value,...(destination?{to:destination.value}:{})}};
    mark();renderExpected(model,month,entity,kind,id,totalId);
   });
   for(const input of [when,account,amount,destination].filter(Boolean))input.onchange=change;
   $(id).append(row);
  }
  if(!$(id).children.length){const row=el('tr');cell(row,'No expected entries for this month.').colSpan=6;$(id).append(row);}
  $(totalId).replaceChildren();const total=el('tr');cell(total,'Total').colSpan=3;cell(total,money(expected));cell(total,money(actual));cell(total,'');$(totalId).append(total);
 }
 function renderCategories(model,month,entity){
  $('categoryRows').replaceChildren();const result=budgetMonth(model,month,entity,today());
  for(const b of result.buckets.filter(b=>!b.seasonal)){
   const row=el('tr');row.dataset.budgetId=b.id;cell(row,b.shortName||b.name,'Category');const input=amountInput(b.allowance,'Budget for '+b.name);input.min='0';cell(row,input,'Budget');
   cell(row,money(b.spent),'Actual').dataset.value='spent';cell(row,b.remaining===null?'Set target':money(b.remaining),'Remaining').dataset.value='remaining';
   const account=accountSelect(model,b.funding?.[month]||b.account,'Fund '+b.name+' from',true,entity);cell(row,account,'Fund from');
   input.onchange=()=>run(()=>{const n=cents(input.value);if(n<0)throw Error('Budget cannot be negative.');const item=model.budgets.find(i=>i.id===b.id);item.overrides={...item.overrides,[month]:n};mark();});
   account.onchange=()=>{const item=model.budgets.find(i=>i.id===b.id);item.funding={...item.funding,[month]:account.value};mark();};$('categoryRows').append(row);
  }
  $('categoryTotals').replaceChildren();const tr=el('tr');cell(tr,'YOY expenses are listed separately below.').colSpan=5;$('categoryTotals').append(tr);
 }
 function renderSeasonal(model,month,entity){
  const result=seasonalMonth(model,month,entity),year=Number(month.slice(0,4));
  $('seasonalHeading').textContent='Your YOY-'+new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z')).toUpperCase()+' list. Edit this month, or repeat the amounts into future years.';
  $('seasonalHead').replaceChildren();const header=el('tr');for(const label of ['Expense',String(year),String(year+1),String(year+2)])header.append(el('th',label));$('seasonalHead').append(header);
  $('seasonalRows').replaceChildren();for(const item of result.items){const row=el('tr');const label=el('div');label.append(el('strong',item.name));if(item.review)label.append(el('small',item.review));cell(row,label,'Expense');const input=amountInput(item.expected,'Expected '+item.name);cell(row,input,String(year));
   for(let offset=1;offset<=2;offset++){const future=seasonalMonth(model,(year+offset)+month.slice(4),entity).items.find(i=>i.id===item.id);cell(row,money(future.expected),String(year+offset));}
   input.onchange=()=>run(()=>{const value=cents(input.value);const source=model.seasonalItems.find(i=>i.id===item.id);source.overrides={...source.overrides,[month]:value};const budget=model.budgets.find(b=>b.seasonal&&b.entity===entity);if(budget?.overrides)delete budget.overrides[month];mark();renderSeasonal(model,month,entity);});$('seasonalRows').append(row);
  }
  $('seasonalTotals').replaceChildren();const total=el('tr');cell(total,'Expected total');for(let offset=0;offset<=2;offset++)cell(total,money(seasonalMonth(model,(year+offset)+month.slice(4),entity).total));$('seasonalTotals').append(total);
  const budget=budgetMonth(model,month,entity,today()).buckets.find(b=>b.seasonal);
  $('seasonalBudgetNote').textContent=budget?'This month’s seasonal allowance '+money(budget.allowance||0)+' · Actual '+money(budget.spent)+' · Remaining '+(budget.remaining===null?'Set target':money(budget.remaining))+(budget.partial?' (opening-month proration applied).':'.'): 'No seasonal budget is configured for this view.';
 }
 function renderTransactions(model,month,entity){
  $('transactions').replaceChildren();let count=0;
  for(const t of [...model.transactions].filter(t=>!t.scheduleKey&&t.date.startsWith(month)&&(t.expenseEntity||model.accounts.find(a=>a.id===t.entries[0].account)?.entity)===entity).sort((a,b)=>b.date.localeCompare(a.date))){
   count++;const row=el('tr');for(const v of [t.date,t.description,t.category||t.kind,t.entries.map(e=>model.accounts.find(a=>a.id===e.account).name+': '+money(e.amount)).join(' → ')])cell(row,v);
   const status=el('select');status.setAttribute('aria-label','Status for '+t.description);for(const name of ['pending','cleared','reconciled']){const o=el('option',name);o.value=name;status.append(o);}status.value=t.status;status.onchange=()=>action(()=>setStatus(t.id,status.value));cell(row,status);const edit=el('button','Edit');edit.onclick=()=>record(t);cell(row,edit);$('transactions').append(row);
  }
  $('transactionNote').textContent=count+' other transactions this month. Recorded income and bill matches appear in their sections above.';
 }
 function renderSettings(model,entity){
  $('planningSettings').replaceChildren();
  for(const p of (model.planning?.cardPayoffs||[]).filter(p=>model.accounts.find(a=>a.id===p.card)?.entity===entity)){
   const label=el('label');label.className='check-label';const input=el('input');input.type='checkbox';input.checked=p.enabled!==false;label.append(input,document.createTextNode('Plan full '+model.accounts.find(a=>a.id===p.card).name+' payoff by month end'));input.onchange=()=>{p.enabled=input.checked;mark();};$('planningSettings').append(label);
  }
 }
 return {render,clear,draft:getDraft,hasChanges:()=>dirty};
}
