const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'ENGINE_RC2_1_STORAGE_CAMPAIGN_AUTHORITY.md');
assert.ok(fs.existsSync(reportPath), 'RC2.1 investigation document must exist');
const report = fs.readFileSync(reportPath, 'utf8');

const requiredSections = [
  'Executive summary', 'Investigation scope', 'Confirmed current architecture',
  'Storage implementation inventory', 'Bucket/path map', 'Job Assets authority',
  'Quote-to-order file handoff', 'Product Recipe file handling', 'Campaign asset handling',
  'Storage security findings', 'Storage lifecycle decision matrix', 'Campaign data-model inventory',
  'Public campaign flow', 'Campaign-to-order findings', 'Campaign-product authority',
  'Campaign-to-production findings', 'Campaign-to-Finance findings',
  'Campaign-to-Customer-360 findings', 'Niles classification',
  'Campaign authority decision matrix', 'Required owner decisions',
  'Recommended implementation sequence', 'Explicitly deferred work', 'Source references',
  'Validation performed'
];
for (const section of requiredSections) {
  assert.match(report, new RegExp(`^## \\d+\\. ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `missing section: ${section}`);
}

const sourceBlock = report.split('## 24. Source references')[1]?.split('## 25. Validation performed')[0] || '';
const sourceReferences = [...sourceBlock.matchAll(/`([^`]+)`/g)].map(match => match[1]);
assert.ok(sourceReferences.length >= 30, 'report should provide a useful repository source inventory');
for (const reference of sourceReferences) {
  assert.ok(fs.existsSync(path.join(root, reference)), `source reference does not exist: ${reference}`);
}

for (const privatePage of ['orders-admin.html', 'production-control.html', 'product-recipes.html', 'customer-360.html', 'campaign-manager.html', 'finance-pro.html', 'hub.html']) {
  assert.ok(fs.existsSync(path.join(root, privatePage)), `referenced private page is missing: ${privatePage}`);
}

const changed = execFileSync('git', ['diff', '--name-only', '749c560^', '749c560', '--'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const allowed = new Set([
  'ENGINE_RC2_1_STORAGE_CAMPAIGN_AUTHORITY.md',
  'ENGINE_RC2_ARCHITECTURE.md',
  'erp-knowledge-library.html',
  'tests/engine-rc2-1-authority-investigation.test.js'
]);
assert.deepStrictEqual(changed.filter(file => !allowed.has(file)), [], 'RC2.1 may change only investigation documentation and its focused test');
assert.ok(!changed.some(file => /^(fundraiser|niles|quote-response|track|pay)\.html$/.test(file)), 'no public page may change');
assert.ok(!changed.some(file => /^supabase\/migrations\//.test(file) || /\.sql$/i.test(file)), 'no migration, RPC, policy, or trigger SQL may change');
assert.ok(!changed.some(file => /^(js\/|quote\.js$|finance-pro\.js$)/.test(file)), 'no business-logic JavaScript may change');

const architecture = fs.readFileSync(path.join(root, 'ENGINE_RC2_ARCHITECTURE.md'), 'utf8');
const knowledge = fs.readFileSync(path.join(root, 'erp-knowledge-library.html'), 'utf8');
assert.match(architecture, /ENGINE_RC2_1_STORAGE_CAMPAIGN_AUTHORITY\.md/);
assert.match(knowledge, /ENGINE_RC2_1_STORAGE_CAMPAIGN_AUTHORITY\.md/);

const forbidden = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bservice[_-]?role\b\s*[:=]\s*["'][A-Za-z0-9._-]+/i,
  /\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._-]+/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bsb_(?:secret|service_role)_[A-Za-z0-9_-]+\b/i,
  /https?:\/\/(?:square\.link|tally\.so)\/[^\s)`]+/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/
];
for (const pattern of forbidden) assert.doesNotMatch(report, pattern, `sensitive or customer-specific content matched ${pattern}`);

console.log('Engine RC2.1 authority investigation static contract passed.');
