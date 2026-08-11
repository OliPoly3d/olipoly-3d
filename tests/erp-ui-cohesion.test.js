'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lifecycle = require('../js/orders-lifecycle-visual.js');

const root = path.join(__dirname, '..');
const pages = [
  'hub.html', 'production-control.html', 'orders-admin.html', 'quote.html',
  'inventory-control.html', 'customer-360.html', 'product-recipes.html',
  'campaign-manager.html', 'erp-handbook.html', 'erp-knowledge-library.html'
];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('every redesigned ERP page loads the same stylesheet and top auth shell', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /css\/erp-ui\.css/, `${page} shared CSS`);
    assert.match(html, /js\/erp-ui\.js/, `${page} shared shell`);
  }
  const shell = read('js/erp-ui.js');
  assert.match(shell, /data-erp-auth="top"/);
  assert.match(shell, /Sign In/);
});

test('Finance Pro is not loaded into the shared redesign', () => {
  assert.doesNotMatch(read('finance-pro.html'), /css\/erp-ui\.css|js\/erp-ui\.js/);
});

test('redesigned pages do not contain duplicate static IDs', () => {
  for (const page of pages) {
    const ids = [...read(page).matchAll(/\sid=["']([^"']+)["']/g)].map(match => match[1]);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    assert.deepEqual(duplicates, [], `${page}: duplicate IDs`);
  }
});

test('functionality-sensitive primary controls remain present', () => {
  const required = {
    'production-control.html': ['syncRepairBtn', 'jobForm', 'confirmQcUsageBtn'],
    'orders-admin.html': ['quickSaveBtn', 'quickPaidBtn', 'pushFinanceBtn', 'closeOrderBtn'],
    'quote.html': ['saveQuoteBtn', 'prepareCustomerEmailBtn', 'acceptCreateBtn'],
    'inventory-control.html': ['rawForm', 'rawSaveBtn', 'confirmAdjustBtn']
  };
  for (const [page, ids] of Object.entries(required)) {
    const html = read(page);
    for (const id of ids) assert.match(html, new RegExp(`id=["']${id}["']`), `${page}#${id}`);
  }
  const production = read('production-control.html');
  assert.match(production, /data-workflow-command="start_print"/);
  assert.match(production, /data-workflow-command="pass_qc"/);
});

test('authoritative Order lifecycle statuses select exactly the correct visual step', () => {
  for (const status of lifecycle.steps) {
    const visual = lifecycle.state(status);
    assert.equal(visual.active, status);
    assert.equal(visual.completed.includes(status), false);
  }
  assert.deepEqual(lifecycle.state('closed'), {
    normalized: 'closed', active: 'closed',
    completed: ['ready_to_print', 'printing', 'qc', 'ready_for_fulfillment']
  });
  assert.deepEqual(lifecycle.state('canceled'), { normalized: 'canceled', active: 'canceled', completed: [] });
});

test('Orders lifecycle presentation reads the hydrated authoritative Order', () => {
  const html = read('orders-admin.html');
  assert.match(html, /activeId \? orders\.find\(order => order\.id === activeId\) : null/);
  assert.match(html, /hydratedOrder\?\.status \|\| \$\('status'\)\?\.value/);
  assert.match(html, /data-step="closed"/);
  assert.match(html, /data-step="canceled"/);
});
