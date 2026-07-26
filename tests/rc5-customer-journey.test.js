const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = `quote-response.html project-received.html northeast-ohio-3d-printing.html custom-3d-printing-aurora-ohio.html custom-3d-printing-niles-ohio.html custom-3d-printing-hudson-ohio.html custom-3d-printing-twinsburg-ohio.html custom-3d-printing-streetsboro-ohio.html custom-3d-printing-solon-ohio.html custom-3d-printing-chagrin-falls-ohio.html showcase.html branded-details.html eye-catching-work.html finished-pieces.html from-imagination.html designed-before-printing.html raw-to-refined.html real-solutions.html fundraiser.html niles.html`.split(' ');

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert.match(html, /assets\/css\/rc5-legacy-frame\.css/, `${page} loads the shared RC5 bridge`);
  assert.match(html, /assets\/js\/rc5-legacy-frame\.js/, `${page} loads shared navigation and footer behavior`);
}

const response = fs.readFileSync(path.join(root, 'quote-response.html'), 'utf8');
for (const hook of ['acceptBtn', 'responseMessage', 'responseStatus']) assert.match(response, new RegExp(`id=["']${hook}["']`), `quote response preserves #${hook}`);

const theme = fs.readFileSync(path.join(root, 'js/document-theme.js'), 'utf8');
assert.match(theme, /Thoughtful Design for Real Life/);
assert.doesNotMatch(theme, /Custom 3D Printing • Creative Builds • Prototypes|radial-gradient/);

const quotePage = fs.readFileSync(path.join(root, 'quote.html'), 'utf8');
assert.match(quotePage, /<script src="quote\.js\?v=/, 'quote.html continues to load root quote.js');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'quote.js'), 'utf8'), /Custom 3D Printing • Creative Builds • Prototypes/);
assert.doesNotMatch(fs.readFileSync(path.join(root, 'orders-admin.html'), 'utf8'), /Custom 3D Printing • Creative Builds • Prototypes/);

console.log('RC5 customer journey framing, hooks, and document branding assertions passed');
