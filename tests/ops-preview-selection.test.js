const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../js/tax-rate.js');
const lineItems = require('../js/order-line-items.js');
require('../js/quote-pricing.js');
const model = require('../js/ops-preview/model.js');
const source = fs.readFileSync(require.resolve('../js/ops-preview/workspace.js'), 'utf8');

function launch(script, model, lineItems, search) {
  const app = {};
  const notice = {};
  const message = {};
  const local = model.seed();
  const hosted = model.seed();
  const locked = hosted.orders[0];
  locked.snapshot = model.totals(locked);
  locked.title = 'Locked hosted sample';
  const request = model.newRequest();
  request.id = 'hosted-request';
  request.title = 'Hosted rehearsal request';
  request.customer = 'Fictional customer';
  request.quoteStage = 'draft';
  hosted.orders.push(request);
  const document = {
    body: {dataset: {page: 'order'}},
    getElementById: id => id === 'app' ? app : message,
    querySelector: () => notice,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const window = {
    OliPolyOpsPreview: model,
    OliPolyLineItems: lineItems,
    OliPolyOpsCloud: {create: () => ({signedIn: () => true, initialize: async () => hosted, pending: () => false})},
    addEventListener() {},
  };
  script({window, document, localStorage: {getItem: () => JSON.stringify(local)}, location: {search}, URLSearchParams});
  return app;
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
