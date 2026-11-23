const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../js/ops-preview/finance-reports.js');
const M = require('../js/ops-preview/finance-model.js');
const root = path.resolve(__dirname,'..');
const expense = (category, amount, extra={}) => ({id:category,type:'expense',category,entry_date:'2026-11-23',amount,...extra});
const fixtures = [
  {id:'sale',type:'income',category:'Sale',entry_date:'2026-01-02',amount:100,shipping_charged:10,sales_tax_collected:7.7,sales_tax_rate:7,sales_county:'Portage',accepted_commercial_snapshot:{accepted_commercial_breakdown:{shipping_in_taxable_subtotal:true}}},
  expense('Material',10,{original_amount:40,business_use_percent:25,tax_category:'other',material_cost:999}),
  expense('Shipping',0,{shipping_cost:9}),expense('Equipment',100),expense('Printer Parts / Repairs',12),
  expense('Vehicle / Delivery Mileage',9.06,{miles_driven:12.5,mileage_rate:.725,round_trip:true,trip_purpose:'Post office',trip_from:'HQ',trip_to:'USPS'}),
  expense('Custom cost',3,{tax_category:'custom_bucket'}),expense('Equipment',-5,{id:'refund'}),
  expense('Material',500,{id:'technical-replacement',report_transaction_count:0}),
  expense('Packaging',99,{entry_date:'2025-12-31'})
];

test('annual categories reconcile with posted expenses including business portions, postage and refunds',()=>{
  const original=JSON.stringify(fixtures), report=R.summarize(fixtures,2026);
  assert.equal(report.total.revenue,110);
  assert.equal(report.total.expenses,138.06);
  assert.equal(report.total.profit,-28.06);
  assert.equal(report.expenses.length,7);
  assert.equal(report.categories.reduce((sum,row)=>sum+Math.round(row.amount*100),0),13806);
  assert.equal(report.categories.find(row=>row.name==='Material').group,'materials');
  assert.equal(report.categories.find(row=>row.name==='Equipment').amount,95);
  assert.equal(report.categories.find(row=>row.name==='Custom cost').group,'custom_bucket');
  assert.equal(report.mileage[0].miles_driven,12.5);
  assert.equal(report.mileage[0].amount,9.06);
  assert.equal(JSON.stringify(fixtures),original);
});

test('Finance Pro and new annual report reconcile the same effective fixture ledger',()=>{
  const legacy=fs.readFileSync(path.join(root,'finance-pro.js'),'utf8');
  const context=vm.createContext({entries:fixtures,num:value=>Number(value||0),calculateSalesTax:(amount,rate)=>Math.round(amount*rate)/100});
  // Execute the existing pure legacy accounting functions, not copies of their formulas.
  vm.runInContext(legacy.slice(legacy.indexOf('const defaultTax ='),legacy.indexOf('const directCost =')),context);
  vm.runInContext(legacy.slice(legacy.indexOf('const incomeSaleAmount ='),legacy.indexOf('function computeTaxExclusive')),context);
  vm.runInContext(legacy.slice(legacy.indexOf('function taxBuckets('),legacy.indexOf('function scheduleCBucketDetails(')),context);
  const old=vm.runInContext('taxBuckets(2026)',context), report=R.summarize(fixtures,2026);
  assert.equal(old.income_sales+old.income_shipping,report.total.revenue);
  assert.equal(old.sales_tax_collected,report.total.taxCollected);
  const totals={};report.categories.forEach(row=>{totals[row.group]=(totals[row.group]||0)+row.amount;});
  for(const [group,total] of Object.entries(totals)) assert.ok(Math.abs(total-old[group])<1e-9,group);
});

test('tax references distinguish equipment, repairs, home office and current other-expense line',()=>{
  const r=R.summarize([...fixtures,expense('Home Office',20),expense('Software / Subscriptions',10)],2026);
  const reference=name=>r.categories.find(row=>row.name===name).reference;
  assert.match(reference('Equipment'),/Equipment review/);
  assert.match(reference('Printer Parts / Repairs'),/Line 21/);
  assert.match(reference('Home Office'),/Line 30/);
  assert.match(reference('Software / Subscriptions'),/27b/);
  assert.match(R.summarize([expense('Software / Subscriptions',1,{entry_date:'2024-01-01'})],2024).categories[0].reference,/tax-year/);
});

test('missing and inconsistent mileage stays visible without repricing and unknown categories stay in totals',()=>{
  const r=R.summarize([expense('Vehicle / Delivery Mileage',9,{miles_driven:10,mileage_rate:.725}),expense('__proto__',2),expense('',3)],2026);
  assert.equal(r.total.expenses,14);
  assert.equal(r.mileage[0].amount,9);
  assert.ok(r.warnings.some(note=>/differs/.test(note)));
  assert.ok(r.warnings.some(note=>/trip details/.test(note)));
  assert.equal(r.categories.find(row=>row.name==='__proto__').group,'other');
  assert.ok(r.categories.some(row=>row.name==='Uncategorized'));
});

test('annual UI and exports use the full year, escaped evidence, audit IDs and shared office reference',{skip:!process.env.OPS_JSDOM_MODULE},async()=>{
  const {JSDOM}=require(process.env.OPS_JSDOM_MODULE);
  const dom=new JSDOM(fs.readFileSync(path.join(root,'ops-finance-preview.html'),'utf8'),{url:'https://erp-test.example/ops-finance-preview.html',runScripts:'outside-only'});
  const w=dom.window, downloads=[], clicks=[];
  for(const file of ['js/order-line-items.js','js/ops-preview/business-settings-model.js','js/ops-preview/finance-model.js','js/ops-preview/finance-reports.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  w.Blob=class {constructor(parts){this.text=parts.join('');}};
  w.URL.createObjectURL=blob=>{downloads.push(blob.text);return 'blob:fixture';};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){clicks.push(this.download);};
  const entries=[...fixtures,expense('Packaging',1,{id:'evidence',title:'<img src=x onerror=alert(1)>',receipt_link:'javascript:alert(1)',original_entry_id:'original-1',effective_entry_id:'corrected-1'}),expense('Supplies',2,{receipt_link:'https://drive.google.com/receipt'})];
  w.OliPolyOpsCloud={create:()=>({signedIn:()=>true,financePending:()=>false,financeLoad:async()=>entries,load:async()=>({orders:[],settings:{...w.OliPolyBusinessSettings.defaults,officeSqft:100,homeSqft:2000}})})};
  w.eval(fs.readFileSync(path.join(root,'js/ops-preview/finance.js'),'utf8'));
  await new Promise(resolve=>setImmediate(resolve));
  const form=w.document.getElementById('expense-form');form.elements.title.value='Keep unsaved purchase';
  for(const [name,value] of [['report_year','2026'],['report_half','H1']]){const el=w.document.querySelector(`[name="${name}"]`);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));}
  const annual=w.document.getElementById('annual-finance');
  assert.match(annual.textContent,/2026-01-01 through 2026-12-31/);
  assert.match(annual.textContent,/\$141\.06/);
  assert.match(annual.textContent,/5% area ratio/);
  assert.match(annual.textContent,/original-1/);assert.match(annual.textContent,/corrected-1/);
  assert.equal(annual.querySelector('img'),null);
  assert.equal(annual.querySelector('a[href^="javascript:"]'),null);
  assert.ok(annual.querySelector('a[href="https://drive.google.com/receipt"]'));
  for(const action of ['export-annual','export-expenses','export-mileage']){annual.querySelector(`[data-action="${action}"]`).click();await new Promise(resolve=>setImmediate(resolve));}
  assert.equal(downloads.length,3);assert.equal(clicks.length,3);
  assert.match(downloads[0],/"Recorded expenses","","141.06"/);
  assert.match(downloads[0],/2026-12-31/);assert.match(downloads[0],/5% area ratio/);
  assert.match(downloads[1],/original-1/);assert.match(downloads[1],/corrected-1/);
  assert.match(downloads[2],/"12.5","0.725","Post office","HQ","USPS","true"/);
  assert.doesNotMatch(downloads[1],/technical-replacement/);
  assert.equal(form.elements.title.value,'Keep unsaved purchase');
  dom.window.close();
});
