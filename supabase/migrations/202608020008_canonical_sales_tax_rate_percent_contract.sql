-- Canonical sales-tax contract: numeric rates are percentage points (7 = 7%).
-- This migration adds validation/reporting authority. It does not rewrite data.
begin;

create or replace function public.normalize_sales_tax_rate_percent(p_rate numeric)
returns numeric language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if p_rate is null or p_rate::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Sales-tax rate must be a finite percentage-point value' using errcode='22023';
  end if;
  if p_rate < 0 or p_rate > 20 then
    raise exception 'Sales-tax rate must be between 0 and 20 percent' using errcode='22023';
  end if;
  return p_rate;
end $$;

comment on function public.normalize_sales_tax_rate_percent(numeric) is
  'Validates and returns a percentage-point sales-tax rate unchanged: 7 means 7%; never guesses legacy decimal intent.';
revoke all on function public.normalize_sales_tax_rate_percent(numeric) from public,anon,authenticated;
grant execute on function public.normalize_sales_tax_rate_percent(numeric) to service_role;

create or replace function public.validate_order_sales_tax_percent_contract() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.sales_tax_rate is not null then
    new.sales_tax_rate := public.normalize_sales_tax_rate_percent(new.sales_tax_rate);
  end if;
  if new.taxable_subtotal is not null and new.sales_tax_amount is not null
     and not coalesce(new.tax_exempt,false)
     and round(new.taxable_subtotal * new.sales_tax_rate / 100,2) is distinct from round(new.sales_tax_amount,2) then
    raise exception 'The stored sales-tax rate and tax amount do not reconcile.' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists zz_orders_sales_tax_percent_contract on public.orders;
create trigger zz_orders_sales_tax_percent_contract before insert or update of sales_tax_rate,taxable_subtotal,sales_tax_amount,tax_exempt
on public.orders for each row execute function public.validate_order_sales_tax_percent_contract();

create or replace function public.validate_order_finance_sales_tax_percent_contract() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.finance_command is distinct from 'post_order_income' then return new; end if;
  new.sales_tax_rate := public.normalize_sales_tax_rate_percent(new.sales_tax_rate);
  if not coalesce(new.tax_exempt_sale,false)
     and round(new.amount * new.sales_tax_rate / 100,2) is distinct from round(new.sales_tax_collected,2) then
    raise exception 'The stored sales-tax rate and tax amount do not reconcile.' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists zzz_finance_sales_tax_percent_contract on public.financial_entries;
create trigger zzz_finance_sales_tax_percent_contract before insert on public.financial_entries
for each row execute function public.validate_order_finance_sales_tax_percent_contract();

-- Read-only audit surface. A sub-1 rate is only called likely legacy when its
-- tax agrees with decimal math and authoritative snapshot evidence confirms the
-- percentage equivalent. Otherwise it remains unresolved/ambiguous.
create or replace view public.sales_tax_rate_contract_candidates
with (security_invoker=true) as
with effective as (
  select f.id entry_id,f.order_id,f.order_number,f.sales_county county,
    coalesce(f.taxable_sales,f.amount,0)::numeric taxable_amount,
    f.sales_tax_rate::numeric stored_rate,f.sales_tax_collected::numeric stored_tax,
    coalesce(nullif(f.accepted_commercial_snapshot#>>'{accepted_commercial_breakdown,tax_rate}','')::numeric,
             nullif(f.accepted_commercial_snapshot->>'sales_tax_rate','')::numeric) snapshot_rate,
    case when f.accepted_commercial_snapshot#>'{accepted_commercial_breakdown,tax_rate}' is not null
      then 'accepted_commercial_breakdown' when f.accepted_commercial_snapshot ? 'sales_tax_rate'
      then 'accepted_commercial_snapshot' else 'unavailable' end authoritative_snapshot_source
  from public.financial_entries f
  where f.type='income' and coalesce(f.finance_command_owned,false)
), assessed as (
  select *,round(taxable_amount*stored_rate/100,2) expected_tax_percentage,
    round(taxable_amount*stored_rate,2) expected_tax_decimal
  from effective
)
select entry_id,order_id,order_number,county,taxable_amount,stored_rate,stored_tax,
  expected_tax_percentage,expected_tax_decimal,authoritative_snapshot_source,
  case
    when stored_rate>0 and stored_rate<1 and stored_tax=expected_tax_decimal
      and stored_tax<>expected_tax_percentage and snapshot_rate=stored_rate*100
      then 'likely legacy decimal fraction'
    when stored_rate between 0 and 20 and stored_tax=expected_tax_percentage
      then 'canonical percentage point'
    else 'unresolved/ambiguous'
  end classification,
  case
    when stored_rate>0 and stored_rate<1 and stored_tax=expected_tax_decimal
      and stored_tax<>expected_tax_percentage and snapshot_rate=stored_rate*100
      then 'Create an append-only Finance correction using the confirmed snapshot rate.'
    else 'Review authoritative county and accepted snapshot evidence; do not change automatically.'
  end suggested_action
from assessed
where (stored_rate>0 and stored_rate<1)
   or stored_rate>20
   or (stored_tax is distinct from expected_tax_percentage)
   or (taxable_amount>0 and coalesce(stored_rate,0)=0 and stored_tax>0);

revoke all on public.sales_tax_rate_contract_candidates from public,anon;
grant select on public.sales_tax_rate_contract_candidates to authenticated,service_role;

-- Orders are operational records, unlike append-only Finance originals. This
-- guarded operator procedure repairs only rows proven by accepted snapshot rate
-- and tax evidence. It is deliberately not executed by this migration.
create table if not exists public.sales_tax_rate_repair_audit (
  id uuid primary key default gen_random_uuid(), order_id uuid not null,
  old_rate numeric not null,new_rate numeric not null,taxable_amount numeric not null,
  tax_amount numeric not null,snapshot_source text not null,repaired_at timestamptz not null default statement_timestamp(),
  unique(order_id,old_rate,new_rate)
);
alter table public.sales_tax_rate_repair_audit enable row level security;
revoke all on public.sales_tax_rate_repair_audit from public,anon,authenticated;
grant select,insert on public.sales_tax_rate_repair_audit to service_role;

create or replace function public.repair_proven_legacy_order_sales_tax_rates()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  with proven as (
    select o.id,o.sales_tax_rate old_rate,(t.totals->>'tax_rate')::numeric new_rate,
      o.taxable_subtotal,o.sales_tax_amount
    from public.orders o
    join lateral (
      select coalesce(s.snapshot->'invoice_totals',s.snapshot#>'{offer,quote_data,customer_totals}',s.snapshot#>'{offer,customer_totals}') totals
      from public.quote_accepted_commercial_snapshots s
      where s.user_id=o.user_id and (s.order_number=o.order_number or s.quote_number=o.source_quote_number)
      order by (s.order_number=o.order_number) desc limit 1
    ) t on jsonb_typeof(t.totals)='object'
    where o.sales_tax_rate>0 and o.sales_tax_rate<1
      and (t.totals->>'tax_rate')::numeric=o.sales_tax_rate*100
      and round(o.taxable_subtotal*o.sales_tax_rate,2)=round(o.sales_tax_amount,2)
      and round(o.taxable_subtotal*o.sales_tax_rate/100,2)<>round(o.sales_tax_amount,2)
  ), audited as (
    insert into public.sales_tax_rate_repair_audit(order_id,old_rate,new_rate,taxable_amount,tax_amount,snapshot_source)
    select id,old_rate,new_rate,taxable_subtotal,sales_tax_amount,'accepted quote invoice_totals' from proven
    on conflict do nothing returning order_id,new_rate
  )
  update public.orders o set sales_tax_rate=a.new_rate from audited a where o.id=a.order_id;
  get diagnostics v_count=row_count;
  return v_count;
end $$;
revoke all on function public.repair_proven_legacy_order_sales_tax_rates() from public,anon,authenticated;
grant execute on function public.repair_proven_legacy_order_sales_tax_rates() to service_role;

commit;
