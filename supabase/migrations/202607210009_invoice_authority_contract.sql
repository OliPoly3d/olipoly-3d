-- RC5.4 invoice authority contract.  This migration defines functions only and never
-- rewrites accepted snapshots, Orders, or historical Finance entries.
-- Financial authority: immutable accepted commercial terms provide the original
-- breakdown; the current owner-scoped Order provides payment and fulfillment state.
-- Versioned snapshot totals take precedence over legacy offer.quote_data.customer_totals.
-- Legacy Orders retain truthful aggregates. Reconciliation is explicit and customer
-- documents must block malformed, unsupported, or mismatched snapshots.
begin;

create or replace function public.version_accepted_invoice_totals()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_customer_totals jsonb := coalesce(new.snapshot #> '{offer,quote_data,customer_totals}', new.snapshot #> '{offer,customer_totals}');
  v_complete boolean;
begin
  v_complete := jsonb_typeof(v_customer_totals) = 'object'
    and v_customer_totals ?& array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total'];
  if v_complete then
    -- Copy already-calculated Quote values. This trigger is deliberately not a calculator.
    new.snapshot := new.snapshot || jsonb_build_object(
      'invoice_totals_schema_version', 1,
      'invoice_totals', v_customer_totals,
      'totals', coalesce(new.snapshot->'totals','{}'::jsonb) || v_customer_totals
    );
  end if;
  return new;
end $$;

drop trigger if exists quote_accepted_snapshots_version_invoice_totals on public.quote_accepted_commercial_snapshots;
create trigger quote_accepted_snapshots_version_invoice_totals
before insert on public.quote_accepted_commercial_snapshots
for each row execute function public.version_accepted_invoice_totals();

create or replace function public.get_order_invoice_snapshot(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_snapshot jsonb;
  v_totals jsonb;
  v_version integer;
  v_source text;
  v_status text;
  v_final numeric;
  v_order_total numeric;
  v_balance numeric;
  v_amount_paid numeric;
  v_complete boolean := false;
  v_numeric_pattern constant text := '^-?[0-9]+([.][0-9]+)?$';
begin
  if v_actor is null then raise exception 'Authenticated owner is required' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id and user_id=v_actor;
  if not found then raise exception 'Order not found for authenticated owner' using errcode='42501'; end if;

  select s.snapshot into v_snapshot
    from public.quote_accepted_commercial_snapshots s
   where s.user_id=v_actor and (s.order_number=v_order.order_number or s.quote_number=v_order.source_quote_number)
   order by (s.order_number=v_order.order_number) desc limit 1;

  if v_snapshot is null then
    v_status := 'missing_snapshot'; v_source := 'order_aggregates';
  elsif v_snapshot ? 'invoice_totals_schema_version' then
    if (v_snapshot->>'invoice_totals_schema_version') !~ '^[0-9]+$' or (v_snapshot->>'invoice_totals_schema_version')::integer <> 1 then
      v_status := 'unsupported_snapshot'; v_source := 'versioned_accepted_snapshot';
    else
      v_version := 1; v_totals := v_snapshot->'invoice_totals'; v_source := 'versioned_accepted_snapshot';
    end if;
  else
    v_totals := coalesce(v_snapshot #> '{offer,quote_data,customer_totals}', v_snapshot #> '{offer,customer_totals}');
    v_source := 'legacy_offer_quote_data_customer_totals';
  end if;

  if v_status is null then
    v_complete := jsonb_typeof(v_totals)='object' and v_totals ?& array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total'];
    if not v_complete then
      v_status := case when jsonb_typeof(v_totals)='object' then 'aggregate_only' else 'malformed_snapshot' end;
    elsif (v_totals->>'final_total') !~ v_numeric_pattern then
      v_status := 'malformed_snapshot';
    else
      v_final := round((v_totals->>'final_total')::numeric,2);
      v_order_total := case when v_order.order_total is null then null else round(v_order.order_total::numeric,2) end;
      v_status := case when v_order_total is null or v_final <> v_order_total then 'totals_mismatch' else 'verified' end;
    end if;
  end if;

  v_balance := v_order.balance_amount;
  if v_order.order_total is not null and v_balance is not null
     and v_balance between 0 and v_order.order_total then
    v_amount_paid := v_order.order_total-v_balance;
  end if;

  return jsonb_build_object(
    'reconciliation_status',v_status,'breakdown_source',v_source,'invoice_totals_schema_version',v_version,
    'identity',jsonb_strip_nulls(jsonb_build_object(
      'order_id',v_order.id,'order_number',v_order.order_number,'invoice_number',v_order.invoice_number,
      'quote_number',v_order.source_quote_number,'customer_name',v_order.customer_name,'customer_email',v_order.customer_email,
      'company_name',v_order.shipping_company,'billing_address',v_order.billing_address,'shipping_address',v_order.shipping_address,
      'project_title',v_order.order_title,'fulfillment_method',v_order.fulfillment,'issue_date',v_order.invoice_date,
      'due_date',v_order.invoice_due_date,'tax_exempt',v_order.tax_exempt,'tracking_number',v_order.tracking_number)),
    'accepted_commercial_breakdown',case when v_complete then v_totals else null end,
    'current_payment_state',jsonb_build_object(
      'order_total',v_order.order_total,'deposit_amount',v_order.deposit_amount,'balance_amount',v_order.balance_amount,
      'payment_status',v_order.payment_status,'paid_date',v_order.paid_date,'invoice_number',v_order.invoice_number,
      'amount_paid',v_amount_paid,'amount_paid_source',case when v_amount_paid is null then null else 'derived_from_order_total_and_balance' end),
    'component_breakdown_available',v_status='verified'
  );
end $$;

comment on function public.get_order_invoice_snapshot(uuid) is
'Owner-authorized read-only invoice contract: immutable accepted offer plus current Order/payment state. No pricing is calculated and no data is mutated.';
revoke all on function public.get_order_invoice_snapshot(uuid) from public, anon;
grant execute on function public.get_order_invoice_snapshot(uuid) to authenticated, service_role;
revoke all on function public.version_accepted_invoice_totals() from public, anon, authenticated;
grant execute on function public.version_accepted_invoice_totals() to service_role;

-- Honest availability metadata for future Finance posts; historical rows are untouched.
alter table if exists public.financial_entries add column if not exists invoice_breakdown_status text;


create or replace function public.apply_invoice_authority_to_finance_post()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_snapshot jsonb;
  v_totals jsonb;
  v_final numeric;
  v_order_total numeric;
  v_complete boolean := false;
begin
  if new.finance_command is distinct from 'post_order_income' or new.order_id is null then return new; end if;
  select s.snapshot, o.order_total into v_snapshot, v_order_total
    from public.orders o
    left join public.quote_accepted_commercial_snapshots s
      on s.user_id=o.user_id and (s.order_number=o.order_number or s.quote_number=o.source_quote_number)
   where o.id=new.order_id and o.user_id=new.user_id limit 1;
  if v_snapshot ? 'invoice_totals_schema_version' and v_snapshot->>'invoice_totals_schema_version'='1' then
    v_totals := v_snapshot->'invoice_totals';
  elsif not (v_snapshot ? 'invoice_totals_schema_version') then
    v_totals := coalesce(v_snapshot #> '{offer,quote_data,customer_totals}',v_snapshot #> '{offer,customer_totals}');
  end if;
  v_complete := jsonb_typeof(v_totals)='object'
    and v_totals ?& array['quantity','subtotal','discount','taxable_subtotal','tax_rate','tax','deposit','balance','final_total']
    and (v_totals->>'final_total') ~ '^-?[0-9]+([.][0-9]+)?$';
  if v_complete then
    v_final := round((v_totals->>'final_total')::numeric,2);
  end if;
  if v_complete and v_order_total is not null and v_final=round(v_order_total::numeric,2) then
    new.sales_tax_collected := (v_totals->>'tax')::numeric;
    new.shipping_charged := case when v_totals ? 'shipping' and (v_totals->>'shipping') ~ '^-?[0-9]+([.][0-9]+)?$' then (v_totals->>'shipping')::numeric else null end;
    new.invoice_breakdown_status := 'verified';
  else
    -- Unknown is NULL, never a fabricated zero. Aggregate amount remains authoritative.
    new.sales_tax_collected := null;
    new.shipping_charged := null;
    new.invoice_breakdown_status := case when v_snapshot is null then 'missing_snapshot' when v_complete then 'totals_mismatch' else 'aggregate_only' end;
  end if;
  new.accepted_commercial_snapshot := coalesce(new.accepted_commercial_snapshot,'{}'::jsonb) || jsonb_build_object(
    'reconciliation_status',new.invoice_breakdown_status,'breakdown_source','immutable_accepted_commercial_snapshot',
    'accepted_commercial_breakdown',case when v_complete then v_totals else null end);
  return new;
end $$;

drop trigger if exists financial_entries_invoice_authority on public.financial_entries;
create trigger financial_entries_invoice_authority before insert on public.financial_entries
for each row execute function public.apply_invoice_authority_to_finance_post();
revoke all on function public.apply_invoice_authority_to_finance_post() from public,anon,authenticated;
grant execute on function public.apply_invoice_authority_to_finance_post() to service_role;

commit;

-- Read-only verification / historical audit (run after deployment):
-- select has_function_privilege('anon','public.get_order_invoice_snapshot(uuid)','execute') anon_execute,
--        has_function_privilege('authenticated','public.get_order_invoice_snapshot(uuid)','execute') authenticated_execute;
-- select id,order_number,sales_tax_collected,shipping_charged,invoice_breakdown_status
--   from public.financial_entries where finance_command='post_order_income'
--   and (invoice_breakdown_status is null or accepted_commercial_snapshot->>'reconciliation_status' is distinct from 'verified');
-- Rollback (does not touch data): revoke execute on function public.get_order_invoice_snapshot(uuid) from authenticated,service_role;
-- drop function public.get_order_invoice_snapshot(uuid); drop trigger quote_accepted_snapshots_version_invoice_totals on public.quote_accepted_commercial_snapshots;
-- drop function public.version_accepted_invoice_totals(); The nullable metadata column may safely remain.
