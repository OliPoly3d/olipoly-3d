const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../js/ops-preview/finance-defaults.js');
test('business mileage selects verified trip-date rates including midyear changes, never extrapolates',()=>{
 for(const [date,rate] of [['2022-06-30',.585],['2022-07-01',.625],['2025-12-31',.7],['2026-06-30',.725],['2026-07-01',.76],['2026-11-23',.76]])assert.equal(D.mileage(date).rate,rate);
 for(const date of ['2027-01-01','2021-01-01','2026-02-30',''])assert.equal(D.mileage(date).rate,null);
 assert.ok(D.headquarters.length<=120);assert.match(D.headquarters,/990 Aurora Hudson Rd/);
});
test('Ohio combined rates cover all counties, boundaries, exemptions and transit ambiguity',()=>{
 assert.equal(Object.keys(D.counties).length,88);
 assert.equal(D.salesTax('portage county','2026-11-23').rate,7);
 assert.equal(D.salesTax('Geauga','2026-11-23').rate,6.75);
 assert.equal(D.salesTax('Warren','2026-09-30').rate,6.75);assert.equal(D.salesTax('Warren','2026-10-01').rate,7.25);
 for(const county of ['Delaware','Fairfield','Licking','Union','Wood']){assert.equal(D.salesTax(county,'2026-11-23').rate,null);assert.match(D.salesTax(county,'2026-11-23').label,/transit/);}
 assert.equal(D.salesTax('Portage','2027-01-01').rate,null);assert.equal(D.salesTax('Portage','2025-01-01').rate,null);
 assert.equal(D.salesTax('Unknown','2026-11-23').rate,null);assert.equal(D.salesTax('Unknown','2026-11-23',true).rate,0);
});
function fixture(html){const {JSDOM}=require(process.env.OPS_JSDOM_MODULE);const dom=new JSDOM(html,{url:'https://test.example/',runScripts:'outside-only'});dom.window.eval(fs.readFileSync(path.resolve(__dirname,'../js/ops-preview/finance-defaults.js'),'utf8'));return dom;}
function change(w,input,value){input.value=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));}
test('new mileage autofills by date, preserves manual override and restores verified rate explicitly',{skip:!process.env.OPS_JSDOM_MODULE},()=>{
 const dom=fixture('<form><select name="category"><option>Vehicle / Delivery Mileage</option></select><input name="entry_date" value="2026-06-30"><label>Rate<input name="mileage_rate"></label></form>'),w=dom.window,f=w.document.querySelector('form'),D=w.OliPolyOpsFinanceDefaults;
 D.bind(f,{kind:'mileage',rate:'mileage_rate',date:'entry_date',auto:true,initial:true});assert.equal(f.elements.mileage_rate.value,'0.725');
 change(w,f.elements.entry_date,'2026-07-01');assert.equal(f.elements.mileage_rate.value,'0.76');
 change(w,f.elements.mileage_rate,'0.8');change(w,f.elements.entry_date,'2026-05-01');assert.equal(f.elements.mileage_rate.value,'0.8');
 f.querySelector('button').click();assert.equal(f.elements.mileage_rate.value,'0.725');
 change(w,f.elements.entry_date,'2027-01-01');assert.equal(f.elements.mileage_rate.value,'');assert.equal(f.querySelector('button').disabled,true);
 dom.window.close();
});
test('historical corrections preserve saved rate and origin until explicit action',{skip:!process.env.OPS_JSDOM_MODULE},()=>{
 const dom=fixture('<form><input name="category" value="Vehicle / Delivery Mileage"><input name="entry_date" value="2026-11-23"><label>Rate<input name="mileage_rate" value=".725"></label><input name="trip_from" value="Other location"></form>'),w=dom.window,f=w.document.querySelector('form');
 w.OliPolyOpsFinanceDefaults.bind(f,{kind:'mileage',rate:'mileage_rate',date:'entry_date',auto:false});
 assert.equal(f.elements.mileage_rate.value,'.725');assert.equal(f.elements.trip_from.value,'Other location');
 change(w,f.elements.entry_date,'2026-10-01');assert.equal(f.elements.mileage_rate.value,'.725');
 f.querySelector('button').click();assert.equal(f.elements.mileage_rate.value,'0.76');dom.window.close();
});
test('quote county selection applies standard rates but retains overrides and requires exact transit lookup',{skip:!process.env.OPS_JSDOM_MODULE},()=>{
 const dom=fixture('<form id="quote"><input name="county" value="Portage"><input name="taxExempt" type="checkbox"><label>Rate<input name="taxRate" value="7"></label></form>'),w=dom.window,f=w.document.querySelector('form');
 w.OliPolyOpsFinanceDefaults.bind(f,{kind:'tax',rate:'taxRate',county:'county',exempt:'taxExempt',asOf:'2026-11-23',auto:true});
 change(w,f.elements.county,'Geauga');assert.equal(f.elements.taxRate.value,'6.75');
 change(w,f.elements.taxRate,'6.8');change(w,f.elements.county,'Summit');assert.equal(f.elements.taxRate.value,'6.8');
 f.querySelector('button').click();assert.equal(f.elements.taxRate.value,'6.75');
 change(w,f.elements.county,'Wood');assert.equal(f.elements.taxRate.value,'');assert.match(f.textContent,/transit/);
 assert.equal(f.querySelectorAll('datalist option').length,88);dom.window.close();
});
test('a saved quote custom tax rate is preserved when opening or changing county',{skip:!process.env.OPS_JSDOM_MODULE},()=>{
 const dom=fixture('<form><input name="county" value="Portage"><label>Rate<input name="taxRate" value="7.5"></label></form>'),w=dom.window,f=w.document.querySelector('form');
 w.OliPolyOpsFinanceDefaults.bind(f,{kind:'tax',rate:'taxRate',county:'county',asOf:'2026-11-23',auto:true});
 assert.equal(f.elements.taxRate.value,'7.5');change(w,f.elements.county,'Geauga');assert.equal(f.elements.taxRate.value,'7.5');dom.window.close();
});
test('actual Finance form prefills HQ and date-based mileage, saves override, preserves historical correction',{skip:!process.env.OPS_JSDOM_MODULE},async()=>{
 const {JSDOM}=require(process.env.OPS_JSDOM_MODULE),root=path.resolve(__dirname,'..');
 const dom=new JSDOM(fs.readFileSync(path.join(root,'ops-finance-preview.html'),'utf8'),{url:'https://test.example/ops-finance-preview.html?database=test',runScripts:'outside-only'}),w=dom.window,rows=[],calls=[];
 for(const file of ['js/order-line-items.js','js/tax-rate.js','js/ops-preview/finance-defaults.js','js/ops-preview/finance-model.js','js/ops-preview/finance-reports.js','js/ops-preview/finance-corrections.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 w.OliPolyOpsCloud={create:()=>({signedIn:()=>true,financePending:()=>false,financeCorrectionPending:()=>null,financeLoad:async()=>rows,load:async()=>({orders:[]}),financeCreate:async entry=>{calls.push(entry);rows.push({...entry,id:'saved',effective_version_at:'2026-11-23T12:00:00Z'});}})};
 w.eval(fs.readFileSync(path.join(root,'js/ops-preview/finance.js'),'utf8'));const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush();
 const f=w.document.getElementById('expense-form');f.elements.entry_date.value='2026-11-23';change(w,f.elements.category,'Vehicle / Delivery Mileage');
 assert.equal(f.elements.mileage_rate.value,'0.76');assert.equal(f.elements.trip_from.value,D.headquarters);
 change(w,f.elements.trip_from,'Alternate starting point');change(w,f.elements.mileage_rate,'.8');
 f.elements.title.value='Supply pickup';f.elements.trip_purpose.value='Supply pickup';f.elements.miles_driven.value='10';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await flush();
 assert.equal(calls[0].amount,8);assert.equal(calls[0].mileage_rate,.8);assert.equal(calls[0].trip_from,'Alternate starting point');
 assert.equal(f.elements.trip_from.value,D.headquarters);
 w.document.querySelector('[data-action="correct"]').click();const correction=w.document.getElementById('correction-form');assert.equal(correction.elements.mileage_rate.value,'0.8');assert.equal(correction.elements.trip_from.value,'Alternate starting point');dom.window.close();
});
test('actual quote builder county default updates canonical totals and saves editable rate',{skip:!process.env.OPS_JSDOM_MODULE},async()=>{
 const {JSDOM}=require(process.env.OPS_JSDOM_MODULE),root=path.resolve(__dirname,'..');
 const dom=new JSDOM(fs.readFileSync(path.join(root,'ops-order-preview.html'),'utf8'),{url:'https://test.example/ops-order-preview.html?section=details',runScripts:'outside-only'}),w=dom.window;
 for(const file of ['js/tax-rate.js','js/order-line-items.js','js/quote-pricing.js','js/workflow-status.js','js/ops-preview/model.js','js/ops-preview/finance-defaults.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 const state=w.OliPolyOpsPreview.seed(),order=state.orders[0];Object.assign(order,{taxIncluded:false,designFee:0,customer:'Test customer',title:'Test quote',quoteStage:'draft',items:[{...order.items[0],quantity:1,unit_price:100}]});
 w.localStorage.setItem('olipoly.ops.preview.v1',JSON.stringify(state));w.eval(fs.readFileSync(path.join(root,'js/ops-preview/workspace.js'),'utf8'));
 const f=w.document.getElementById('details-form');assert.equal(f.elements.taxRate.value,'7');assert.ok(f.querySelector('.rate-guidance'));
 change(w,f.elements.county,'Geauga');assert.equal(f.elements.taxRate.value,'6.75');assert.match(w.document.getElementById('price-card').textContent,/106\.75/);
 change(w,f.elements.taxRate,'6.8');f.elements.taxRate.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(w.document.getElementById('price-card').textContent,/106\.80/);
 f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
 const saved=JSON.parse(w.localStorage.getItem('olipoly.ops.preview.v1')).orders[0];assert.equal(saved.taxRate,6.8);assert.equal(saved.county,'Geauga');assert.equal(saved.snapshot,undefined);dom.window.close();
});
