const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202607200004_quote_acceptance_runtime_correctness.sql', 'utf8');
const priorAuthority = fs.readFileSync('supabase/migrations/202607200002_quote_acceptance_authority.sql', 'utf8');
const snapshotSecurity = fs.readFileSync('supabase/migrations/202607200003_quote_accepted_snapshot_security.sql', 'utf8');

function has(pattern, message) { assert.match(migration, pattern, message); }
function lacks(pattern, message) { assert.doesNotMatch(migration, pattern, message); }

has(/create or replace function public\.respond_to_quote_public\(p_public_token text, p_quote_number text, p_response text, p_message text default null\)[\s\S]*security definer[\s\S]*set search_path = public, pg_temp/, 'RPC is replaced as SECURITY DEFINER with fixed search_path');
has(/from public\.quotes[\s\S]*where quote_number = p_quote_number[\s\S]*and public_token = p_public_token[\s\S]*for update;/, 'Quote-row FOR UPDATE locking and token validation are preserved');
has(/v_quote\.customer_response,''\) = 'accepted'[\s\S]*v_response <> 'accepted'[\s\S]*Accepted quotes cannot be changed/, 'accepted Quotes cannot transition to declined or change-requested');
has(/return jsonb_build_object\('response','accepted','status','accepted','order_number',v_order\.order_number\);[\s\S]*end if;[\s\S]*if v_response = 'declined'/, 'accepted retry returns before declined/change handling and no-write path');
has(/exists \(select 1 from public\.project_events[\s\S]*event_type = 'quote\.accepted'\)[\s\S]*exists \(select 1 from public\.project_events[\s\S]*event_type = 'order\.created'\)/, 'idempotent retry validates required events before early return');
has(/v_quantity := greatest\(coalesce\(nullif\(v_quote\.quote_data #>> '\{fields,qty\}',''\)::numeric, 1\), 1\)::integer;/, 'quantity comes from quote_data.fields.qty with default 1');
has(/v_order_total := coalesce\(nullif\(v_quote\.quote_total::text,''\)::numeric, 0\);/, 'order_total comes from quote_total');
has(/v_deposit_amount := coalesce\(nullif\(v_quote\.quote_data #>> '\{fields,depositAmount\}',''\)::numeric, 0\);/, 'deposit comes from quote_data.fields.depositAmount');
has(/v_balance_amount := greatest\(v_order_total - v_deposit_amount, 0\);/, 'balance is max(order_total - deposit, 0)');
has(/insert into public\.orders\([^)]*quantity, order_total, deposit_amount, balance_amount, payment_status, fulfillment,[\s\S]*values \([^;]*v_quantity, v_order_total, v_deposit_amount, v_balance_amount, v_payment_status, v_fulfillment/, 'commercial Order fields are explicitly populated and zero-dollar defaults are not silently used');
has(/source_quote_number, created_from_quote, accepted_date[\s\S]*v_quote\.quote_number, true, v_now/, 'Order stores source Quote linkage and acceptance timestamp');
has(/customer_name, customer_email, customer_phone, order_title[\s\S]*v_quote\.customer_name, v_quote\.customer_email, v_quote\.customer_phone, v_order_title/, 'customer fields and order_title are projected');
has(/insert into public\.order_tracking_public\([^)]*order_number, order_title, order_total, payment_status, status, public_status_text, public_next_step[\s\S]*'ready_to_print'[\s\S]*Your order is approved and ready for production/, 'tracking projection fields are initialized with approved public status text');
has(/on conflict \(order_number\) do update set updated_at = public\.order_tracking_public\.updated_at where public\.order_tracking_public\.status = 'ready_to_print';/, 'advanced tracking rows are not reset on retry');
has(/drop trigger if exists quotes_advance_linked_production on public\.quotes;/, 'Quote acceptance trigger is retired');
has(/drop function if exists public\.advance_linked_production_on_quote_acceptance\(\);/, 'unused Quote acceptance trigger function is removed after repository inspection');
has(/orders_sync_workflow_to_production/, 'verification preserves the Order workflow trigger');
has(/update public\.production_jobs[\s\S]*coalesce\(production_status,''\) in \('waiting_customer','quote_sent','quote_accepted','awaiting_approval','waiting_for_customer'\)[\s\S]*actual_usage_captured/, 'RPC performs the only acceptance-time Production handoff and protects advanced/actual work');
lacks(/update public\.production_jobs p\s+set[\s\S]*from public\.orders o/, 'no historical Production repair statement exists');
lacks(/update public\.orders\s+set|delete from public\.orders|delete from public\.quotes|update public\.quote_accepted_commercial_snapshots/, 'no historical Order/Quote/snapshot repair statements exist');
has(/revoke all on table public\.quote_accepted_commercial_snapshots from public, anon, authenticated;/, 'snapshot direct grants remain protected');
has(/grant all on table public\.quote_accepted_commercial_snapshots to service_role;/, 'service_role snapshot access remains');
has(/quote\.change_requested[\s\S]*on conflict \(user_id, quote_number, event_type\) where event_type = 'quote\.change_requested' do nothing;/, 'canonical change-request behavior emits exactly one event');
has(/Read-only preflight queries:/, 'read-only preflight queries are included');
has(/Post-deployment verification queries:/, 'post-deployment verification queries are included');
has(/Forward recovery guidance:/, 'forward recovery guidance is included');
has(/Codex did not apply this migration/, 'migration explicitly states Codex did not apply it');
assert.match(priorAuthority, /revoke execute on function public\.respond_to_quote_public\(text,text,text,text\) from public;/, 'prior least-privilege RPC grant baseline exists');
assert.match(snapshotSecurity, /alter table public\.quote_accepted_commercial_snapshots\s+enable row level security;/, 'snapshot RLS remains established by 202607200003');

console.log('quote acceptance runtime correctness contract assertions passed');
