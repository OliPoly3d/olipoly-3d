const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync('supabase/migrations/202608030001_production_quote_order_identity.sql','utf8');
const ui = fs.readFileSync('production-control.html','utf8');
const quote = fs.readFileSync('quote.js','utf8');

assert.match(sql,/add column if not exists production_job_id uuid references public\.production_jobs/);
assert.match(sql,/quotes_one_per_production_job_idx[\s\S]*where production_job_id is not null/);
assert.match(sql,/save_production_quote[\s\S]*security definer set search_path = public, pg_temp/);
assert.match(sql,/on conflict \(production_job_id\)[\s\S]*update public\.production_jobs/);
assert.match(sql,/orders_link_production_after_quote_insert after insert on public\.orders/);
assert.match(sql,/job_payload=jsonb_set\(jsonb_set\(jsonb_set[\s\S]*'\{order_id\}'/);
assert.match(sql,/raise exception 'Production\/Quote identity mismatch/);
assert.match(sql,/repair_production_quote_order_linkage[\s\S]*Expected exactly one Order candidate/);
assert.match(sql,/revoke all on function public\.repair_production_quote_order_linkage\(uuid\) from public, anon/);
assert.match(sql,/production_linkage_candidates[\s\S]*safe_repair_eligible[\s\S]*exclusion_reason/);
assert.match(sql,/72a14a94-b126-4dc5-b31f-32ec7cd6eb59[\s\S]*Q-000013[\s\S]*4601a9d3-68d2-467c-bc41-8aeb63bafc78[\s\S]*OP-000189/);
assert.match(quote,/\/rest\/v1\/rpc\/save_production_quote/);
assert.doesNotMatch(ui,/ORDER_TO_PRODUCTION_STATUS/);
assert.doesNotMatch(ui,/quoteVariantsFromAny|orderVariantsFromAny/);
assert.match(ui,/Production and Order are out of sync\./, 'incomplete or contradictory linkage is visibly identified');
assert.match(ui,/not authoritatively linked[\s\S]*Refresh and complete the Quote\/Order handoff/, 'lifecycle changes fail closed when modern linkage is incomplete');
assert.match(ui,/production_status === 'ready_to_print' && !j\.linkage_incomplete/);

console.log('Production Quote Order identity contract assertions passed');
