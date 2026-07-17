const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const core = read('js/erp-core.js');
assert.match(core, /version:\s*'1\.0'/, 'shared ERP core must expose version 1.0');
assert.match(core, /releaseLabel:\s*'OliPoly ERP 1\.0'/, 'shared ERP core must expose the release label');
assert.match(core, /ERP\.installReleaseIdentifier\(\)/, 'internal ERP pages must install the release identifier');

for (const page of ['hub.html', 'production-control.html', 'inventory-control.html', 'orders-admin.html', 'quote.html']) {
  const html = read(page);
  assert.match(html, /css\/erp-core\.css\?v=erp-1\.0/, `${page} must load the ERP 1.0 core styles`);
  assert.match(html, /js\/erp-core\.js\?v=erp-1\.0/, `${page} must load the ERP 1.0 core script`);
}

const handbook = read('erp-handbook.html');
assert.doesNotMatch(handbook, /Next:\s*Release Candidate/i, 'active handbook must not present ERP 1.0 as a release candidate');
assert.match(handbook, /OliPoly ERP 1\.0/, 'active handbook must identify the released version');

console.log('ERP 1.0 release labeling assertions passed.');
