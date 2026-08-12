const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const publicPages = [
  'index.html', 'collections.html', 'studio.html', 'creations.html',
  'collaboration.html', 'community.html', 'about.html', 'events.html',
  'faq.html', 'start-project.html', 'project-received.html',
  'quote-response.html', 'track.html', 'pay.html', 'legal.html',
  'fundraiser.html', 'niles.html'
];
const erpPages = [
  'hub.html', 'campaign-manager.html', 'customer-360.html', 'erp-handbook.html',
  'erp-knowledge-library.html', 'finance-pro.html', 'inventory-control.html',
  'orders-admin.html', 'product-recipes.html', 'production-control.html',
  'quote.html'
];
const retiredPages = [
  'showcase.html', 'real-solutions.html', 'branded-details.html',
  'eye-catching-work.html', 'finished-pieces.html', 'from-imagination.html',
  'designed-before-printing.html', 'raw-to-refined.html',
  'northeast-ohio-3d-printing.html', 'custom-3d-printing-aurora-ohio.html',
  'custom-3d-printing-chagrin-falls-ohio.html',
  'custom-3d-printing-hudson-ohio.html',
  'custom-3d-printing-niles-ohio.html', 'custom-3d-printing-solon-ohio.html',
  'custom-3d-printing-streetsboro-ohio.html',
  'custom-3d-printing-twinsburg-ohio.html'
];
const archivedHtml = [
  'archive/admin.html', 'archive/index2.html', 'archive/index3.html',
  'archive/quote-backup.html', 'archive/quote-lite-backup.html',
  'archive/quote-tool.html'
];

test('the authoritative public and ERP HTML surfaces remain present', () => {
  assert.equal(publicPages.length, 17);
  assert.equal(erpPages.length, 11);
  for (const file of [...publicPages, ...erpPages]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} must remain`);
  }
});

test('the active Niles campaign remains byte-for-byte frozen', () => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'niles.html'))).digest('hex');
  assert.equal(digest, 'e09e36606edb816d5d1e2f09c1390f7c1f517ccf5af2f788adbb2f3f0973a279');
});

test('every retired page is a noindex homepage redirect stub without obsolete content', () => {
  for (const file of retiredPages) {
    const html = read(file);
    assert.match(html, /http-equiv="refresh" content="0; url=\/"/i, file);
    assert.match(html, /name="robots" content="noindex, follow"/i, file);
    assert.match(html, /rel="canonical" href="https:\/\/olipoly3d\.com\/"/i, file);
    assert.match(html, /<a href="\/">Continue to the OliPoly homepage<\/a>/i, file);
    assert.ok(Buffer.byteLength(html) < 750, `${file} must not retain its former content`);
  }
});

test('the sitemap contains only current indexable public pages', () => {
  const sitemap = read('sitemap.xml');
  for (const file of retiredPages) assert.doesNotMatch(sitemap, new RegExp(file.replaceAll('.', '\\.') ,'i'), file);
  for (const file of erpPages) assert.doesNotMatch(sitemap, new RegExp(file.replaceAll('.', '\\.'), 'i'), file);
  for (const file of ['quote-response.html', 'project-received.html', 'track.html', 'pay.html', 'fundraiser.html', 'niles.html']) {
    assert.doesNotMatch(sitemap, new RegExp(file.replaceAll('.', '\\.'), 'i'), file);
  }
});

test('archived HTML and its proven-orphaned scripts are removed', () => {
  for (const file of [...archivedHtml, 'archive/quote-backup.js', 'archive/quote-lite-backup.js', 'archive/quote-tool.js']) {
    assert.ok(!fs.existsSync(path.join(root, file)), `${file} must be removed`);
  }
});

test('retained public pages do not link into retired branches', () => {
  for (const publicPage of publicPages) {
    const html = read(publicPage);
    for (const retiredPage of retiredPages) {
      assert.doesNotMatch(html, new RegExp(`(?:href|action)=["'][^"']*${retiredPage.replaceAll('.', '\\.')}[^"']*["']`, 'i'), `${publicPage} -> ${retiredPage}`);
    }
  }
});

test('customer task, campaign, tracking, quote, and payment contracts remain wired', () => {
  assert.ok(fs.existsSync(path.join(root, 'project-received.html')));
  assert.match(read('fundraiser.html'), /js\/fundraiser-intake\.js/);
  assert.match(read('js/fundraiser-intake.js'), /URLSearchParams\(location\.search\)\.get\('campaign'\)/);
  const quoteResponse = read('quote-response.html');
  assert.match(quoteResponse, /params\.get\('q'\)/);
  assert.match(quoteResponse, /params\.get\('token'\)/);
  assert.match(quoteResponse, /get_quote_public/);
  assert.match(quoteResponse, /respond_to_quote_public/);
  for (const file of ['track.html', 'pay.html']) {
    assert.match(read(file), /public_order_tracking_lookup/, file);
    assert.match(read(file), /URLSearchParams/, file);
  }
  const paymentSurfaces = `${read('pay.html')} ${read('track.html')} ${quoteResponse}`;
  for (const provider of ['Stripe', 'PayPal', 'Venmo']) assert.match(paymentSurfaces, new RegExp(provider, 'i'), provider);
});

test('transactional pages are noindex and all ERP pages are disallowed', () => {
  for (const file of ['quote-response.html', 'project-received.html', 'track.html', 'pay.html', 'fundraiser.html']) {
    assert.match(read(file), /<meta(?=[^>]*name=["']robots["'])(?=[^>]*content=["']noindex, follow["'])[^>]*>/i, file);
  }
  const robots = read('robots.txt');
  for (const file of erpPages) assert.match(robots, new RegExp(`Disallow: /${file.replaceAll('.', '\\.')}`), file);
  for (const file of retiredPages) assert.doesNotMatch(robots, new RegExp(file.replaceAll('.', '\\.')), file);
});
