-- ERP Blueprint v1 Finance authority corrective milestone.
-- Forward-only plan only: Codex did not deploy SQL, run SQL, backfill, reinterpret duplicate candidates,
-- clean historical rows, or alter the one historical shipping charged / shipping cost inconsistency.

begin;

alter table if exists public.financial_entries
  add column if not exists order_id uuid,
  add column if not exists order_number text,
  add column if not exists finance_command_id text,
  add column if not exists finance_command text,
  add column if not exists finance_command_owned boolean not null default false,
  add column if not exists correction_of_entry_id uuid,
  add column if not exists reversal_of_entry_id uuid,
  add column if not exists posted_by uuid,
  add column if not exists posted_at timestamptz,
  add column if not exists correction_reason text,
  add column if not exists accepted_commercial_snapshot jsonb not null default '{}'::jsonb;

create unique index if not exists financial_entries_finance_command_identity_once
  on public.financial_entries (finance_command_id)
  where finance_command_id is not null;

create unique index if not exists financial_entries_order_income_once
  on public.financial_entries (user_id, order_id)
  where finance_command = 'post_order_income' and finance_command_owned is true and correction_of_entry_id is null and reversal_of_entry_id is null;

create unique index if not exists financial_entries_original_reversed_once
  on public.financial_entries (user_id, reversal_of_entry_id)
  where finance_command = 'reverse_entry' and finance_command_owned is true and reversal_of_entry_id is not null;

alter table if exists public.financial_entries enable row level security;

revoke insert, update, delete on table public.financial_entries from anon;
revoke update(order_id, order_number, finance_command_id, finance_command, finance_command_owned, correction_of_entry_id, reversal_of_entry_id, posted_by, posted_at, correction_reason, accepted_commercial_snapshot)
  on public.financial_entries from authenticated;
-- Manual Finance Pro entry creation/editing/deletion remains temporarily available to authenticated owners via existing owner-scoped RLS.
grant select, insert, update, delete on table public.financial_entries to authenticated;

create or replace function public.post_order_finance_income(
  p_order_id uuid,
  p_order_number text,
  p_expected_updated_at timestamptz,
  p_correlation_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_entry public.financial_entries%rowtype;
  v_snapshot jsonb;
begin
  if v_actor is null then raise exception 'Authenticated owner is required'; end if;
  if p_order_id is null or nullif(btrim(p_order_number),'') is null then raise exception 'Order UUID and Order number are required'; end if;
  if p_expected_updated_at is null then raise exception 'p_expected_updated_at is required'; end if;
  if nullif(btrim(p_correlation_id),'') is null then raise exception 'Immutable Finance command identity is required'; end if;

  perform pg_advisory_xact_lock(hashtext('finance-order-posting:' || p_correlation_id));

  select * into v_entry from public.financial_entries where finance_command_id = p_correlation_id for update;
  if found then
    if v_entry.user_id is distinct from v_actor or v_entry.order_id is distinct from p_order_id or v_entry.order_number is distinct from p_order_number or v_entry.finance_command is distinct from 'post_order_income' then
      raise exception 'Finance command identity is already used for another owner, Order, entry, or command';
    end if;
    return jsonb_build_object('idempotent', true, 'entry_id', v_entry.id, 'order_id', v_entry.order_id, 'order_number', v_entry.order_number, 'snapshot', v_entry.accepted_commercial_snapshot);
  end if;

  select * into v_order from public.orders where id = p_order_id and order_number = p_order_number and user_id = v_actor for update;
  if not found then raise exception 'Order not found for authenticated owner'; end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'Order changed; refresh before posting Finance'; end if;

  select * into v_entry from public.financial_entries where user_id = v_actor and order_id = p_order_id and finance_command = 'post_order_income' and finance_command_owned is true for update;
  if found then raise exception 'Order income has already been posted to Finance'; end if;

  v_snapshot := jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number, 'order_total', coalesce(v_order.order_total,0),
    'deposit_amount', coalesce(v_order.deposit_amount,0), 'balance_amount', coalesce(v_order.balance_amount,0),
    'tax_exempt', coalesce(v_order.tax_exempt,false), 'payment_status', v_order.payment_status,
    'paid_date', v_order.paid_date, 'invoice_number', v_order.invoice_number,
    'source', 'accepted_order_snapshot_from_orders_not_mutable_quote_recalculation'
  );

  insert into public.financial_entries(
    user_id, type, entry_date, category, tax_category, title, notes, amount, original_amount,
    vendor_name, payment_method, business_use_percent, shipping_charged, sales_tax_collected, tax_exempt_sale,
    shipping_cost, material_cost, packaging_cost, labor_cost, other_direct_cost,
    order_id, order_number, finance_command_id, finance_command, finance_command_owned,
    posted_by, posted_at, accepted_commercial_snapshot
  ) values (
    v_actor, 'income', coalesce(v_order.paid_date, current_date), 'Sale', 'income_sales',
    'Order income - ' || p_order_number,
    'Authoritative Finance command posting for Order ' || p_order_number || '. Corrections must be append-only.',
    coalesce(v_order.order_total,0), coalesce(v_order.order_total,0),
    v_order.customer_name, coalesce(v_order.payment_status,''), 100, 0, 0, coalesce(v_order.tax_exempt,false),
    0, 0, 0, 0, 0,
    p_order_id, p_order_number, p_correlation_id, 'post_order_income', true,
    v_actor, statement_timestamp(), v_snapshot
  ) returning * into v_entry;

  update public.orders
     set finance_pushed = true,
         finance_pushed_at = statement_timestamp(),
         internal_notes = concat_ws(E'\n\n', nullif(v_order.internal_notes,''), 'Finance entry ' || v_entry.id || ' posted by authoritative command at ' || statement_timestamp()::text)
   where id = v_order.id and user_id = v_actor;

  return jsonb_build_object('idempotent', false, 'entry_id', v_entry.id, 'order_id', v_entry.order_id, 'order_number', v_entry.order_number, 'snapshot', v_entry.accepted_commercial_snapshot);
end;
$$;

create or replace function public.append_finance_correction(
  p_original_entry_id uuid,
  p_command text,
  p_amount numeric,
  p_reason text,
  p_correlation_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_original public.financial_entries%rowtype;
  v_entry public.financial_entries%rowtype;
  v_command text := lower(btrim(coalesce(p_command,'')));
begin
  if v_actor is null then raise exception 'Authenticated owner is required'; end if;
  if p_original_entry_id is null then raise exception 'Original Finance entry UUID is required'; end if;
  if v_command not in ('reverse','correct') then raise exception 'Finance correction command must be reverse or correct'; end if;
  if p_amount is null or p_amount <= 0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Correction amount must be greater than zero and finite'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Correction reason is required'; end if;
  if nullif(btrim(p_correlation_id),'') is null then raise exception 'Immutable Finance command identity is required'; end if;

  perform pg_advisory_xact_lock(hashtext('finance-correction:' || p_correlation_id));
  select * into v_entry from public.financial_entries where finance_command_id = p_correlation_id for update;
  if found then
    if v_entry.user_id is distinct from v_actor or v_entry.correction_of_entry_id is distinct from p_original_entry_id or v_entry.finance_command is distinct from case when v_command='reverse' then 'reverse_entry' else 'correct_entry' end then
      raise exception 'Finance command identity is already used for another owner, Order, entry, or command';
    end if;
    return jsonb_build_object('idempotent', true, 'entry_id', v_entry.id, 'original_entry_id', p_original_entry_id);
  end if;

  select * into v_original from public.financial_entries where id = p_original_entry_id and user_id = v_actor for update;
  if not found then raise exception 'Original Finance entry not found for authenticated owner'; end if;
  if v_original.correction_of_entry_id is not null or v_original.reversal_of_entry_id is not null then raise exception 'Correction entries cannot be reversed or corrected again'; end if;
  if v_command = 'reverse' and exists (select 1 from public.financial_entries where user_id = v_actor and reversal_of_entry_id = p_original_entry_id for update) then
    raise exception 'Finance entry has already been reversed';
  end if;

  insert into public.financial_entries(
    user_id, type, entry_date, category, tax_category, title, notes, amount, original_amount,
    vendor_name, payment_method, business_use_percent, shipping_charged, sales_tax_collected, tax_exempt_sale,
    shipping_cost, material_cost, packaging_cost, labor_cost, other_direct_cost,
    order_id, order_number, finance_command_id, finance_command, finance_command_owned,
    correction_of_entry_id, reversal_of_entry_id, posted_by, posted_at, correction_reason, accepted_commercial_snapshot
  ) values (
    v_actor, v_original.type, current_date, coalesce(v_original.category,'Correction'), v_original.tax_category,
    case when v_command='reverse' then 'Reversal - ' else 'Correction - ' end || coalesce(v_original.title, p_original_entry_id::text),
    'Append-only Finance correction for original entry ' || p_original_entry_id || ': ' || p_reason,
    -abs(p_amount), -abs(p_amount), v_original.vendor_name, v_original.payment_method, coalesce(v_original.business_use_percent,100),
    0, 0, coalesce(v_original.tax_exempt_sale,false), 0, 0, 0, 0, 0,
    v_original.order_id, v_original.order_number, p_correlation_id, case when v_command='reverse' then 'reverse_entry' else 'correct_entry' end, true,
    p_original_entry_id, case when v_command='reverse' then p_original_entry_id else null end,
    v_actor, statement_timestamp(), p_reason, coalesce(v_original.accepted_commercial_snapshot,'{}'::jsonb) || jsonb_build_object('corrected_original_entry_id', p_original_entry_id)
  ) returning * into v_entry;

  return jsonb_build_object('idempotent', false, 'entry_id', v_entry.id, 'original_entry_id', p_original_entry_id);
end;
$$;

revoke all on function public.post_order_finance_income(uuid,text,timestamptz,text) from public, anon;
revoke all on function public.append_finance_correction(uuid,text,numeric,text,text) from public, anon;
grant execute on function public.post_order_finance_income(uuid,text,timestamptz,text) to authenticated, service_role;
grant execute on function public.append_finance_correction(uuid,text,numeric,text,text) to authenticated, service_role;

/* Consolidated read-only JSONB verification query:
select jsonb_build_object(
  'financial_entries_counts', (select jsonb_build_object('rows', count(*), 'income', count(*) filter (where type='income'), 'expense', count(*) filter (where type='expense'), 'income_total', sum(amount) filter (where type='income'), 'expense_total', sum(amount) filter (where type='expense')) from public.financial_entries),
  'order_posting_duplicates', (select count(*) from (select user_id, order_id, count(*) from public.financial_entries where finance_command='post_order_income' group by 1,2 having count(*)>1) d),
  'command_identity_collisions', (select count(*) from (select finance_command_id, count(*) from public.financial_entries where finance_command_id is not null group by 1 having count(*)>1) d),
  'missing_order_links', (select count(*) from public.financial_entries f left join public.orders o on o.id=f.order_id where f.order_id is not null and o.id is null),
  'unresolved_duplicate_candidates', 'five craft-show income rows are duplicate candidates only; this milestone does not reinterpret them',
  'historical_shipping_inconsistency', 'one historical row has shipping charged without shipping cost; this milestone does not alter it',
  'anon_can_mutate_financial_entries', has_table_privilege('anon','public.financial_entries','insert') or has_table_privilege('anon','public.financial_entries','update') or has_table_privilege('anon','public.financial_entries','delete'),
  'authenticated_owner_reads_preserved', has_table_privilege('authenticated','public.financial_entries','select')
) as finance_authority_verification;
*/

commit;
