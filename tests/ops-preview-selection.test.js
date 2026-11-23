const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../js/tax-rate.js');
const lineItems = require('../js/order-line-items.js');
require('../js/quote-pricing.js');
const model = require('../js/ops-preview/model.js');
const source = fs.readFileSync(require.resolve('../js/ops-preview/workspace.js'), 'utf8');

function launch(script, model, lineItems, search, {
  page='order', signedIn=true, tracking, inventory, warnings, saveInventoryWarning,
} = {}) {
  const app = {};
  const notice = {};
  const message = {};
  const local = model.seed();
  const hosted = model.seed();
  const elements = {app, message, 'inventory-count': {}, 'inventory-rows': {}};
  const listeners = {};
  if (inventory) {
    hosted.inventory = inventory;
    hosted.databaseMode = true;
  }
  const locked = hosted.orders[0];
  locked.snapshot = model.totals(locked);
  locked.title = 'Locked hosted sample';
  locked.database = {orderNumber: 'OP-0000001'};
  const request = model.newRequest();
  request.id = 'hosted-request';
  request.title = 'Hosted rehearsal request';
  request.customer = 'Fictional customer';
  request.quoteStage = 'draft';
  hosted.orders.push(request);
  const document = {
    body: {dataset: {page}},
    getElementById: id => elements[id],
    querySelector: () => notice,
    querySelectorAll: () => [],
    addEventListener: (event, handler) => { listeners[event] = handler; },
  };
  const window = {
    OliPolyOpsPreview: model,
    OliPolyLineItems: lineItems,
    OliPolyOpsCloud: {create: () => ({signedIn: () => signedIn, initialize: async () => hosted,
      pending: () => false, tracking, inventoryWarnings: async () => warnings, saveInventoryWarning})},
    addEventListener() {},
  };
  script({window, document, localStorage: {getItem: () => JSON.stringify(local)}, location: {search}, URLSearchParams});
  return Object.assign(app, {notice, elements, listeners});
}

test('hosted links select the requested project after cloud initialization', async () => {
  const run = context => vm.runInNewContext(source, context);
  const draft = launch(run, model, lineItems, '?database=test&order=hosted-request&section=details');
  const missing = launch(run, model, lineItems, '?database=test&order=missing&section=details');
  const defaultProject = launch(run, model, lineItems, '?database=test');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(draft.innerHTML, /<h1>Hosted rehearsal request<\/h1>/);
  assert.match(draft.innerHTML, /id="details-form"/);
  assert.match(missing.innerHTML, /Project unavailable/);
  assert.doesNotMatch(missing.innerHTML, /Locked hosted sample/);
  assert.match(defaultProject.innerHTML, /<h1>Locked hosted sample<\/h1>/);
  assert.doesNotMatch(defaultProject.innerHTML, /id="details-form"/);
});

test('milestone preview returns the owner to pickup, including when tracking fails', async () => {
  const run = context => vm.runInNewContext(source, context);
  const order = launch(run, model, lineItems, '?database=test');
  const tracking = async reference => {
    assert.equal(reference, 'OP-0000001');
    return [{order_number: reference, public_status_text: 'Ready', balance_amount: 110}];
  };
  const query = '?database=test&order=sample-mixed-order&tracking=OP-0000001';
  const owner = launch(run, model, lineItems, query, {page: 'track', tracking});
  const unavailable = launch(run, model, lineItems, query, {page: 'track', tracking: async () => []});
  const visitor = launch(run, model, lineItems, query, {page: 'track', signedIn: false, tracking});
  const older = launch(run, model, lineItems, '?database=test&tracking=OP-0000001', {page: 'track', tracking});
  const local = launch(run, model, lineItems, '?order=sample-mixed-order', {page: 'track'});
  await new Promise(resolve => setImmediate(resolve));
  assert.match(order.innerHTML, /ops-track-preview\.html\?order=sample-mixed-order&database=test&tracking=OP-0000001/);
  assert.match(owner.innerHTML, /OP-0000001/);
  assert.match(unavailable.innerHTML, /Tracking unavailable/);
  for (const preview of [owner, unavailable]) {
    assert.match(preview.notice.innerHTML, /ops-order-preview\.html\?order=sample-mixed-order&amp;section=pickup&amp;database=test">Back to ERP/);
  }
  assert.doesNotMatch(visitor.notice.innerHTML, /Back to ERP/);
  assert.match(older.notice.innerHTML, /ops-preview\.html\?database=test">Back to ERP/);
  assert.match(local.notice.innerHTML, /ops-order-preview\.html\?order=sample-mixed-order&amp;section=pickup">Back to ERP/);
});

test('filament availability searches a larger list and displays reservations separately', async () => {
  const run = context => vm.runInNewContext(source, context);
  const inventory = Array.from({length: 36}, (_, i) => ({
    key: `PLA / Color ${i + 1}`, databaseId: `roll-${i + 1}`, grams: 1000, reserved: 225.5, cost: 0.023,
  }));
  inventory[0].grams = 240;
  inventory[1].grams = 240;
  inventory[2].grams = 240;
  const warnings = {excluded: ['PLA / Color 2'], levels: inventory.map(stock => ({
    id: stock.databaseId, reorder_threshold_grams: 250, reorder_policy: stock.databaseId === 'roll-3' ? 'watch' : 'auto',
  }))};
  const saves = [];
  const options = {page: 'today', inventory, warnings, saveInventoryWarning: async (...args) => saves.push(args)};
  const overview = launch(run, model, lineItems, '?database=test', options);
  const app = launch(run, model, lineItems, '?database=test&view=inventory', options);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(overview.innerHTML, /1 stock warning/);
  assert.match(overview.innerHTML, /PLA \/ Color 1<\/th>/);
  assert.doesNotMatch(overview.innerHTML, /PLA \/ Color (2|3|34)<\/th>/);
  assert.match(overview.innerHTML, /See all inventory/);
  assert.match(app.innerHTML, /<h1>All inventory<\/h1>/);
  assert.match(app.innerHTML, /36 of 36 material and color combinations/);
  assert.match(app.innerHTML, /data-inventory-warning="PLA \/ Color 2"[^>]+checked/);
  assert.match(app.innerHTML, /On hand \(g\).*Reserved \(g\).*Available \(g\)/);
  app.listeners.input({target: {id: 'inventory-search', value: 'color PLA 34'}});
  assert.equal(app.elements['inventory-count'].textContent, '1 of 36 material and color combinations');
  assert.match(app.elements['inventory-rows'].innerHTML, /Color 34.*1,000.*225\.5.*774\.5/);
  app.listeners.input({target: {id: 'inventory-search', value: 'unknown'}});
  assert.match(app.elements['inventory-rows'].innerHTML, /No filament matches this search/);
  await app.listeners.change({target: {dataset: {inventoryWarning: 'PLA / Color 1'}, checked: true}});
  assert.deepEqual(saves, [['PLA / Color 1', true]]);
  const after = launch(run, model, lineItems, '?database=test', options);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(after.innerHTML, /No stock warnings/);
});
