const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/ops-preview/finance-reports.js');
const M = require('../js/ops-preview/finance-model.js');
const fs = require('node:fs');
const path = require('node:path');
const sale = (fields = {}) => ({id:'sale-1',type:'income',entry_date:'2026-11-23',amount:'93.46',shipping_charged:'0',sales_tax_collected:'6.54',sales_tax_rate:'7',sales_county:'Portage',...fields});

test('all-in sale uses stored net revenue and tax without recalculating or adding tax to sales', () => {
  const r = R.summarize([sale({amount:'.07',sales_tax_collected:'.01',tax_included:'yes'})],2026);
  assert.equal(r.total.revenue,.07);
  assert.equal(r.total.grossSales,.07);
  assert.equal(r.total.taxCollected,.01);
  assert.equal(r.counties[0].taxableSales,.07);
});
test('shipping revenue is included once and fees and postage reduce recorded profit once', () => {
  const entries = [sale({amount:14.02,shipping_charged:7.25,sales_tax_collected:1.44}),
    {id:'postage',type:'expense',entry_date:'2026-11-23',amount:6,shipping_cost:0},
    {id:'fee',type:'expense',entry_date:'2026-11-23',amount:.8}];
  const r = R.summarize(entries,2026);
  assert.equal(r.total.productRevenue,14.02);
  assert.equal(r.total.shippingRevenue,7.25);
  assert.equal(r.total.revenue,21.27);
  assert.equal(r.total.expenses,6.8);
  assert.equal(r.total.profit,14.47);
  assert.equal(r.total.taxCollected,1.44);
});
test('taxable plus exempt sales reconcile and rates remain separate within one county', () => {
  const r = R.summarize([sale(),sale({id:'exempt',amount:50,tax_exempt_sale:true,sales_tax_rate:0,sales_tax_collected:0}),
    sale({id:'rate-change',amount:100,sales_tax_rate:7.25,sales_tax_collected:7.25})],2026);
  assert.equal(r.total.grossSales,243.46);
  assert.equal(r.total.taxableSales,193.46);
  assert.equal(r.total.exemptSales,50);
  assert.equal(r.counties.length,3);
  assert.equal(r.total.taxCollected,13.79);
  assert.equal(r.total.taxableSales+r.total.exemptSales,r.total.grossSales);
});
test('semiannual boundaries and zero months are explicit', () => {
  const entries = [sale({entry_date:'2026-06-30'}),sale({id:'july',entry_date:'2026-07-01',amount:20,sales_tax_collected:1.4})];
  const first = R.summarize(entries,2026,'H1'),second = R.summarize(entries,2026,'H2');
  assert.equal(first.months.length,6);
  assert.equal(first.months[0].revenue,0);
  assert.equal(first.total.revenue,93.46);
  assert.equal(second.total.revenue,20);
  assert.equal(second.period.start,'2026-07-01');
  assert.throws(()=>R.summarize(entries,2026,'bad'));
});
test('server effective transaction counts exclude technical correction ledger rows', () => {
  const r = R.summarize([sale({amount:75,is_corrected:true,report_transaction_count:1}),
    sale({id:'reversal',amount:-93.46,report_transaction_count:0}),
    sale({id:'replacement',amount:75,report_transaction_count:0})],2026);
  assert.equal(r.total.count,1);
  assert.equal(r.total.revenue,75);
});
test('posted expenses use business portions without deducting production cost allocations again', () => {
  const r = R.summarize([sale({material_cost:12,labor_cost:30}),
    {type:'expense',entry_date:'2026-11-23',amount:10,original_amount:40,business_use_percent:25},
    {type:'expense',entry_date:'2026-11-23',amount:9.06,miles_driven:12.5,mileage_rate:.725}],2026);
  assert.equal(r.total.expenses,19.06);
  assert.equal(r.total.profit,74.4);
});
test('missing county, missing rate, missing dates and conflicting exemption data are surfaced', () => {
  const r = R.summarize([sale({sales_county:'',sales_tax_rate:0}),sale({id:'bad-date',entry_date:'2026-02-30'}),sale({id:'conflict',tax_exempt_sale:true})],2026);
  assert.equal(r.warnings.length,4);
  assert.ok(r.counties.some(row=>row.name==='Missing county'));
  assert.throws(()=>R.summarize([sale({amount:'bad'})],2026));
});
test('approved orders without a posted sale show deposits and remaining balances separately', () => {
  const order={reference:'OP-9',title:'Deposit order',snapshot:{total:100},payments:[{amount:25}],database:{orderId:'order-9'}};
  const report=R.summarize([],2026,'all',[order]);
  assert.equal(report.total.revenue,0);
  assert.deepEqual(report.unpostedOrders[0],{reference:'OP-9',title:'Deposit order',fulfilled:false,total:100,paid:25,balance:75});
  assert.equal(R.summarize([sale({order_id:'order-9'})],2026,'all',[order]).unpostedOrders.length,0);
});
test('monthly and county CSV supports the same summary fields and all periods reconcile', () => {
  const entries=Array.from({length:100},(_,i)=>sale({id:String(i),amount:'.01',sales_tax_collected:'.00'}));
  const r=R.summarize(entries,2026);
  assert.equal(r.total.revenue,1);
  assert.equal(r.months.reduce((sum,row)=>sum+row.revenue,0),1);
  assert.match(M.csv(r.counties,['name','rate','taxableSales','taxCollected']),/"Portage","7","1","0"/);
});

test('report filters update independently of transaction search and retain the expense draft', {skip:!process.env.OPS_JSDOM_MODULE}, async () => {
  const {JSDOM}=require(process.env.OPS_JSDOM_MODULE);
  const root=path.resolve(__dirname,'..');
  const dom=new JSDOM(fs.readFileSync(path.join(root,'ops-finance-preview.html'),'utf8'),{url:'https://erp-test.example/ops-finance-preview.html',runScripts:'outside-only'});
  const w=dom.window;
  for(const script of ['js/order-line-items.js','js/ops-preview/finance-model.js','js/ops-preview/finance-reports.js']) w.eval(fs.readFileSync(path.join(root,script),'utf8'));
  const entries=[sale({entry_date:'2026-06-30'}),sale({id:'july',entry_date:'2026-07-01',amount:20,sales_tax_collected:1.4})];
  w.OliPolyOpsCloud={create:()=>({signedIn:()=>true,financePending:()=>false,financeLoad:async()=>entries,load:async()=>({orders:[{reference:'OP-9',title:'Deposit order',snapshot:{total:100},payments:[{amount:25}],database:{orderId:'order-9'}}]})})};
  w.eval(fs.readFileSync(path.join(root,'js/ops-preview/finance.js'),'utf8'));
  await new Promise(resolve=>setImmediate(resolve));
  const form=w.document.getElementById('expense-form');
  form.elements.title.value='Unsaved purchase';
  const year=w.document.querySelector('[name="report_year"]');year.value='2026';year.dispatchEvent(new w.Event('change',{bubbles:true}));
  const half=w.document.querySelector('[name="report_half"]');half.value='H1';half.dispatchEvent(new w.Event('change',{bubbles:true}));
  const content=w.document.getElementById('reports-content').textContent;
  assert.match(content,/2026-01-01 through 2026-06-30/);
  assert.match(content,/\$93\.46/);
  assert.match(content,/OP-9/);
  assert.match(content,/\$75\.00/);
  const search=w.document.querySelector('[name="search"]');search.value='No matching transaction';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.match(w.document.getElementById('finance-count').textContent,/0 transactions/);
  assert.match(w.document.getElementById('reports-content').textContent,/\$93\.46/);
  assert.equal(form.elements.title.value,'Unsaved purchase');
  dom.window.close();
});
