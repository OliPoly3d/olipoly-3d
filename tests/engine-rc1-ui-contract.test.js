const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const baseline = require('./fixtures/engine-rc1-ui-contract.json');
const uniq = values => [...new Set(values)].sort();
const matches = (source, expression, format = match => match[1]) =>
  uniq([...source.matchAll(expression)].map(format).filter(Boolean));

function inventory(source) {
  return {
    ids: matches(source, /\bid\s*=\s*["']([^"']+)["']/gi),
    controls: matches(source, /<(input|select|textarea|button)\b[^>]*>/gi, match => {
      const tagSource = match[0];
      const tag = match[1].toLowerCase();
      const name = (tagSource.match(/\bname\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
      const type = (tagSource.match(/\btype\s*=\s*["']([^"']*)["']/i) || [])[1] || (tag === 'input' ? 'text' : '');
      return `${tag}|${name}|${type}`;
    }),
    inputNames: matches(source, /<(?:input|select|textarea)\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi),
    inputTypes: matches(source, /<input\b[^>]*\btype\s*=\s*["']([^"']+)["']/gi),
    buttonIds: matches(source, /<button\b[^>]*\bid\s*=\s*["']([^"']+)["']/gi),
    links: matches(source, /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi),
    tableIds: matches(source, /<table\b[^>]*\bid\s*=\s*["']([^"']+)["']/gi),
    dialogIds: matches(source, /<(?:dialog|[^>]+\b(?:class|role)\s*=\s*["'][^"']*(?:modal|dialog)[^"']*["'])[^>]*\bid\s*=\s*["']([^"']+)["']/gi),
    dataHooks: matches(source, /\b(data-[\w-]+)(?:\s*=\s*["']([^"']*)["'])?/gi, match => `${match[1].toLowerCase()}=${match[2] || ''}`),
    scripts: matches(source, /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi),
    stylesheets: matches(source, /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']([^"']+)["']/gi),
    inlineHandlers: matches(source, /\b(on(?:click|change|input|submit|keydown|keyup|load))\s*=\s*["']([^"']*)["']/gi, match => `${match[1].toLowerCase()}=${match[2]}`),
    formActions: matches(source, /<form\b[^>]*\baction\s*=\s*["']([^"']*)["']/gi),
    rpcStrings: matches(source, /\.rpc\s*\(\s*["'`]([^"'`]+)["'`]/g),
    supabaseEndpoints: matches(source, /https:\/\/[^\s"'`]+\.supabase\.co[^\s"'`]*/g, match => match[0]),
    localStorageKeys: matches(source, /localStorage\.(?:getItem|setItem|removeItem)\s*\(\s*["'`]([^"'`]+)["'`]/g),
    printTargets: matches(source, /(?:getElementById|querySelector)\s*\(\s*["'`]([^"'`]*(?:print|label|traveler)[^"'`]*)["'`]\s*\)/gi)
  };
}

for (const [page, expected] of Object.entries(baseline.pages)) {
  test(`${page} preserves the pre-Engine functional UI contract`, () => {
    const source = fs.readFileSync(page, 'utf8');
    const actual = inventory(source);
    for (const [key, expectedValues] of Object.entries(expected)) {
      if (key === 'bodyClasses') continue;
      assert.deepEqual(actual[key].filter(value => expectedValues.includes(value)), expectedValues, `${page}: changed ${key}`);
    }
    assert.match(source, /<body\b[^>]*\bclass=["'][^"']*\bop-engine\b/i);
    assert.match(source, /<link\b[^>]*href=["']assets\/css\/engine-rc1\.css\?v=rc1["']/i);
  });
}

test('Engine stylesheet is strictly namespaced and isolated from generated documents', () => {
  const css = fs.readFileSync('assets/css/engine-rc1.css', 'utf8');
  assert.match(css, /^@media screen \{/m, 'Engine presentation must be screen-only');
  assert.match(css, /\.op-engine\s*\{/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /@media print/, 'Engine must not participate in authoritative print output');
  for (const selector of ['.card', '.panel', '.header', '.page']) {
    const unsafe = new RegExp(`(^|})\\s*\\${selector.replace('.', '.')}\\s*[{,]`, 'm');
    assert.doesNotMatch(css, unsafe, `generic ${selector} selector escaped the Engine namespace`);
  }
  for (const publicPage of ['index.html', 'collections.html', 'studio.html', 'fundraiser.html', 'niles.html']) {
    assert.doesNotMatch(fs.readFileSync(publicPage, 'utf8'), /engine-rc1|op-engine/);
  }
});

test('high-risk workflow implementation references remain available', () => {
  const required = {
    'orders-admin.html': [/ordinarySave|saveOrder|updateOrder/i, /invoice/i, /job.?assets/i],
    'quote.html': [/calculateQuoteTotals/, /quote\.js/, /save/i, /accept/i],
    'production-control.html': [/production_workflow_command/, /linkedWorkflowInFlight/, /complete|qc/i],
    'inventory-control.html': [/recover|recovery/i, /export/i, /inventory/i],
    'finance-pro.html': [/finance/i, /expense|payment/i],
    'campaign-manager.html': [/campaign/i, /save/i],
    'customer-360.html': [/customer-360\.js/, /customer/i]
  };
  for (const [page, expressions] of Object.entries(required)) {
    const source = fs.readFileSync(page, 'utf8');
    const relatedScripts = inventory(source).scripts
      .map(reference => reference.replace(/[?#].*$/, ''))
      .filter(reference => !/^https?:/.test(reference) && fs.existsSync(reference))
      .map(reference => fs.readFileSync(reference, 'utf8'));
    const runtimeSource = [source, ...relatedScripts].join('\n');
    for (const expression of expressions) assert.match(runtimeSource, expression, `${page}: missing ${expression}`);
  }
});

test('Engine stylesheet follows every legacy presentation source', () => {
  for (const page of Object.keys(baseline.pages)) {
    const source = fs.readFileSync(page, 'utf8').split(/<\/head>/i)[0];
    const engineIndex = source.search(/<link\b[^>]*href=["']assets\/css\/engine-rc1\.css\?v=rc1["']/i);
    assert.notEqual(engineIndex, -1, `${page}: missing Engine stylesheet`);
    for (const match of source.matchAll(/<(?:style\b|link\b[^>]*rel=["']stylesheet["'])[^>]*>/gi)) {
      if (!/engine-rc1\.css/i.test(match[0])) {
        assert.ok(match.index < engineIndex, `${page}: legacy style appears after Engine stylesheet: ${match[0]}`);
      }
    }
  }
});

test('Engine bridges legacy variables and removes legacy visual effects authoritatively', () => {
  const css = fs.readFileSync('assets/css/engine-rc1.css', 'utf8');
  for (const variable of ['bg', 'bg2', 'panel', 'panel2', 'text', 'muted', 'line', 'line2', 'accent', 'accent2', 'shadow']) {
    assert.match(css, new RegExp(`body\\.op-engine[\\s\\S]*?--${variable}\\s*:`), `missing legacy --${variable} bridge`);
  }
  assert.match(css, /body\.op-engine\s*\{[\s\S]*?background-image:\s*none/);
  assert.match(css, /body\.op-engine \.glow[\s\S]*?box-shadow:\s*none/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i, 'Engine layer must not introduce application gradients');
});

test('real page selectors receive authoritative Engine coverage', () => {
  const css = fs.readFileSync('assets/css/engine-rc1.css', 'utf8');
  const selectorMap = {
    'hub.html': ['.mobile-nav', '.tool-card', '.pulse-tile', '.activity-item'],
    'orders-admin.html': ['.order-row', '.catalog-panel', '.status-pill', '.email-preview-dialog'],
    'quote.html': ['.production-snapshot-card', '.advanced-panel', '.send-package-card', '.email-preview-backdrop'],
    'production-control.html': ['.lane', '.job-card', '.capacity-card', '.modal-dialog'],
    'inventory-control.html': ['.inventory-card', '.forecast-card', '.material-balance-card', '.decision-pill'],
    'finance-pro.html': ['.summary-card', '.table-card', '.settings-card', '.login-card'],
    'customer-360.html': ['.overview-head', '.timeline .item', '.pill', '.business'],
    'product-recipes.html': ['.table-wrap', '.panel', '.modal-body', '.notice'],
    'campaign-manager.html': ['.product', '.list', '.products', '.notice'],
    'erp-handbook.html': ['.toc', '.flow-row', '.branch', '.step'],
    'erp-knowledge-library.html': ['.article', '.filters', '.search', '.chip']
  };
  for (const [page, selectors] of Object.entries(selectorMap)) {
    const source = fs.readFileSync(page, 'utf8');
    for (const selector of selectors) {
      const classNames = [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
      assert.ok(classNames.every(className => new RegExp(`class=["'][^"']*\\b${className}\\b`, 'i').test(source)), `${page}: mapped selector ${selector} does not match page markup`);
      assert.match(css, new RegExp(`body\\.op-engine[^,{]*${selector.replaceAll('.', '\\.')}[^,{]*[,{]`), `${page}: ${selector} lacks scoped Engine coverage`);
    }
  }
});

test('core component rules use specificity above legacy generic selectors', () => {
  const css = fs.readFileSync('assets/css/engine-rc1.css', 'utf8');
  for (const selector of ['.topbar', '.card', '.panel', '.btn', '.hero h2', 'input', 'select', 'textarea', 'table', 'th', '.modal-dialog']) {
    const escaped = selector.replaceAll('.', '\\.').replaceAll(' ', '\\s+');
    assert.match(css, new RegExp(`body\\.op-engine\\s+${escaped}`), `missing authoritative selector body.op-engine ${selector}`);
  }
  assert.doesNotMatch(css, /\.op-engine\s+:where\(/, 'zero-specificity :where() must not drive Engine presentation');
});
