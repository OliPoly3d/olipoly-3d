const assert = require('assert');
const fs = require('fs');
const read = file => fs.readFileSync(file, 'utf8');
const migration = read('supabase/migrations/202607280002_campaign_submission_authority.sql');
const manager = read('js/campaign-manager.js');
const page = read('campaign-manager.html');
const docs = read('ENGINE_RC2_4_CAMPAIGN_SUBMISSION_AUTHORITY.md');

for (const table of ['campaign_submissions','campaign_submission_items']) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`,'i'));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`,'i'));
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`,'i'));
}
assert.match(migration, /unique \(submission_source, source_event_key\)/i);
assert.match(migration, /payload_fingerprint text not null/i);
assert.match(migration, /security definer set search_path = public, pg_temp/g);
assert.match(migration, /grant execute on function public\.submit_campaign_submission\(jsonb\) to anon, authenticated/i);
assert.match(migration, /revoke all on function public\.review_campaign_submission\(uuid,text,text\) from public, anon/i);
assert.match(migration, /where c\.campaign_slug=.*c\.status='active'/i);
assert.match(migration, /p\.campaign_id=v_campaign\.id and p\.enabled=true/i);
assert.match(migration, /v_product\.standard_customer_price/);
assert.match(migration, /numeric\(12,2\)/);
assert.match(migration, /Quantity is outside allowed range/);
assert.match(migration, /Personalization is unavailable/);
assert.match(migration, /jsonb_build_object\('campaign_id'/);
assert.match(migration, /jsonb_build_object\('campaign_product_id'/);
assert.match(migration, /Conflicting idempotency replay|conflicting_replay/);
assert.match(migration, /Campaign submission sale snapshot is immutable/);
assert.match(migration, /payment_evidence_state text not null default 'unverified'/);
assert.match(migration, /campaign_submission_conversion_reserved/);
assert.doesNotMatch(migration, /insert into public\.(orders|production_jobs|inventory_|finance_|invoices|payments)/i);

assert.match(manager, /safeText/);
assert.match(manager, /review_campaign_submission/);
assert.match(page, /Not yet an Order/);
assert.match(page, /review_status==='approved_for_conversion'/);
assert.match(manager, /convert_campaign_submission_to_order/);
assert.match(page, /data-review/);
assert.match(page, /min-height:44px/);
assert.match(page, /textContent='Loading line items/);
assert.match(page, /esc\(s\.customer_notes/);
assert.match(docs, /Automatic Tally ingestion: not active/i);
assert.match(docs, /No Niles records are imported/i);
assert.match(docs, /202607280001_authoritative_asset_lifecycle\.sql/);
console.log('RC2.4 campaign submission authority structural assertions passed');
