import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../pay.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean);
function setup(search,body,{fail=false,pending=false}={}) {
 const nodes=new Map(),classes=new Set();let calls=0;
 function node(key){if(!nodes.has(key))nodes.set(key,{hidden:false,textContent:'',innerHTML:'',classList:{add(){}},setAttribute(name,value){this[name]=value;}});return nodes.get(key);}
 const document={getElementById:node,querySelector:node,documentElement:{classList:{add:key=>classes.add(key),remove:key=>classes.delete(key)}}};
 const context={document,location:{search},URLSearchParams,Intl,fetch:async()=>{calls++;if(pending)return new Promise(()=>{});return {ok:!fail,json:async()=>body};}};
 for(const script of scripts)new vm.Script(script).runInNewContext(context);
 return {node,classes,calls:()=>calls};
}
const settle=()=>new Promise(setImmediate);
test('generic event payments retain all existing methods without a lookup',()=>{
 const page=setup('',[]);
 assert.equal(page.calls(),0);assert.equal(page.node('.payment-landing').hidden,false);
});
test('order-specific payment options stay hidden while the lookup is pending',()=>{
 const page=setup('?order=OP-999981',[],{pending:true});
 assert.equal(page.calls(),1);assert.equal(page.node('.payment-landing').hidden,true);
 assert.match(html,/\.order-payment-loading \.payment-landing\{display:none!important\}/);
 assert.match(html,/\.pay-page \[hidden\]/);
});
test('a fictional completed paid order shows the amount received and no payment methods',async()=>{
 const page=setup('?order=OP-999981',[{order_number:'OP-999981',payment_status:'paid',order_total:120.00,deposit_amount:0,balance_amount:0}]);
 await settle();
 assert.equal(page.node('.payment-landing').hidden,true);
 assert.equal(page.node('orderDepositDisplay').textContent,'$120.00');
 assert.equal(page.node('orderBalanceDisplay').textContent,'$0.00');
 assert.equal(page.node('orderPayStatus').textContent,'Paid');
 assert.match(page.node('orderPayGuidance').innerHTML,/No additional payment/);
});
test('a positive unpaid balance keeps payment options and uses actual balance for received amount',async()=>{
 const page=setup('?order=OP-999982',[{order_number:'OP-999982',payment_status:'partial',order_total:100,deposit_amount:20,balance_amount:50,payment_link_stripe:'https://example.com/order-checkout'}]);
 await settle();
 assert.equal(page.node('.payment-landing').hidden,false);
 assert.equal(page.node('orderDepositDisplay').textContent,'$50.00');
 assert.equal(page.node('orderBalanceDisplay').textContent,'$50.00');
 assert.equal(page.node('a.cardpay').href,'https://example.com/order-checkout');
});
test('lookup failure, missing records and zero balances never reveal generic payment methods',async()=>{
 for(const [body,options] of [[[],{}],[{message:'Unavailable'},{fail:true}],[[{order_number:'OP-999982',payment_status:'unpaid',order_total:0,balance_amount:0}],{}]]){
  const page=setup('?order=OP-999982',body,options);await settle();
  assert.equal(page.node('.payment-landing').hidden,true);
 }
});
