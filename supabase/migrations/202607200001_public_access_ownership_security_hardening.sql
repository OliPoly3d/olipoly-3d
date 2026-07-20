-- Public Access and Ownership Security Hardening
-- Date: 2026-07-20
-- Purpose:
--   Harden confirmed deployed anonymous-access and owner-policy gaps for:
--   public.document_counters, public.parts_catalog, public.project_events,
--   public.order_tracking_public, and counter/tracking RPC grants.
--
-- Deployment order:
--   1. Apply this migration in Supabase.
--   2. Verify the RPC public_order_tracking_lookup(text) works for known OP numbers.
--   3. Deploy the updated track.html client that uses the RPC.
--   Applying the migration before the client creates a temporary tracking outage for old
--   clients; it does not permanently break tracking once the updated static page deploys.
--
-- Rollback / forward recovery:
--   Preferred forward recovery is to fix and redeploy track.html or this RPC. Do not weaken
--   RLS as a fallback. If a short emergency rollback is required, re-create a narrow anon
--   SELECT policy only for the explicit allowlist via a SECURITY DEFINER view/RPC in a new
--   reviewed migration, then remove it after the client is corrected.

begin;

-- 1. document_counters: server-side atomic allocation only.
alter table if exists public.document_counters enable row level security;
revoke all on table public.document_counters from public;
revoke all on table public.document_counters from anon;
revoke all on table public.document_counters from authenticated;
grant all on table public.document_counters to service_role;

drop policy if exists document_counters_no_browser_select on public.document_counters;
drop policy if exists document_counters_no_browser_insert on public.document_counters;
drop policy if exists document_counters_no_browser_update on public.document_counters;
drop policy if exists document_counters_no_browser_delete on public.document_counters;

-- Harden active counter RPC. Production Control uses next_document_counter('quote').
create or replace function public.next_document_counter(counter_key text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_key text := lower(trim(counter_key));
  next_value bigint;
begin
  if normalized_key not in ('quote', 'order', 'invoice') then
    raise exception 'Unsupported document counter key: %', counter_key using errcode = '22023';
  end if;

  insert into public.document_counters as dc (key, value, updated_at)
  values (normalized_key, 1, now())
  on conflict (key) do update
    set value = dc.value + 1,
        updated_at = now()
  returning value into next_value;

  return next_value;
end;
$$;

revoke all on function public.next_document_counter(text) from public;
revoke execute on function public.next_document_counter(text) from anon;
grant execute on function public.next_document_counter(text) to authenticated;
grant execute on function public.next_document_counter(text) to service_role;

-- next_quote_invoice_number() is referenced only by archived quote tooling in this repo.
-- Preserve it for service-role recovery/archival operations only; do not grant browser access.
revoke all on function public.next_quote_invoice_number() from public;
revoke execute on function public.next_quote_invoice_number() from anon;
revoke execute on function public.next_quote_invoice_number() from authenticated;
grant execute on function public.next_quote_invoice_number() to service_role;

-- 2. parts_catalog: authenticated owner-scoped compatibility table.
alter table if exists public.parts_catalog enable row level security;
revoke all on table public.parts_catalog from public;
revoke all on table public.parts_catalog from anon;
grant select, insert, update on table public.parts_catalog to authenticated;
grant all on table public.parts_catalog to service_role;

drop policy if exists parts_catalog_owner_select on public.parts_catalog;
drop policy if exists parts_catalog_owner_insert on public.parts_catalog;
drop policy if exists parts_catalog_owner_update on public.parts_catalog;
drop policy if exists parts_catalog_owner_delete on public.parts_catalog;

create policy parts_catalog_owner_select
on public.parts_catalog for select
to authenticated
using (user_id = auth.uid());

create policy parts_catalog_owner_insert
on public.parts_catalog for insert
to authenticated
with check (user_id = auth.uid());

create policy parts_catalog_owner_update
on public.parts_catalog for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- No delete policy: active Orders Admin evidence only selects/upserts compatibility rows.

-- 3. project_events: owner-scoped append-only events.
alter table if exists public.project_events enable row level security;
revoke all on table public.project_events from public;
revoke all on table public.project_events from anon;
grant select, insert on table public.project_events to authenticated;
grant all on table public.project_events to service_role;

drop policy if exists project_events_owner_select on public.project_events;
drop policy if exists project_events_owner_insert on public.project_events;
drop policy if exists project_events_owner_update on public.project_events;
drop policy if exists project_events_owner_delete on public.project_events;

create policy project_events_owner_select
on public.project_events for select
to authenticated
using (user_id = auth.uid());

create policy project_events_owner_insert
on public.project_events for insert
to authenticated
with check (user_id = auth.uid());

-- No update/delete policies: BUSINESS_EVENT_CONTRACT.md requires append-only evidence.

-- 4/5. order_tracking_public: no direct anonymous enumeration; public exact lookup RPC.
alter table if exists public.order_tracking_public enable row level security;
revoke all on table public.order_tracking_public from public;
revoke all on table public.order_tracking_public from anon;
grant select, insert, update, delete on table public.order_tracking_public to authenticated;
grant all on table public.order_tracking_public to service_role;

drop policy if exists "Public can read order tracking" on public.order_tracking_public;
drop policy if exists "Anon can read order tracking" on public.order_tracking_public;
drop policy if exists order_tracking_public_anon_select on public.order_tracking_public;
drop policy if exists order_tracking_public_public_select on public.order_tracking_public;
drop policy if exists order_tracking_public_owner_select on public.order_tracking_public;
drop policy if exists order_tracking_public_owner_insert on public.order_tracking_public;
drop policy if exists order_tracking_public_owner_update on public.order_tracking_public;
drop policy if exists order_tracking_public_owner_delete on public.order_tracking_public;

create policy order_tracking_public_owner_select
on public.order_tracking_public for select
to authenticated
using (user_id = auth.uid());

create policy order_tracking_public_owner_insert
on public.order_tracking_public for insert
to authenticated
with check (user_id = auth.uid());

create policy order_tracking_public_owner_update
on public.order_tracking_public for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy order_tracking_public_owner_delete
on public.order_tracking_public for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.public_order_tracking_lookup(tracking_identifier text)
returns table (
  order_number text,
  order_title text,
  status text,
  payment_status text,
  order_total numeric,
  public_status_text text,
  public_next_step text,
  shipping_or_pickup_note text,
  tracking_number text,
  payment_link text,
  payment_link_stripe text,
  payment_link_paypal text,
  payment_link_venmo text,
  paid_date date,
  po_number text,
  invoice_number text,
  invoice_terms text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with normalized as (
    select case
      when upper(trim(tracking_identifier)) ~ '^Q-[0-9]{1,6}$'
        then 'OP-' || lpad(regexp_replace(upper(trim(tracking_identifier)), '^Q-', ''), 6, '0')
      when upper(trim(tracking_identifier)) ~ '^OP-[0-9]{1,6}$'
        then 'OP-' || lpad(regexp_replace(upper(trim(tracking_identifier)), '^OP-', ''), 6, '0')
      else null
    end as lookup_order_number
  )
  select
    otp.order_number::text,
    otp.order_title::text,
    otp.status::text,
    otp.payment_status::text,
    otp.order_total,
    otp.public_status_text::text,
    otp.public_next_step::text,
    otp.shipping_or_pickup_note::text,
    otp.tracking_number::text,
    otp.payment_link::text,
    otp.payment_link_stripe::text,
    otp.payment_link_paypal::text,
    otp.payment_link_venmo::text,
    otp.paid_date::date,
    otp.po_number::text,
    otp.invoice_number::text,
    otp.invoice_terms::text
  from normalized n
  join public.order_tracking_public otp
    on otp.order_number = n.lookup_order_number
  where n.lookup_order_number is not null
  order by otp.updated_at desc nulls last, otp.order_number
  limit 1;
$$;

revoke all on function public.public_order_tracking_lookup(text) from public;
grant execute on function public.public_order_tracking_lookup(text) to anon;
grant execute on function public.public_order_tracking_lookup(text) to authenticated;
grant execute on function public.public_order_tracking_lookup(text) to service_role;

commit;

-- Verification queries (run after applying; should not mutate data):
-- select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('document_counters','parts_catalog','project_events','order_tracking_public');
-- select routine_name, grantee, privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name in ('next_document_counter','next_quote_invoice_number','public_order_tracking_lookup') order by routine_name, grantee;
-- select policyname, roles, cmd, qual, with_check from pg_policies where schemaname='public' and tablename in ('parts_catalog','project_events','order_tracking_public') order by tablename, policyname;
-- select * from public.public_order_tracking_lookup('OP-000001');
