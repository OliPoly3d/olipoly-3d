const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const privatePages = ['hub.html','orders-admin.html','quote.html','production-control.html','inventory-control.html','finance-pro.html','customer-360.html','product-recipes.html','campaign-manager.html','erp-handbook.html','erp-knowledge-library.html'];
const publicPages = ['index.html','collections.html','studio.html','creations.html','collaboration.html','community.html','about.html','faq.html','legal.html','pay.html','track.html','events.html','start-project.html','project-received.html','quote-response.html','fundraiser.html','niles.html'];
const destinations = ['hub.html','customer-360.html','quote.html','orders-admin.html','production-control.html','inventory-control.html','product-recipes.html','campaign-manager.html','finance-pro.html','erp-handbook.html','erp-knowledge-library.html'];

test('all and only private Engine pages load the RC2 shell', () => {
  for (const page of privatePages) {
    const source = fs.readFileSync(page, 'utf8');
    assert.match(source, /<body\b[^>]*\bop-engine\b/i, page);
    assert.match(source, /<script defer src="js\/engine-shell\.js\?v=rc2"><\/script>/, page);
  }
  for (const page of publicPages) assert.doesNotMatch(fs.readFileSync(page, 'utf8'), /engine-shell\.js|engine-nav|engine-page-intro/, page);
});

test('shell has consistent destinations, current-page state, context, and help', () => {
  const source = fs.readFileSync('js/engine-shell.js', 'utf8');
  for (const destination of destinations) assert.match(source, new RegExp(destination.replace('.', '\\.')), destination);
  assert.match(source, /aria-current="page"/);
  assert.match(source, /new URLSearchParams\(location\.search\)/);
  for (const parameter of ['customer','search','quote','order','job','recipe','campaign']) assert.match(source, new RegExp(`['"]${parameter}['"]`));
  assert.match(source, /erp-handbook\.html/);
});

test('shell styles are private, screen-only, responsive, and tokenized', () => {
  const css = fs.readFileSync('assets/css/engine-rc1.css', 'utf8');
  assert.match(css, /^@media screen \{/m);
  for (const selector of ['engine-nav','engine-page-intro','engine-context']) assert.match(css, new RegExp(`body\\.op-engine \\.${selector}`));
  for (const token of ['--op-container: 1440px','--op-reading-container: 860px','--op-page-gutter: clamp']) assert.match(css, new RegExp(token.replace(/[()]/g, '\\$&')));
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*engine-page-intro/);
  assert.doesNotMatch(css, /@media print/);
});

test('RC2 documentation links resolve and separates operator from maintainer guidance', () => {
  const handbook = fs.readFileSync('erp-handbook.html', 'utf8');
  const knowledge = fs.readFileSync('erp-knowledge-library.html', 'utf8');
  assert.match(handbook, /id="operating-path"/);
  assert.match(knowledge, /ENGINE_RC2_ARCHITECTURE\.md/);
  assert.ok(fs.existsSync('ENGINE_RC2_ARCHITECTURE.md'));
  for (const href of [...handbook.matchAll(/href="([^"#]+\.html)(?:#[^"]*)?"/g)].map(match => match[1])) assert.ok(fs.existsSync(href), href);
});
