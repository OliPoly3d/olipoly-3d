const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202607200005_quote_acceptance_runtime_safety.sql', 'utf8');
const superseded = fs.readFileSync('supabase/migrations/202607200004_quote_acceptance_runtime_correctness.sql', 'utf8');
const priorAuthority = fs.readFileSync('supabase/migrations/202607200002_quote_acceptance_authority.sql', 'utf8');
const snapshotSecurity = fs.readFileSync('supabase/migrations/202607200003_quote_accepted_snapshot_security.sql', 'utf8');

function has(pattern, message) { assert.match(migration, pattern, message); }
function lacks(pattern, message) { assert.doesNotMatch(migration, pattern, message); }

has(/202607200004 was merged as repository evidence but was not deployed[\s\S]*supersedes 202607200004 for[\s\S]*deployment/, '202607200005 documents that it supersedes undeployed 202607200004');
has(/begin;[\s\S]*create or replace function public\.respond_to_quote_public[\s\S]*drop trigger if exists orders_sync_workflow_to_production on public\.orders;[\s\S]*create trigger orders_sync_workflow_to_production[\s\S]*drop trigger if exists quotes_advance_linked_production[\s\S]*grant execute[\s\S]*commit;/i, 'RPC replacement, Order trigger replacement, Quote trigger retirement, and grants are inside explicit BEGIN/COMMIT');
assert.doesNotMatch(migration.slice(0, migration.search(/\nbegin;\n/i)), /(^|\n)\s*drop\s+(trigger|function)\b/i, 'no destructive statement occurs before BEGIN');
has(/If any statement fails before COMMIT[\s\S]*preserves the previously deployed RPC, Quote trigger\/function/, 'forward recovery documentation preserves prior deployed state on transactional failure');
has(/pg_get_triggerdef\(oid\)[\s\S]*orders_sync_workflow_to_production[\s\S]*no INSERT event/, 'preflight/post-deployment checks prove Order sync trigger has no INSERT event');
has(/create or replace function public\.respond_to_quote_public\(p_public_token text, p_quote_number text, p_response text, p_message text default null\)[\s\S]*security definer[\s\S]*set search_path = public, pg_temp/, 'RPC is replaced as SECURITY DEFINER with fixed search_path');
has(/from public\.quotes[\s\S]*where quote_number = p_quote_number[\s\S]*and public_token = p_public_token[\s\S]*for update;/, 'Quote-row FOR UPDATE locking and token validation are preserved');
has(/v_quote\.quote_number !~ '\^Q-\[0-9\]\{6\}\$'[\s\S]*Invalid Quote number format[\s\S]*v_order_number := regexp_replace/, 'invalid Quote identifiers are rejected before deriving OP number');
has(/v_quote\.customer_response,''\) = 'accepted'[\s\S]*v_response <> 'accepted'[\s\S]*Accepted quotes cannot be changed/, 'accepted Quotes cannot transition to change-requested');
has(/Accepted Quote Order evidence is inconsistent[\s\S]*Accepted Quote snapshot evidence is inconsistent[\s\S]*Accepted Quote tracking evidence is inconsistent[\s\S]*Accepted Quote event evidence is inconsistent[\s\S]*return jsonb_build_object\('response','accepted','status','accepted','order_number',v_order\.order_number\);/, 'accepted retry validates Order, snapshot, tracking, and event linkage before no-write return');
has(/select order_number into v_quote_accepted_order_number[\s\S]*event_type = 'quote\.accepted'[\s\S]*select order_number into v_order_created_order_number[\s\S]*event_type = 'order\.created'[\s\S]*is distinct from v_order\.order_number/, 'required acceptance events must reference the same Order before retry return');
has(/v_response in \('declined','decline','rejected','reject','change_requested','change-requested','changes','request_changes','requested_changes'\) then v_response := 'change_requested'/, 'deployed declined compatibility values normalize to canonical change_requested');
has(/if v_response not in \('accepted','change_requested'\)/, 'no separate declined terminal lifecycle is introduced');
has(/if v_response = 'change_requested'[\s\S]*insert into public\.project_events[\s\S]*'quote\.change_requested'[\s\S]*on conflict \(user_id, quote_number, event_type\) where event_type = 'quote\.change_requested' do nothing;[\s\S]*return jsonb_build_object\('response','change_requested'/, 'canonical change-request behavior emits exactly one event and returns change_requested');
assert.doesNotMatch(migration.slice(migration.indexOf("if v_response = 'change_requested'"), migration.indexOf("select * into v_order from public.orders where order_number")), /insert into public\.orders/, 'change requests do not create Orders');
has(/v_raw_quantity := coalesce\(nullif\(v_quote\.quote_data #>> '\{fields,qty\}',''\)::numeric, 1\);[\s\S]*v_raw_quantity::text in \('NaN', 'Infinity', '-Infinity'\) or v_raw_quantity <= 0 or v_raw_quantity <> trunc\(v_raw_quantity\)[\s\S]*Quote quantity must be a positive whole number[\s\S]*v_quantity := v_raw_quantity::integer;/, 'fractional and nonpositive quantities are rejected before casting');
has(/v_order_total := v_quote\.quote_total;[\s\S]*zero-dollar accepted Quote[\s\S]*v_order_total is null or v_order_total::text in \('NaN', 'Infinity', '-Infinity'\) or v_order_total < 0[\s\S]*Quote total must be a finite nonnegative amount/, 'NULL/negative/non-finite totals are rejected while intentional exact zero is documented');
has(/v_deposit_amount := coalesce\(nullif\(v_quote\.quote_data #>> '\{fields,depositAmount\}',''\)::numeric, 0\);[\s\S]*v_deposit_amount::text in \('NaN', 'Infinity', '-Infinity'\) or v_deposit_amount < 0 or v_deposit_amount > v_order_total[\s\S]*Quote deposit must be nonnegative and cannot exceed total/, 'deposit greater than total and invalid deposit values are rejected');
has(/v_balance_amount := v_order_total - v_deposit_amount;/, 'balance uses validated total and deposit without silent zero coercion');

for (const column of ['v_raw_quantity', 'v_order_total', 'v_deposit_amount']) {
  has(new RegExp(`${column}::text in \\('NaN', 'Infinity', '-Infinity'\\)`), `${column} rejects NaN, Infinity, and -Infinity`);
}
has(/v_payment_status := case when v_deposit_amount > 0 then 'deposit_due' else 'unpaid' end;/, 'Quote acceptance records deposit_due or unpaid only');
assert.doesNotMatch(migration, /'paid'|'deposit_paid'/, 'Quote acceptance never infers paid or deposit_paid');
has(/insert into public\.order_tracking_public\([^)]*payment_status[\s\S]*values\([^;]*v_payment_status/, 'initial tracking projection uses the same due/unpaid payment status');
has(/v_raw_fulfillment := lower\(btrim[\s\S]*v_fulfillment := case[\s\S]*''[\s\S]*'pickup'[\s\S]*'delivery'[\s\S]*'shipping'[\s\S]*else 'pickup'/, 'fulfillment is normalized to allowed pickup/delivery/shipping and blank/unknown defaults to pickup');
has(/terms', jsonb_build_object\('message', p_message, 'fulfillment', v_fulfillment, 'raw_fulfillment', v_raw_fulfillment, 'payment_status', v_payment_status\)/, 'immutable snapshot captures normalized commercial fulfillment/payment projection from locked Quote');
has(/insert into public\.orders\([^)]*quantity, order_total, deposit_amount, balance_amount, payment_status, fulfillment,[\s\S]*values \([^;]*v_quantity, v_order_total, v_deposit_amount, v_balance_amount, v_payment_status, v_fulfillment/, 'commercial Order fields are explicitly populated and zero-dollar defaults are not silently used');
has(/source_quote_number, created_from_quote, accepted_date[\s\S]*v_quote\.quote_number, true, v_now/, 'Order stores source Quote linkage and acceptance timestamp');
has(/customer_name, customer_email, customer_phone, order_title[\s\S]*v_quote\.customer_name, v_quote\.customer_email, v_quote\.customer_phone, v_order_title/, 'customer fields and order_title are projected');
has(/v_quote_accepted_event_id uuid := gen_random_uuid\(\);[\s\S]*values\(v_quote_accepted_event_id[\s\S]*'quote\.accepted'[\s\S]*select event_id into v_quote_accepted_event_id[\s\S]*'order\.created'[\s\S]*v_quote_accepted_event_id::text/, 'order.created causation_id uses the durable quote.accepted event ID');
has(/v_correlation text := gen_random_uuid\(\)::text;[\s\S]*'quote\.accepted'[\s\S]*v_correlation[\s\S]*'order\.created'[\s\S]*v_correlation/, 'quote.accepted and order.created share a correlation ID');
has(/select user_id into v_tracking_owner[\s\S]*for update;[\s\S]*Tracking ownership collision[\s\S]*on conflict \(order_number\) do nothing;/, 'tracking retry uses DO NOTHING after owner validation and performs no dummy update');
lacks(/on conflict \(order_number\) do update set updated_at = public\.order_tracking_public\.updated_at/, 'tracking retry does not trigger updated_at with a dummy update');
has(/drop trigger if exists orders_sync_workflow_to_production on public\.orders;[\s\S]*create trigger orders_sync_workflow_to_production\s+after update of status on public\.orders\s+for each row\s+when \(old\.status is distinct from new\.status\)\s+execute function public\.sync_order_workflow_to_production\(\);/, 'orders_sync_workflow_to_production is recreated as UPDATE-status-only with OLD/NEW status-change condition');
assert.doesNotMatch(migration, /create trigger orders_sync_workflow_to_production[\s\S]*after insert/i, 'orders_sync_workflow_to_production has no INSERT trigger');
has(/The RPC is the sole initial acceptance-time handoff[\s\S]*drop trigger if exists quotes_advance_linked_production on public\.quotes;/, 'RPC is documented as the only initial Production handoff authority');
has(/drop trigger if exists quotes_advance_linked_production on public\.quotes;/, 'Quote acceptance trigger is retired transactionally');
has(/drop function if exists public\.advance_linked_production_on_quote_acceptance\(\);/, 'unused Quote acceptance trigger function is removed inside the transaction');
has(/orders_sync_workflow_to_production/, 'verification preserves the Order workflow trigger');
has(/update public\.production_jobs[\s\S]*coalesce\(production_status,''\) in \('waiting_customer','quote_sent','quote_accepted','awaiting_approval','waiting_for_customer'\)[\s\S]*actual_usage_captured/, 'RPC performs the only acceptance-time Production handoff and protects advanced/actual work');
lacks(/update public\.production_jobs p\s+set[\s\S]*from public\.orders o/, 'no historical Production repair statement exists');
lacks(/update public\.orders\s+set|delete from public\.orders|delete from public\.quotes|update public\.quote_accepted_commercial_snapshots/, 'no historical Order/Quote/snapshot repair statements exist');
has(/revoke all on table public\.quote_accepted_commercial_snapshots from public, anon, authenticated;/, 'snapshot direct grants remain protected');
has(/grant all on table public\.quote_accepted_commercial_snapshots to service_role;/, 'service_role snapshot access remains');
has(/Read-only preflight queries:[\s\S]*duplicate source_quote_number|source_quote_number, count\(\*\)/, 'read-only duplicate source_quote_number preflight is included');
has(/Read-only preflight queries:[\s\S]*quote\.accepted','order\.created','quote\.change_requested/, 'read-only duplicate relevant event preflight is included');
has(/orders_fulfillment_check/, 'allowed fulfillment constraint preflight is included');
has(/routine_privileges|has_function_privilege/, 'deployed function/grant state checks are included');
has(/Post-deployment verification queries:[\s\S]*quote\.accepted','order\.created','quote\.change_requested/, 'post-deployment duplicate event verification is included');
has(/Codex did not apply this migration or[\s\S]*SQL/, 'migration explicitly states Codex did not apply SQL');
assert.match(priorAuthority, /revoke execute on function public\.respond_to_quote_public\(text,text,text,text\) from public;/, 'prior least-privilege RPC grant baseline exists');
assert.match(snapshotSecurity, /alter table public\.quote_accepted_commercial_snapshots\s+enable row level security;/, 'snapshot RLS remains established by 202607200003');
assert.match(superseded, /begin;[\s\S]*raise notice 'Migration 202607200004 was superseded before deployment by 202607200005_quote_acceptance_runtime_safety\.sql; no runtime changes applied\.';[\s\S]*commit;/i, '004 is a transaction-safe no-op supersession marker');
assert.match(superseded, /reviewed before deployment and found unsafe[\s\S]*never deployed[\s\S]*only runtime deployment artifact[\s\S]*202607200005_quote_acceptance_runtime_safety\.sql/i, '004 documents unsafe review, never-deployed state, and 005 supersession');
assert.doesNotMatch(superseded, /create\s+(?:unique\s+)?index|create\s+or\s+replace\s+function|drop\s+trigger|drop\s+function|alter\s+table|create\s+table|update\s+public\.|insert\s+into\s+public\.|delete\s+from\s+public\.|grant\s+|revoke\s+/i, '004 contains no executable runtime DDL/DML, function replacement, or grant changes');
assert.match(migration, /create or replace function public\.respond_to_quote_public[\s\S]*drop trigger if exists orders_sync_workflow_to_production[\s\S]*create trigger orders_sync_workflow_to_production[\s\S]*drop trigger if exists quotes_advance_linked_production[\s\S]*commit;/i, '005 contains the complete corrected implementation after 004 no-op');
assert.doesNotMatch(superseded, /respond_to_quote_public|quotes_advance_linked_production|orders_sync_workflow_to_production/, 'sequential execution of 004 then 005 cannot leave unsafe 004 runtime definitions deployed');

console.log('quote acceptance runtime safety contract assertions passed');
