-- Synthetic PostgreSQL fixture. Contains no live business records.
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.orders (
 id uuid primary key, user_id uuid, order_number text unique, source_quote_number text,
 status text, updated_at timestamptz, order_total numeric, balance_amount numeric,
 payment_status text, finance_pushed boolean default false
);
create table public.production_jobs (
 id uuid primary key, user_id uuid, order_number text, quote_number text,
 production_source_type text, production_status text, updated_at timestamptz,
 job_payload jsonb default '{}', exclude_inventory_reduction boolean default false,
 actual_machine text, actual_quantity numeric, actual_print_hours numeric,
 actual_grams_used numeric, scrap_grams numeric, actual_filament_breakdown text,
 actual_filaments jsonb, actual_filament_usage jsonb, roll_usages jsonb,
 completed_at timestamptz, print_started_at timestamptz
);
create table public.order_tracking_public (
 user_id uuid, order_number text, status text, public_status_text text,
 public_next_step text, updated_at timestamptz
);
create table public.production_material_reservations (
 id uuid primary key, user_id uuid, production_job_id uuid, raw_material_roll_id uuid,
 status text, reserved_grams numeric, consume_command_id text, attempt_id text,
 consumed_at timestamptz, updated_at timestamptz
);
create table public.raw_material_inventory (
 id uuid primary key, user_id uuid, remaining_grams numeric, reserved_grams numeric,
 updated_at timestamptz
);
create table public.inventory_transactions (
 id uuid primary key, user_id uuid, created_at timestamptz, occurred_at timestamptz,
 transaction_type text, type text, production_job_id uuid, attempt_id text,
 correlation_id text, raw_material_id uuid, quantity_grams numeric,
 order_number text, quote_number text, note text
);
create table public.production_attempt_consumption_receipts (
 command_identity text primary key, owner_id uuid, production_job_id uuid,
 attempt_id text, inventory_mode text, result_snapshot jsonb, created_at timestamptz,
 unique(owner_id,production_job_id,attempt_id)
);
create table public.project_events (
 event_id uuid primary key, user_id uuid, quote_number text, order_number text,
 event_type text, details jsonb, created_at timestamptz, occurred_at timestamptz,
 aggregate_type text, aggregate_id text, actor_type text, actor_id text,
 correlation_id text, causation_id text, schema_version integer, payload jsonb
);
create unique index workflow_event_identity on public.project_events(correlation_id,event_type)
 where correlation_id is not null and event_type in
 ('order.printing_started','order.print_completed','order.qc_passed','order.needs_reprint','order.ready_to_print','order.closed');
