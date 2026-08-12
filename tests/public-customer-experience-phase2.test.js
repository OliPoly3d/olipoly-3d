const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html','collections.html','studio.html','creations.html','collaboration.html','community.html','about.html','events.html','faq.html','start-project.html','project-received.html','quote-response.html','track.html','pay.html','legal.html','fundraiser.html','niles.html'];

test('Phase 2 retained public authority and Niles freeze remain intact', () => {
  for (const page of pages) assert.ok(fs.existsSync(path.join(root, page)), page);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'niles.html'))).digest('hex');
  assert.equal(hash, 'e09e36606edb816d5d1e2f09c1390f7c1f517ccf5af2f788adbb2f3f0973a279');
  assert.match(read('start-project.html'), /https:\/\/tally\.so\/r\/xX4vJk/);
  assert.ok(fs.existsSync(path.join(root, 'project-received.html')));
});

test('customer task and payment functional hooks remain intact', () => {
  const quote = read('quote-response.html');
  for (const hook of [/params\.get\('q'\)/, /params\.get\('token'\)/, /get_quote_public/, /respond_to_quote_public/, /id="acceptBtn"/, /id="declineBtn"/, /respond\('accepted'\)/, /respond\('declined'\)/]) assert.match(quote, hook);
  for (const page of ['track.html','pay.html']) {
    assert.match(read(page), /public_order_tracking_lookup/, page);
    assert.match(read(page), /URLSearchParams/, page);
  }
  const payments = `${read('track.html')} ${read('pay.html')} ${quote}`;
  for (const provider of ['Stripe','PayPal','Venmo']) assert.match(payments, new RegExp(provider, 'i'));
  assert.match(read('js/fundraiser-intake.js'), /rpc\('get_public_campaign'/);
  assert.match(read('js/fundraiser-intake.js'), /rpc\('submit_campaign_submission'/);
});

test('each major page states its distinct customer authority without fabricated catalog claims', () => {
  assert.match(read('index.html'), /Custom 3D printing &amp; design · Aurora, Ohio/i);
  const collections = read('collections.html');
  assert.match(collections, /Original designs are in the works/i);
  assert.match(collections, /no public catalog or store/i);
  assert.doesNotMatch(collections, /Five ways an idea can live/i);
  assert.match(read('studio.html'), /Selected OliPoly work/i);
  assert.match(read('creations.html'), /Custom Creations[\s\S]*unfinished/i);
  assert.match(read('collaboration.html'), /For Business &amp; Organizations/i);
  assert.match(read('community.html'), /Schools, Teams &amp; Fundraisers/i);
});

test('customer policy language remains accurate and non-absolute', () => {
  const journey = ['index.html','creations.html','collaboration.html','community.html','start-project.html','faq.html','project-received.html','pay.html'].map(read).join('\n');
  assert.match(journey, /typically[^.]*1–2 business days/i);
  assert.match(journey, /approximately 1–2 weeks after quote approval/i);
  assert.match(journey, /size[^.]*material[^.]*print time[^.]*quantity/i);
  assert.match(journey, /Pickup[^.]*Aurora[^.]*shipping[^.]*United States[^.]*limited local delivery/i);
  assert.doesNotMatch(journey, /\b\d+% deposit\b/i);
  assert.doesNotMatch(journey, /minimum (?:order|project) (?:of|is) \$/i);
  assert.match(read('pay.html'), /enter the exact displayed order amount or balance/i);
  assert.match(read('pay.html'), /accepted quote or order[^<]*establishes what you owe/i);
});

test('retired public branches and protected operational surfaces are not reintroduced by Phase 2 content', () => {
  const current = pages.map(read).join('\n');
  for (const retired of ['showcase.html','real-solutions.html','northeast-ohio-3d-printing.html']) assert.doesNotMatch(current, new RegExp(`href=["'][^"']*${retired}`, 'i'));
  for (const protectedFile of ['finance-pro.html','production-control.html','orders-admin.html','inventory-control.html']) assert.ok(fs.existsSync(path.join(root, protectedFile)));
});
