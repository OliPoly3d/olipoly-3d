-- Repair Orders Admin -> Finance posting when a verified accepted invoice snapshot
-- uses the legacy customer_totals contract, which has no separate shipping field.
-- This changes only the Finance insert normalization trigger. It does not rewrite
-- snapshots, Orders, or historical Finance entries and does not change grants/RLS.
begin;

create or replace function public.apply_invoice_authority_to_finance_post()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_snapshot jsonb;
  v_totals jsonb;
  v_final numeric;
  v_order_total numeric;
  v_shipping_charged numeric;
  v_shipping_explicit numeric;
  v_shipping_source text;
  v_complete boolean := false;
  v_numeric_pattern constant text := '^[0-9]+([.][0-9]+)?$';
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;

  select s.snapshot, o.order_total into v_snapshot, v_order_total
    from public.orders o
    left join public.quote_accepted_commercial_snapshots s
      on s.user_id=o.user_id and (s.order_number=o.order_number or s.quote_number=o.source_quote_number)
   where o.id=new.order_id and o.user_id=new.user_id
   order by (s.order_number=o.order_number) desc
   limit 1;

  if v_snapshot ? 'invoice_totals_schema_version' and v_snapshot->>'invoice_totals_schema_version'='1' then
    v_totals := v_snapshot->'invoice_totals';
  elsif v_snapshot is not null and not (v_snapshot ? 'invoice_totals_schema_version') then
    v_totals := coalesce(v_snapshot #> '{offer,quote_data,customer_totals}',v_snapshot #> '{offer,customer_totals}');
  end if;

  v_complete := jsonb_typeof(v_totals)='object'
    and v_totals ?& array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total']
    and (v_totals->>'final_total') ~ v_numeric_pattern;
  if v_complete then v_final := round((v_totals->>'final_total')::numeric,2); end if;

  if not (v_complete and v_order_total is not null and v_final=round(v_order_total::numeric,2)) then
    raise exception 'FINANCE_INVOICE_TOTALS_UNRESOLVED: authoritative invoice totals are unavailable or do not match the Order'
      using errcode='22023';
  end if;

  -- Shipping revenue priority is entirely server-side and snapshot-owned:
  --   1. invoice_totals.shipping_charged (new explicit contract),
  --   2. invoice_totals.shipping (older explicit line),
  --   3. zero only for the verified legacy customer_totals contract. Its required
  --      final_total is the documented subtotal plus tax and has no separate
  --      shipping component. Shipping production cost remains part of pricing and
  --      is never treated as customer shipping revenue or shipping_cost here.
  if v_totals ? 'shipping_charged' then
    if jsonb_typeof(v_totals->'shipping_charged') <> 'number'
       or (v_totals->>'shipping_charged') !~ v_numeric_pattern then
      raise exception 'FINANCE_SHIPPING_UNRESOLVED: authoritative shipping_charged is malformed or negative'
        using errcode='22023';
    end if;
    v_shipping_charged := (v_totals->>'shipping_charged')::numeric;
    v_shipping_source := 'invoice_totals.shipping_charged';
  end if;

  if v_totals ? 'shipping' then
    if jsonb_typeof(v_totals->'shipping') <> 'number'
       or (v_totals->>'shipping') !~ v_numeric_pattern then
      raise exception 'FINANCE_SHIPPING_UNRESOLVED: authoritative shipping is malformed or negative'
        using errcode='22023';
    end if;
    v_shipping_explicit := (v_totals->>'shipping')::numeric;
    if v_shipping_charged is not null and v_shipping_charged is distinct from v_shipping_explicit then
      raise exception 'FINANCE_SHIPPING_UNRESOLVED: authoritative shipping values contradict each other'
        using errcode='22023';
    end if;
    if v_shipping_charged is null then
      v_shipping_charged := v_shipping_explicit;
      v_shipping_source := 'invoice_totals.shipping';
    end if;
  end if;

  if v_shipping_charged is null then
    v_shipping_charged := 0;
    v_shipping_source := 'verified_legacy_totals_no_shipping_component';
  end if;

  new.sales_tax_collected := (v_totals->>'tax')::numeric;
  new.shipping_charged := v_shipping_charged;
  new.invoice_breakdown_status := 'verified';
  new.accepted_commercial_snapshot := coalesce(new.accepted_commercial_snapshot,'{}'::jsonb) || jsonb_build_object(
    'reconciliation_status','verified',
    'breakdown_source','immutable_accepted_commercial_snapshot',
    'accepted_commercial_breakdown',v_totals,
    'shipping_charged',v_shipping_charged,
    'shipping_charged_source',v_shipping_source);
  return new;
end $$;

comment on function public.apply_invoice_authority_to_finance_post() is
'Normalizes Order shipping revenue from verified immutable invoice totals before the Finance INSERT; never uses browser input or shipping_cost.';

revoke all on function public.apply_invoice_authority_to_finance_post() from public,anon,authenticated;
grant execute on function public.apply_invoice_authority_to_finance_post() to service_role;

commit;

-- Deployment verification (read-only):
-- select order_number, amount, sales_tax_collected, shipping_charged,
--        accepted_commercial_snapshot->>'shipping_charged_source' shipping_source,
--        finance_command_id, created_at
--   from public.financial_entries
--  where order_number='OP-000010' and finance_command='post_order_income';
