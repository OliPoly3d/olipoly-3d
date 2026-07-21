const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/202607210008_campaign_manager_phase1.sql');
const managerJs = read('js/campaign-manager.js');
const managerHtml = read('campaign-manager.html');
const publicHtml = read('fundraiser.html');
const hub = read('hub.html');
const niles = read('niles.html');
const campaignDocs = read('FUNDRAISER_CAMPAIGN_MANAGER_PHASE1.md');

assert.match(migration, /create table if not exists public\.campaigns/i);
assert.match(migration, /create table if not exists public\.campaign_products/i);
assert.match(migration, /user_id uuid not null references auth\.users\(id\) on delete restrict/i);
assert.match(migration, /alter table public\.campaigns enable row level security/i);
assert.match(migration, /alter table public\.campaign_products enable row level security/i);
assert.match(migration, /create policy "Users manage own campaigns"[\s\S]*to authenticated[\s\S]*auth\.uid\(\) = user_id/i);
assert.match(migration, /create policy "Users manage own campaign products"[\s\S]*to authenticated[\s\S]*auth\.uid\(\) = user_id/i);
assert.match(migration, /revoke all on table public\.campaigns from anon/i);
assert.match(migration, /revoke all on table public\.campaign_products from anon/i);
assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/i);
assert.match(migration, /grant execute on function public\.get_public_campaign\(text\) to anon, authenticated/i);
assert.match(migration, /status in \('draft','scheduled','active','closed','archived'\)/);
assert.match(migration, /payment_mode in \('external_org_collects','olipoly_collects'\)/);
assert.match(migration, /delivery_mode.*organization_pickup.*event_pickup.*customer_pickup.*shipping.*mixed/s);
assert.match(migration, /standard_customer_price numeric\(12,2\) not null check \(standard_customer_price >= 0\)/i);
assert.match(migration, /olipoly_standard_share numeric\(12,2\) not null check \(olipoly_standard_share >= 0\)/i);

const publicFunction = migration.match(/create or replace function public\.get_public_campaign[\s\S]*?\$\$;/i)?.[0] || '';
['user_id','internal_notes','olipoly_standard_share','olipoly_personalized_share'].forEach(privateField => {
  assert.equal(publicFunction.includes(`'${privateField}'`), false, `public RPC must not expose ${privateField}`);
});
assert.match(publicFunction, /where p\.campaign_id = c\.id and p\.enabled = true/i);
assert.match(publicFunction, /c\.status in \('scheduled','active'\)/i);

assert.match(managerJs, /const CAMPAIGN_FIELDS = \[/);
assert.match(managerJs, /const PRODUCT_FIELDS = \[/);
assert.doesNotMatch(managerJs, /importRecovery|bulk|rebuild|localStorage\.setItem\(['"]campaign/i);
assert.match(managerJs, /throw new Error\('Campaign slug, code, name, and organization are required\.'\)/);
assert.match(managerHtml, /Save failed; no durable success was recorded/);
assert.match(managerHtml, /Product save failed; no durable success was recorded/);
assert.match(hub, /Campaign Manager/);
assert.match(hub, /campaign-manager\.html/);

assert.match(publicHtml, /rpc\/get_public_campaign/);
assert.doesNotMatch(publicHtml, /rest\/v1\/campaigns|rest\/v1\/campaign_products/);
assert.match(publicHtml, /The organization collects customer payment externally/);
assert.match(publicHtml, /fundraiser\.html\?campaign=/);

assert.match(niles, /Niles Dragons Bag Tags/);
assert.match(niles, /tally\.so/i);
assert.match(campaignDocs, /Codex did not deploy this SQL or alter Supabase state/i);
assert.match(campaignDocs, /NIL-001 through NIL-012/);

const changedFiles = require('node:child_process').execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf8' });
assert.equal(changedFiles.includes('niles.html'), false, 'Niles page must remain unchanged');
assert.equal(changedFiles.includes('pay.html'), false, 'pay.html must remain unchanged');
assert.equal(changedFiles.includes('track.html'), false, 'track.html must remain unchanged');
assert.equal(changedFiles.includes('OP-000010'), false, 'OP-000010 evidence must not be touched');
console.log('campaign manager phase 1 structural assertions passed');
