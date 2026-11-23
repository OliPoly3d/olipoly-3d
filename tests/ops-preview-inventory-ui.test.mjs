import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const script = name => fs.readFileSync(new URL(`../js/${name}`,import.meta.url),'utf8');
const snapshot = () => ({
 rolls:Array.from({length:35},(_,i)=>({id:`roll-${i}`,material_type:'PETG',color_name:i<3?'Black':`Color ${i}`,brand:'Bambu',roll_label:`Roll ${i}`,remaining_grams:i===0?400:1000,starting_grams:1000,cost_per_spool:20,cost_per_gram:0.02,reserved_grams:0,roll_type:i===0?'spool':'refill',reusable_spool:true,is_mounted:i===0,reorder_threshold_grams:250})),
 pool:{available_empty:2,retired:1},supplies:[],events:[],options:{},
});
test('All inventory normal screen entry exposes roll, weigh-in, spool and supplies forms',{skip:!process.env.OPS_JSDOM_MODULE},async()=>{
 const {JSDOM}=await import(pathToFileURL(process.env.OPS_JSDOM_MODULE));
 const html=fs.readFileSync(new URL('../ops-preview.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://example.test/ops-preview.html?database=test&view=inventory',runScripts:'outside-only'});
 const w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 const calls=[];let data=snapshot(),state;
 const warnings={levels:[],excluded:['PETG / Black']};
 try{
  for(const file of ['tax-rate.js','order-line-items.js','quote-pricing.js','ops-preview/model.js','ops-preview/inventory.js'])w.eval(script(file));
  state=w.OliPolyOpsPreview.seed();state.databaseMode=true;
  state.inventory=[{key:'PETG / Black',grams:2400,reserved:0,cost:0.02}];
  w.OliPolyOpsCloud={create:()=>({signedIn:()=>true,initialize:async()=>state,pending:()=>false,inventoryWarnings:async()=>warnings,inventoryLoad:async()=>data,
   saveInventoryWarning:async(key,excluded)=>{calls.push({warning:key,excluded});},
   inventorySave:async(action,revision)=>{calls.push({action:JSON.parse(JSON.stringify(action)),revision});state.revision++;
    if(action.type==='save_supply')data.supplies.push({...action.data,id:'supply-1',quantity_on_hand:action.data.quantity_on_hand});
    return{workspace:state,inventory:data};},
  })};
  w.eval(script('ops-preview/workspace.js'));
  const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
  const click=async(selector)=>{const el=w.document.querySelector(selector);assert.ok(el,selector);el.click();await settle();};
  const submit=async()=>{w.document.querySelector('[data-inv-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  await settle();
  assert.match(w.document.body.textContent,/35 of 35 rolls/);
  assert.match(w.document.body.textContent,/EMPTY REUSABLE SPOOLS/);
  assert.equal(w.document.querySelector('[data-inventory-warning="PETG / Black"]').checked,true);
  await click('[data-inv-action="save_roll"][data-inv-id="roll-0"]');
  assert.equal(w.document.querySelector('input[name="remaining_grams"]'),null);
  assert.equal(w.document.querySelector('[name="roll_label"]').value,'Roll 0');
  w.document.querySelector('[name="brand"]').value='New Brand';
  w.document.querySelector('[name="reason"]').value='Correct brand';await submit();
  assert.equal(calls.at(-1).action.data.reusable_spool,true);
  assert.equal(calls.at(-1).action.data.brand,'New Brand');
  await click('[data-inv-action="adjust_roll"][data-inv-id="roll-0"]');
  const form=w.document.querySelector('[data-inv-form]');
  form.elements.mode.value='weigh';form.elements.gross_grams.value='650';form.elements.tare_grams.value='200';
  form.elements.tare_grams.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.match(w.document.querySelector('[data-inv-net]').textContent,/450 g/);
  form.elements.reason.value='Physical weigh-in';await submit();
  assert.equal(calls.at(-1).action.data.gross_grams,650);
  assert.equal(calls.at(-1).action.data.tare_grams,200);
  await click('[data-inv-action="mount_roll"][data-inv-id="roll-1"]');
  w.document.querySelector('[name="reason"]').value='Mount refill';await submit();
  assert.match(w.document.getElementById('message').textContent,/Confirm/);
  w.document.querySelector('[name="confirm"]').checked=true;await submit();
  assert.equal(calls.at(-1).action.type,'mount_roll');
  await click('[data-inv-section="supplies"]');await click('[data-inv-action="save_supply"]');
  const supply=w.document.querySelector('[data-inv-form]');
  Object.assign(supply.elements.item_name,{value:'Wrap'});supply.elements.unit_type.value='sq.ft.';
  supply.elements.quantity_on_hand.value='12.5';supply.elements.cost_per_unit.value='0.4';supply.elements.reason.value='Opening stock';await submit();
  assert.equal(calls.at(-1).action.data.quantity_on_hand,12.5);
  assert.equal(calls.at(-1).action.data.unit_type,'sq.ft.');
  assert.match(w.document.body.textContent,/12.5 sq.ft./);
  await click('[data-inv-section="settings"]');
  assert.match(w.document.querySelector('[name="materials"]').value,/PLA Basic/);
  assert.match(w.document.querySelector('[name="materials"]').value,/PLA Silk/);
  w.document.querySelector('[name="materials"]').value='PLA Basic\nCustom blend';
  w.document.querySelector('[name="reason"]').value='Update materials';await submit();
  assert.deepEqual(calls.at(-1).action.data.materials,['PLA Basic','Custom blend']);
  await click('[data-inv-section="filament"]');
  const search=w.document.getElementById('inv-search');search.value='Color 34';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.match(w.document.body.textContent,/1 of 35 rolls/);
  assert.ok(w.document.querySelector('a[href="ops-preview.html?database=test"]'));
 }finally{w.close();}
});
