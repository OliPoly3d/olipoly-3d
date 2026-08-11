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

test('shared light-theme text tokens meet normal-text contrast expectations', () => {
  const css = read('css/erp-ui.css');
  const token = name => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = hex => rgb(hex)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };

  for (const name of ['erp-text', 'erp-text-secondary', 'erp-muted', 'erp-meta', 'erp-link',
    'erp-placeholder', 'erp-disabled-text']) {
    assert.ok(contrast(token(name), token('erp-surface')) >= 4.5, `${name} on ERP surface`);
  }
  assert.ok(contrast(token('erp-inverse'), token('erp-primary')) >= 4.5, 'inverse primary-button label');
  assert.ok(contrast(token('erp-inverse'), '#344259') >= 4.5, 'inverse Hub module-tile label');
});

test('shared components explicitly protect inverse labels and secondary copy', () => {
  const css = read('css/erp-ui.css');
  assert.match(css, /\.mini-links a[\s\S]*color:\s*var\(--erp-text\)\s*!important/);
  assert.match(css, /\.mini-links a[\s\S]*background:\s*var\(--erp-surface\)\s*!important/);
  assert.match(css, /footer[\s\S]*color:\s*var\(--erp-muted\)\s*!important/);
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*3px solid #176b8c/);
  assert.match(css, /button:disabled[\s\S]*--erp-disabled-text/);
});

test('Phase 2 semantic tokens and component scales remain centralized', () => {
  const css = read('css/erp-ui.css');
  for (const token of [
    'erp-bg', 'erp-surface', 'erp-surface-subtle', 'erp-surface-raised',
    'erp-border', 'erp-border-strong', 'erp-text', 'erp-text-secondary',
    'erp-muted', 'erp-link', 'erp-primary', 'erp-primary-hover', 'erp-secondary',
    'erp-danger', 'erp-warning', 'erp-success', 'erp-info', 'erp-focus',
    'erp-disabled-text', 'erp-disabled-surface', 'erp-radius', 'erp-shadow',
    'erp-space-1', 'erp-space-6', 'erp-font-base', 'erp-line-height',
    'erp-control-height', 'erp-card-padding'
  ]) assert.match(css, new RegExp(`--${token}:`), token);

  assert.match(css, /body\.erp-ui\s*\{/);
  assert.match(css, /\[readonly\][\s\S]*--erp-surface-subtle/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width:\s*1024px\)/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /@media \(max-width:\s*420px\)/);
});

test('Phase 2 remains presentation-only and Finance remains shell-only', () => {
  const shared = read('css/erp-ui.css');
  assert.doesNotMatch(shared, /finance-pro|supabase|\.rpc\(|fetch\(|localStorage|sessionStorage/i);
  assert.doesNotMatch(read('finance-pro.html'), /css\/erp-ui\.css|js\/erp-ui\.js/);

  const shell = read('js/erp-ui.js');
  assert.match(shell, /document\.body\.prepend\(nav\);\s*document\.body\.prepend\(bar\);/);
  assert.match(shell, /data-erp-auth="top"/);
});

test('workflow adapters and command hooks remain outside the presentation layer', () => {
  const shared = read('css/erp-ui.css');
  assert.doesNotMatch(shared, /ready_to_print\s*\{|start_print|pass_qc|calculateQuoteTotals/);
  assert.match(read('production-control.html'), /data-workflow-command="start_print"/);
  assert.match(read('production-control.html'), /data-workflow-command="pass_qc"/);
  assert.match(read('orders-admin.html'), /orders-lifecycle-visual\.js/);
  assert.match(read('quote.html'), /erp-status\.js/);
});
