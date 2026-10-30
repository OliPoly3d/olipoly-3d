import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../js/money-appearance.js',import.meta.url),'utf8');
test('appearance restores a local choice and follows device changes only in system mode',()=>{
 let ready,change,deviceChange,saved='light';
 const select={value:'',addEventListener:(_,f)=>change=f};
 const document={documentElement:{dataset:{}},addEventListener:(_,f)=>ready=f,getElementById:()=>select};
 const device={matches:false,addEventListener:(_,f)=>deviceChange=f};
 vm.runInNewContext(source,{document,window:{matchMedia:()=>device},localStorage:{getItem:()=>saved,setItem:(_,v)=>saved=v}});
 assert.equal(document.documentElement.dataset.moneyTheme,'light');ready();assert.equal(select.value,'light');
 select.value='system';change();assert.equal(saved,'system');assert.equal(document.documentElement.dataset.moneyTheme,'dark');
 device.matches=true;deviceChange();assert.equal(document.documentElement.dataset.moneyTheme,'light');
 select.value='dark';change();deviceChange();assert.equal(document.documentElement.dataset.moneyTheme,'dark');
});
test('appearance remains usable when browser storage is blocked',()=>{
 let ready,change;const select={value:'',addEventListener:(_,f)=>change=f};
 const document={documentElement:{dataset:{}},addEventListener:(_,f)=>ready=f,getElementById:()=>select};
 vm.runInNewContext(source,{document,window:{},localStorage:{getItem(){throw Error();},setItem(){throw Error();}}});
 ready();select.value='light';change();assert.equal(document.documentElement.dataset.moneyTheme,'light');
});
