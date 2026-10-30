import {addDays,balances} from './money-engine.mjs';
import {budgetMonth,monthBounds} from './money-budget.mjs';
import {horizonSummary} from './money-decisions.mjs';
import {cashCapacity} from './money-confidence.mjs';
import {savingsSummary} from './money-savings.mjs';
import {upcomingActivity} from './money-home.mjs';
import {formatMoney as money} from './money-charts.mjs';
const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function categorySymbol(name){
 const s=String(name).toLowerCase(),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','category-icon');
 const shapes=/grocer|food/.test(s)?['M3 9h18l-2 11H5L3 9Z','m7 0 5-6 5 6']:/gas|fuel/.test(s)?['M4 21V3h10v18M4 10h10','m17-16 3 3v10a2 2 0 0 1-4 0v-4h-2']:/dining|restaurant/.test(s)?['M5 3v7h6V3M8 3v18','M19 21V3c-4 3-4 9 0 9']:/pet/.test(s)?['M7 15c3-5 7-5 10 0 4 6-2 6-5 4-3 2-9 2-5-4Z','M5 8v1m5-5v2m5-2v2m4 2v1']:/child|school/.test(s)?['M4 9h16v12H4V9Z','m2 9 10-6 10 6M9 21v-7h6v7']:['M4 6h16v15H4V6ZM2 6h20M12 6v15','M12 6C3 7 5-3 12 6c7-9 9 1 0 0'];
 for(const d of shapes){const p=document.createElementNS(ns,'path');p.setAttribute('d',d);svg.append(p);}return svg;
}
export function renderVisualExtras(m,asOf,entity){
 const target=$('paydayStrip'),account=$('chartAccount').value;target.replaceChildren();if(!account)return;
 const c=cashCapacity(m,account,asOf),finish=c.nextPay||c.end,days=Math.max(1,Math.round((Date.parse(finish)-Date.parse(asOf))/86400000)+1);
 const events=upcomingActivity(m,{asOf,entity,days}).filter(t=>t.entries.some(e=>e.account===account));
 target.append(el('strong',c.nextPay?'Your path to payday':'Next 30 days'));
 const line=el('ol'),add=(label,date,amount,kind,debt=false)=>{const li=el('li');li.dataset.kind=kind;li.toggleAttribute('data-debt-private',debt);li.append(el('small',date),el('span',label));if(amount!==null)li.append(el('strong',money(amount)));line.append(li);};
 add('Today',asOf,balances(m,asOf)[account],'today');
 for(const t of events.filter(t=>t.date<finish).slice(0,3))add(t.description,t.date,t.unknown?null:t.entries.filter(e=>e.account===account).reduce((n,e)=>n+e.amount,0),t.kind,t.debt);
 const pay=events.filter(t=>t.date===finish&&t.kind==='income').reduce((n,t)=>n+t.entries.filter(e=>e.account===account).reduce((n,e)=>n+e.amount,0),0);
 add(c.nextPay?'Payday':'Horizon end',finish,c.nextPay&&pay?pay:null,'income');
 target.append(line,el('small',c.complete?'Lowest cash '+money(c.low)+' on '+horizonSummary(m,account,asOf,c.end).date+' · floor '+money(c.floor):'Cash estimate needs review. Check Needs review before extra spending.'),el('small','First three upcoming events shown. All bills and category reserves remain in the cash outlook.'));
}
export function renderMonthRecap(m,month,entity,asOf){
 const target=$('monthRecap');target.replaceChildren();const {first,last}=monthBounds(month);if(first>asOf)return;
 const until=last<asOf?last:asOf,b=budgetMonth(m,month,entity,until),grid=el('div');grid.className='metrics';target.append(el('h3',month+' · category recap'));
 for(const [label,v] of [['Plan',b.missing?'Incomplete':money(b.totals.budget)],['Recorded spending',money(b.totals.spent)],['Remainder',b.missing?'Incomplete':money(b.totals.remaining)]]){const cell=el('div');cell.className='metric';cell.append(el('span',label),el('strong',v));grid.append(cell);}target.append(grid);
 const owned=x=>m.accounts.find(a=>a.id===x.account)?.entity===entity,before=savingsSummary(m,addDays(first,-1)).buckets.filter(owned),after=savingsSummary(m,until).buckets.filter(owned),delta=key=>after.reduce((n,b)=>n+b[key]-(before.find(x=>x.id===b.id)?.[key]||0),0);
 target.append(el('p','Bucket contributions '+money(delta('incoming'))+' · withdrawals '+money(delta('outgoing'))+' · net '+money(delta('incoming')-delta('outgoing'))+'. Opening allocations excluded.'));
 const guide=el('ol');for(const text of ['Confirm balances; cash verification is required before closing.','Settle pending activity; record or skip expected income, bills and transfers.','Review unused event amounts below and adjust future-month targets if needed.','Close the month, then Save changes to keep its protection.'])guide.append(el('li',text));target.append(guide);
 const extras=el('details');extras.append(el('summary','Unused event / YOY allowances'));
 for(const x of b.buckets.filter(b=>(b.oneTimeMonth||b.seasonal)&&b.remaining>0))extras.append(el('p',x.name+' · '+money(x.remaining)));
 extras.append(el('p','Unused monthly allowances expire as allowances; cash stays in the bank. Savings buckets carry forward. Closing does not roll budgets or move money. Use Category budgets or YOY expenses to plan the future month. Recurring bills outside these category totals are checked separately.'));target.append(extras);
}
export function clearVisualExtras(){for(const id of ['paydayStrip','monthRecap'])$(id)?.replaceChildren();}
