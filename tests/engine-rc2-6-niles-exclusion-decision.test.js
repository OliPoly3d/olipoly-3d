const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const baseline = '6d7a676';
const read = file => fs.readFileSync(file, 'utf8');
const fromBaseline = file => execFileSync('git', ['show', `${baseline}:${file}`]);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const decision = read('ENGINE_RC2_6_NILES_MIGRATION_DECISION.md');
const rc24 = read('ENGINE_RC2_4_CAMPAIGN_SUBMISSION_AUTHORITY.md');
const rc25 = read('ENGINE_RC2_5_CAMPAIGN_ORDER_CONVERSION.md');

const allowed = new Set([
  'ENGINE_RC2_6_NILES_MIGRATION_DECISION.md',
  'ENGINE_RC2_ARCHITECTURE.md',
  'ENGINE_RC2_4_CAMPAIGN_SUBMISSION_AUTHORITY.md',
  'ENGINE_RC2_5_CAMPAIGN_ORDER_CONVERSION.md',
  'erp-knowledge-library.html',
  'tests/engine-rc2-6-niles-exclusion-decision.test.js'
]);
const diffFiles = execFileSync('git', ['diff', '--name-only', baseline], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const statusFiles = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).split('\n').filter(Boolean).map(line => line.slice(3));
const changed = [...new Set([...diffFiles, ...statusFiles])];
assert.deepEqual(changed.filter(file => !allowed.has(file)), [], 'RC2.6 changes only its documentation, library link, and focused test');

const niles = fs.readFileSync('niles.html');
assert.equal(sha256(niles), sha256(fromBaseline('niles.html')), 'niles.html remains byte-for-byte unchanged');
for (const reference of [
  'https://tally.so/embed/aQoaDZ?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1',
  'https://tally.so/widgets/embed.js',
  'https://square.link/u/0Kb4NV8B?src=sheet',
  'https://square.link/u/L1M3Ho8w?src=sheet'
]) assert.ok(niles.includes(reference), `preserved external reference: ${reference}`);

assert.match(decision, /intentionally excluded, one-off historical\/manual/i);
assert.match(decision, /do not import historical Niles Tally submissions or Niles CSV rows/i);
assert.match(decision, /do not create `campaign_submissions`, Orders, Customer 360 identities, Production jobs, Inventory records, Finance entries/i);
assert.match(decision, /do not infer payment from a Square link/i);
assert.match(decision, /Future fundraisers must use the generic authorities from inception/i);
assert.match(rc24, /historical Niles data is intentionally excluded/i, 'RC2.4 staging authority retains the exclusion boundary');
assert.match(rc24, /submit_campaign_submission\(jsonb\).*is the sole public writer/i, 'RC2.4 generic submission authority remains intact');
assert.match(rc25, /only the one-time transition/i, 'RC2.5 conversion authority remains intact');
assert.match(rc25, /Niles remains a one-off historical\/manual workflow outside RC2\.4 staging and RC2\.5 conversion/i);

const migrations = execFileSync('find', ['supabase/migrations', '-type', 'f'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
assert.deepEqual(migrations.filter(file => /niles/i.test(file)), [], 'no Niles-specific migration exists');
const migrationText = migrations.map(read).join('\n');
assert.doesNotMatch(migrationText, /(?:create|alter)\s+(?:table|function|trigger)[^;\n]*niles/i, 'no Niles-specific schema, RPC, or trigger exists');
assert.deepEqual(changed.filter(file => /(?:niles.*(?:import|migrat)|(?:import|migrat).*niles)/i.test(file) && /^(?:js|supabase|api|functions|scripts)\//.test(file)), [], 'no Niles importer or migration was added');

const publicRc5Pages = execFileSync('git', ['show', `${baseline}:tests/rc5-customer-journey.test.js`], { encoding: 'utf8' })
  .match(/const pages = `([^`]+)`/)[1].split(/\s+/);
assert.deepEqual(changed.filter(file => publicRc5Pages.includes(file)), [], 'no public RC5 page changed');
console.log('RC2.6 Niles one-off exclusion decision assertions passed');
