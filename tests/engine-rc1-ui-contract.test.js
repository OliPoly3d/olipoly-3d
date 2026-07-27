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

const internalPages = Object.keys(baseline.pages);

test('internal shells use text identity without mascot or decorative emoji', () => {
  const decorativeEmoji = /[\u{1F000}-\u{1FAFF}]/u;
  for (const page of internalPages) {
    const source = fs.readFileSync(page, 'utf8');
    const shell = (source.match(/<(?:header\b[^>]*|div\b[^>]*class=["'][^"']*topbar[^"']*["'][^>]*)>[\s\S]*?<\/(?:header|div)>/i) || [''])[0];
    assert.doesNotMatch(source, decorativeEmoji, `${page}: static interface contains decorative emoji`);
    assert.doesNotMatch(source, /\b(?:bee|mascot)\b/i, `${page}: mascot reference remains`);
    assert.doesNotMatch(shell, /OliPoly\s+3D|OliPoly\s+OS/i, `${page}: promotional branding remains in application shell`);
  }
});

test('Engine layer explicitly restrains legacy decoration and card motion', () => {
  const css = fs.readFileSync('assets/css/engine-rc1.css', 'utf8');
  assert.match(css, /RC1\.3 — dark editorial presentation/);
  assert.match(css, /body\.op-engine \.brand-mark[\s\S]*?display:\s*none/);
  assert.match(css, /body\.op-engine \.quick-card[\s\S]*?border-radius:\s*0/);
  assert.match(css, /body\.op-engine \.summary-grid[\s\S]*?border-block:\s*1px solid/);
  assert.match(css, /body\.op-engine \.card:hover[\s\S]*?transform:\s*none/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i);
  assert.match(css, /body\.op-engine::before[\s\S]*?content:\s*none[\s\S]*?filter:\s*none/);
  assert.match(css, /body\.op-engine \.finance-summary-card::before[\s\S]*?content:\s*none/);
});

test('RC1.3 overrides high-risk inline application chrome without styling generated documents', () => {
  const css = fs.readFileSync('assets/css/engine-rc1.css', 'utf8');
  for (const selector of [
    '#responsesList > div[style*="color"]',
    '#opLabelOptionsModal > div',
    '#opLabelOptionsModal [style*="color:#a8b5db"]',
    '.email-preview-actions .btn-ghost',
    '.email-preview-actions button:disabled'
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(css, new RegExp(`body\\.op-engine ${escaped}`), `missing scoped inline override for ${selector}`);
  }
  assert.match(css, /body\.op-engine \.compact-metrics \.metric:nth-child\(6\)[\s\S]*?opacity:\s*1/);
  assert.doesNotMatch(css, /(?:\.pdf-sheet|\.op-print-toolbar|\.pdf-|\.invoice-document)[^{]*\{/i,
    'Engine must not target generated customer or print document selectors');
});

test('RC1.3 defines a compact dark palette and explicit readable component states', () => {
  const css = fs.readFileSync('assets/css/engine-rc1.css', 'utf8');
  const requiredTokens = {
    canvas: '#11100f',
    surface: '#191817',
    'surface-raised': '#22201f',
    'surface-muted': '#292725',
    ink: '#f5f2ed',
    'ink-strong': '#ffffff',
    muted: '#c4bdb5',
    'muted-quiet': '#aaa29b',
    border: '#3b3835',
    'border-strong': '#716a64',
    accent: '#df6b9d',
    success: '#84c9a6',
    warning: '#e5bd70',
    danger: '#e28b8b',
    info: '#94b8db'
  };
  for (const [token, value] of Object.entries(requiredTokens)) {
    assert.match(css, new RegExp(`--op-${token}:\\s*${value}`, 'i'), `missing dark token --op-${token}`);
  }
  for (const selector of [
    'input::placeholder', 'input:read-only', 'input:disabled', 'button:disabled',
    'button:active', 'tbody tr.selected', '[aria-selected="true"]', '[role="menu"]',
    '[role="tooltip"]', '.modal-dialog', '.notice', '.status-success'
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('button:active', 'button:active[^,{]*');
    assert.match(css, new RegExp(`body\\.op-engine[^,{]*${escaped}`), `missing explicit dark treatment for ${selector}`);
  }
  assert.match(css, /color-scheme:\s*dark/);
  assert.doesNotMatch(css, /filter:\s*invert\s*\(/i);
});

test('RC1.3 representative foreground and control-boundary pairs meet WCAG targets', () => {
  const luminance = hex => {
    const channels = hex.match(/[a-f\d]{2}/gi).map(channel => parseInt(channel, 16) / 255)
      .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + .05) / (values[1] + .05);
  };
  const textPairs = [
    ['#f5f2ed', '#11100f'], ['#c4bdb5', '#11100f'], ['#aaa29b', '#11100f'],
    ['#ffffff', '#22201f'], ['#aaa29b', '#22201f'], ['#df6b9d', '#3a202c'],
    ['#84c9a6', '#183126'], ['#e5bd70', '#352b18'], ['#e28b8b', '#3a2020'],
    ['#94b8db', '#1d2a37']
  ];
  for (const [foreground, background] of textPairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} falls below 4.5:1`);
  }
  assert.ok(contrast('#716a64', '#22201f') >= 3, 'control border falls below 3:1 against its field surface');
});

test('in-scope pages have unique static IDs and resolvable local presentation/runtime references', () => {
  for (const page of internalPages) {
    const source = fs.readFileSync(page, 'utf8');
    const staticIds = [...source.matchAll(/\bid\s*=\s*["']([^"'${}]+)["']/gi)].map(match => match[1]);
    const duplicates = uniq(staticIds.filter((id, index) => staticIds.indexOf(id) !== index));
    const legacyGeneratedDocumentIds = page === 'quote.html' ? ['pdfBalance', 'pdfDeposit', 'pdfSubtotal', 'pdfTax', 'pdfTotal'] : [];
    assert.deepEqual(duplicates, legacyGeneratedDocumentIds, `${page}: duplicate static ID introduced`);
    const references = [
      ...source.matchAll(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi),
    ].map(match => match[1].replace(/[?#].*$/, '')).filter(reference => reference && !/^(?:https?:|data:|#|mailto:)/.test(reference));
    for (const reference of references) assert.ok(fs.existsSync(reference), `${page}: unresolved local reference ${reference}`);
  }
});
