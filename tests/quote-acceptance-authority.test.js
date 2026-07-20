const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202607200002_quote_acceptance_authority.sql', 'utf8');
const rootQuote = fs.readFileSync('quote.js', 'utf8');
const legacyQuote = fs.readFileSync('js/quote.js', 'utf8');

function has(pattern, message){ assert.match(migration, pattern, message); }
function lacksIn(source, pattern, message){ assert.doesNotMatch(source, pattern, message); }

has(/from public\.quotes[\s\S]*where quote_number = p_quote_number and public_token = p_public_token[\s\S]*for update;/, 'Quote row locking and exact Q/token validation are required');
has(/v_response in \('accept','approved','approve'\)[\s\S]*v_response := 'accepted'/, 'accepted compatibility values normalize to canonical accepted');
has(/v_response not in \('accepted','declined'\)/, 'response vocabulary is validated');
has(/alter table if exists public\.orders add column if not exists source_quote_number text;/, 'orders.source_quote_number is permanently persisted');
has(/create unique index if not exists orders_one_per_source_quote_number_idx[\s\S]*where nullif\(btrim\(source_quote_number\),''\) is not null;/, 'exactly one Order per nonblank source Quote is enforced compatibly');
has(/if exists \(select 1 from public\.orders[\s\S]*having count\(\*\) > 1\)[\s\S]*raise exception 'Cannot enforce one Order per source Quote/, 'migration stops if uniqueness prerequisite is violated');
has(/v_order\.user_id is distinct from v_quote\.user_id[\s\S]*nullif\(v_order\.source_quote_number,''\) is distinct from v_quote\.quote_number[\s\S]*raise exception 'Order number collision/, 'order number collisions must be rejected before reuse');
has(/regexp_replace\(v_quote\.quote_number, '\^Q-', 'OP-'\)/, 'Q to OP suffix parity is preserved by the server');
has(/on conflict \(source_quote_number\)[\s\S]*do nothing;[\s\S]*where source_quote_number = v_quote\.quote_number/, 'idempotent retry reuses the same Order');
has(/quote_accepted_commercial_snapshots[\s\S]*snapshot jsonb not null/, 'accepted commercial snapshot schema exists');
has(/prevent_quote_accepted_snapshot_mutation[\s\S]*before update or delete/, 'accepted snapshots are immutable');
has(/accepted_commercial_snapshot = coalesce\(accepted_commercial_snapshot/, 'retry does not overwrite original Quote snapshot');
has(/insert into public\.project_events[\s\S]*'quote\.accepted'/, 'quote.accepted is emitted atomically');
has(/insert into public\.project_events[\s\S]*'order\.created'/, 'order.created is emitted atomically');
has(/on conflict \(user_id, quote_number, event_type\)[\s\S]*do nothing;/, 'acceptance events are exactly once on retry');
has(/event_id[\s\S]*occurred_at[\s\S]*aggregate_type[\s\S]*actor_type[\s\S]*correlation_id[\s\S]*schema_version[\s\S]*payload/, 'compat event envelope columns are added');
has(/update public\.production_jobs[\s\S]*production_status = 'ready_to_print'[\s\S]*coalesce\(production_status,''\) in \('waiting_customer','quote_sent','quote_accepted','awaiting_approval'\)/, 'one acceptance-time Production handoff authority advances only valid waiting states');
has(/insert into public\.order_tracking_public[\s\S]*on conflict \(order_number\) do update set updated_at = public\.order_tracking_public\.updated_at where public\.order_tracking_public\.status = 'ready_to_print';/, 'tracking is initialized without resetting advanced rows on retry');
has(/revoke execute on function public\.respond_to_quote_public\(text,text,text,text\) from public;/, 'PUBLIC execute is revoked from acceptance RPC');
has(/revoke execute on function public\.get_quote_public\(text,text\) from public;/, 'PUBLIC execute is revoked from public quote lookup RPC');
has(/revoke execute on function public\.set_linked_workflow_status\(text,text,timestamptz\) from anon;/, 'anon execute is revoked from workflow RPC');
has(/security definer set search_path = public, pg_temp/, 'SECURITY DEFINER functions use fixed search_path');
has(/raise; -- PostgreSQL rolls back every required acceptance write in this transaction\./, 'rollback behavior is explicit in the SQL contract');
has(/do not repair here|does not repair, delete, relink, or reinterpret historical/, 'historical repair is explicitly out of scope');
has(/OP-000184/, 'OP-000184 is informational and must not block deployment');
has(/Read-only preflight queries:/, 'read-only preflight queries are documented');
has(/Codex did not apply this migration/, 'migration states it was not applied by Codex');
has(/Manual browser test checklist:/, 'manual browser tests are documented');

const rootAcceptance = rootQuote.match(/async function acceptAndCreateOrder\([\s\S]*?\n  \}/)?.[0] || '';
const legacyAcceptance = legacyQuote.match(/async function acceptAndCreateOrder\([\s\S]*?\n  \}/)?.[0] || '';
for (const [name, source, acceptance] of [['root quote.js', rootQuote, rootAcceptance], ['legacy js/quote.js', legacyQuote, legacyAcceptance]]) {
  assert.match(acceptance, /acceptQuoteThroughServer/, `${name} must accept through respond_to_quote_public`);
  lacksIn(acceptance, /\/rest\/v1\/orders|\/rest\/v1\/production_jobs|\/rest\/v1\/order_tracking_public|project_events|updateLinkedProductionJobAfterAcceptance|upsertOrder|updateQuoteAccepted|buildOrderPayload/, `${name} must not perform browser acceptance side-effect writes`);
  lacksIn(source, /function (?:buildOrderPayload|upsertOrder|updateQuoteAccepted|updateLinkedProductionJobAfterAcceptance)\b/, `${name} must not retain obsolete browser acceptance authorities`);
}

console.log('quote acceptance authority contract assertions passed');
