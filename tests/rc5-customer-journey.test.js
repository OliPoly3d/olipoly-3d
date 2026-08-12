const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = `quote-response.html project-received.html fundraiser.html niles.html`.split(' ');

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert.match(html, /assets\/css\/rc5-legacy-frame\.css/, `${page} loads the shared RC5 bridge`);
  assert.match(html, /assets\/js\/rc5-legacy-frame\.js/, `${page} loads shared navigation and footer behavior`);
}

const response = fs.readFileSync(path.join(root, 'quote-response.html'), 'utf8');
for (const hook of ['acceptBtn', 'responseMessage', 'responseStatus']) assert.match(response, new RegExp(`id=["']${hook}["']`), `quote response preserves #${hook}`);

const frameCss = fs.readFileSync(path.join(root, 'assets/css/rc5-legacy-frame.css'), 'utf8');
assert.match(frameCss, /\.rc5-skip-link\{[^}]*position:absolute!important[^}]*clip-path:inset\(50%\)!important[^}]*transform:translateY\(-200%\)!important/s, 'skip link is out of view and out of document flow at rest');
assert.match(frameCss, /\.rc5-skip-link:focus[^}]*\{[^}]*clip-path:none!important[^}]*transform:translateY\(0\)!important/s, 'focused skip link is visible');
assert.doesNotMatch(frameCss, /\.rc5-skip-link[^}]*\b(?:display:none|visibility:hidden)\b/s, 'skip link remains available to keyboards and assistive technology');

const frameJs = fs.readFileSync(path.join(root, 'assets/js/rc5-legacy-frame.js'), 'utf8');
assert.equal((frameJs.match(/<header class="rc5-frame-header">/g) || []).length, 1, 'shared frame defines one global header');
assert.equal((frameJs.match(/<footer class="rc5-frame-footer">/g) || []).length, 1, 'shared frame defines one support footer');
assert.equal((frameJs.match(/<nav>/g) || []).length, 1, 'shared frame defines one global navigation');
assert.match(frameJs, /skipLink\.setAttribute\('href', `#\$\{main\.id\}`\)/, 'skip link targets each page main element');

const niles = fs.readFileSync(path.join(root, 'niles.html'), 'utf8');
assert.doesNotMatch(niles, /<header class="wrap topbar">/, 'Niles redundant campaign header is removed');
assert.doesNotMatch(niles, /<nav class="nav" aria-label="OliPoly links">/, 'Niles redundant campaign navigation is removed');
assert.doesNotMatch(niles, /<footer class="wrap">/, 'Niles uses only the shared support footer');

const projectReceived = fs.readFileSync(path.join(root, 'project-received.html'), 'utf8');
assert.doesNotMatch(projectReceived, /Custom printing • Creative builds • Prototypes/i, 'Project Received omits the internal legacy tagline');
assert.doesNotMatch(projectReceived, /<a[^>]*class="brand"[^>]*>[\s\S]*?Project Received/i, 'Project Received omits the internal legacy brand row');

const loadingPanel = response.match(/<section class="card hero-card" id="loadingCard">([\s\S]*?)<\/section>/)?.[1] || '';
assert.doesNotMatch(loadingPanel, /poly-head|mascot/i, 'quote loading state has no mascot artwork');
assert.match(loadingPanel, /quote details from OliPoly\./, 'quote loading state uses the customer-facing OliPoly name');
assert.doesNotMatch(loadingPanel, /OliPoly 3D/, 'quote loading state does not use the legacy customer-facing name');

const theme = fs.readFileSync(path.join(root, 'js/document-theme.js'), 'utf8');
assert.match(theme, /Thoughtful Design for Real Life/);
assert.doesNotMatch(theme, /Custom 3D Printing • Creative Builds • Prototypes|radial-gradient/);

const quotePage = fs.readFileSync(path.join(root, 'quote.html'), 'utf8');
assert.match(quotePage, /<script src="quote\.js\?v=/, 'quote.html continues to load root quote.js');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'quote.js'), 'utf8'), /Custom 3D Printing • Creative Builds • Prototypes/);
assert.doesNotMatch(fs.readFileSync(path.join(root, 'orders-admin.html'), 'utf8'), /Custom 3D Printing • Creative Builds • Prototypes/);

console.log('RC5 customer journey framing, hooks, and document branding assertions passed');
