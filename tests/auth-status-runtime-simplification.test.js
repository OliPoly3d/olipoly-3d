const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const status = require('../js/erp-status.js');

test('Production modern authority wins and legacy values are display-only', () => {
  assert.equal(status.productionStatusFromRecord({production_status:'printing', job_status:'closed', job_payload:{status:'qc'}}), 'printing');
  assert.equal(status.productionStatusFromRecord({job_status:'qc_finishing'}), 'qc');
  assert.equal(status.productionStatusFromRecord({job_payload:{status:'ready_for_pickup'}}), 'ready_for_fulfillment');
  for (const [raw, expected] of [['in_production','printing'], ['qc_finishing','qc'], ['ready_for_shipment','ready_for_fulfillment'], ['closed','closed'], ['cancelled','canceled']]) {
    assert.equal(status.normalizeProductionStatus(raw), expected);
  }
});

test('Order adapter provides one canonical lifecycle display without mutating rows', () => {
  const row = Object.freeze({status:'qc_finishing'});
  assert.equal(status.orderStatusFromRecord(row), 'qc');
  assert.equal(status.orderStatusLabel(row.status), 'QC / Finishing');
  assert.equal(status.orderStatusLabel('ready_for_pickup'), 'Ready for Pickup / Shipment');
  assert.equal(status.orderStatusLabel('closed'), 'Closed');
  assert.equal(status.orderStatusLabel('cancelled'), 'Canceled');
  assert.deepEqual(row, {status:'qc_finishing'});
});

test('Quote adapter preserves response and conversion as separate authority', () => {
  const accepted = Object.freeze({quote_status:'sent', customer_response:'accepted', converted_to_order:false});
  assert.deepEqual(status.quoteStateFromRecord(accepted), {quoteStatus:'sent', customerResponse:'accepted', converted:false, displayStatus:'accepted'});
  const converted = {quote_status:'accepted', customer_response:'accepted', converted_to_order:true, converted_order_number:'OP-1'};
  assert.equal(status.quoteStateFromRecord(converted).displayStatus, 'converted_to_order');
  assert.equal(converted.converted_order_number, 'OP-1');
  assert.equal(status.quoteStateFromRecord({quote_status:'cancelled'}).displayStatus, 'canceled');
  assert.equal(status.quoteStateFromRecord({quote_status:'archived'}).quoteStatus, 'converted_to_order');
});

test('Status adapter is pure and contains no persistence or command dispatch', () => {
  const source = read('js/erp-status.js');
  assert.doesNotMatch(source, /fetch\s*\(|\.from\s*\(|rpc\s*\(|PATCH|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /production_workflow_command|fulfillment_workflow_command/);
});

test('ERP pages and shell resolve one canonical auth runtime while public pages stay public', () => {
  assert.equal(fs.existsSync(path.join(root, 'js/olipoly-auth.js')), false);
  assert.match(read('js/engine-shell.js'), /script\.src = 'olipoly-auth\.js'/);
  for (const page of ['production-control.html','orders-admin.html','quote.html','inventory-control.html','customer-360.html','product-recipes.html','campaign-manager.html','finance-pro.html']) {
    assert.match(read(page), /olipoly-auth\.js/, `${page} loads canonical auth directly or through its shell`);
    assert.doesNotMatch(read(page), /js\/olipoly-auth\.js/);
  }
  for (const page of ['track.html','quote-response.html','pay.html']) assert.doesNotMatch(read(page), /engine-shell\.js/);
  assert.match(read('track.html'), /OliPolyWorkflow\.normalizeOrderStatus/);
  assert.doesNotMatch(read('production-control.html'), /Inline Shared Auth Bridge for Production Control/);
});

test('Canonical auth loss and user change remove command authority and operational cache', async () => {
  const values = new Map([['olipoly_production_jobs_v3','old-user-data']]);
  const localStorage = {getItem:k=>values.get(k) ?? null, setItem:(k,v)=>values.set(k,String(v)), removeItem:k=>values.delete(k)};
  const events = [];
  const window = {localStorage, dispatchEvent(){}, addEventListener(){}};
  window.window = window;
  vm.runInNewContext(read('olipoly-auth.js'), {window, localStorage, fetch:async()=>{throw new Error('not expected');}, CustomEvent:function(){}, atob:v=>Buffer.from(v,'base64url').toString(), Date, JSON, Promise, console:{info(){}}});
  window.OliPolyAuth.onAuthState(session => events.push(session));
  assert.equal(await window.OliPolyAuth.getSession(), null);
  assert.equal(values.has('olipoly_production_jobs_v3'), false);
  assert.equal(window.OliPolyAuth.hasCommandAuthority(), false);
  window.OliPolyAuth.writeSession({access_token:'a', user:{id:'A'}});
  assert.equal(window.OliPolyAuth.hasCommandAuthority(), true);
  values.set('olipoly_orders_v1','A-data');
  window.OliPolyAuth.writeSession({access_token:'b', user:{id:'B'}});
  assert.equal(values.has('olipoly_orders_v1'), false);
  window.OliPolyAuth.logout();
  assert.equal(window.OliPolyAuth.getCurrentUser(), null);
  assert.equal(window.OliPolyAuth.hasCommandAuthority(), false);
  assert.equal(events.at(-1), null);
});

test('Finance retains its existing runtime and canonical bridge integration', () => {
  assert.match(read('finance-pro.html'), /<script src="olipoly-auth\.js"><\/script>/);
  assert.match(read('finance-pro.js'), /supabase\.auth\.onAuthStateChange/);
  assert.match(read('finance-pro.js'), /applySignedOutState/);
});
