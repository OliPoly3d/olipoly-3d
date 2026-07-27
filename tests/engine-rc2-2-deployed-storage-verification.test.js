const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const reportName = 'ENGINE_RC2_2_DEPLOYED_STORAGE_VERIFICATION.md';
const report = fs.readFileSync(path.join(root, reportName), 'utf8');
const sections = ['Executive summary', 'Repository-expected state', 'Deployed verified state', 'Exact drift', 'Security impact', 'Functional impact', 'MIME and size review', 'Required correction and continuation gate', 'Blocked verification', 'Sanitized queries used', 'Environment limitations', 'Actions not performed', 'Evidence and documentation links'];
for (const section of sections) assert.ok(report.includes(section), `missing section: ${section}`);
assert.match(report, /RC2\.3 must not begin/i);
assert.match(report, /live access is unavailable/i);
assert.doesNotMatch(report, /^\s*(?:insert|update|delete|alter|create|drop|truncate|grant|revoke)\s+/gim, 'mutation statement found');

const forbidden = [/-----BEGIN .*PRIVATE KEY-----/i, /\bauthorization\s*:\s*bearer\s+\S+/i, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, /\bsb_(?:publishable|anon|secret|service_role)_[A-Za-z0-9_-]+\b/i, /https?:\/\/(?:square\.link|tally\.so)\/\S+/i, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/];
for (const pattern of forbidden) assert.doesNotMatch(report, pattern, `sensitive content matched ${pattern}`);

for (const reference of [...report.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1])) {
  assert.ok(!reference.includes('://'), `external link not allowed: ${reference}`);
  assert.ok(fs.existsSync(path.join(root, reference)), `link does not resolve: ${reference}`);
}
for (const file of ['ENGINE_RC2_ARCHITECTURE.md', 'ENGINE_RC2_1_STORAGE_CAMPAIGN_AUTHORITY.md', 'erp-knowledge-library.html']) assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /ENGINE_RC2_2_DEPLOYED_STORAGE_VERIFICATION\.md/);

const verificationCommit = 'f135a4b';
const changed = execFileSync('git', ['diff', '--name-only', '2f3c932', verificationCommit, '--'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const allowed = new Set([reportName, 'ENGINE_RC2_ARCHITECTURE.md', 'ENGINE_RC2_1_STORAGE_CAMPAIGN_AUTHORITY.md', 'erp-knowledge-library.html', 'tests/engine-rc2-2-deployed-storage-verification.test.js']);
assert.deepStrictEqual(changed.filter(file => !allowed.has(file)), []);
assert.ok(!changed.some(file => /^supabase\/migrations\/|\.sql$/i.test(file)), 'migration changed');
assert.ok(!changed.some(file => /^(?:js\/|assets\/js\/)/.test(file) || (/\.html$/i.test(file) && file !== 'erp-knowledge-library.html')), 'runtime or public page changed');
console.log('Engine RC2.2 deployed storage verification contract passed.');
