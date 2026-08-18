-- Restore the guarded manual-entry update command expected by Finance Pro.
-- Scope is intentionally narrow: owner-created manual income/expense rows only.
-- Order/command-owned postings and correction rows remain immutable.
begin;

create or replace function public.update_manual_financial_entry(
  p_entry_id uuid,
  p_entry jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_entry public.financial_entries%rowtype;
  v_type text;
  v_amount numeric;
  v_original numeric;
begin
  if v_actor is null then
    raise exception 'Authenticated Finance operator is required' using errcode = '42501';
  end if;

  if p_entry_id is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception 'Manual Finance entry payload is required' using errcode = '22023';
  end if;

  v_type := lower(btrim(coalesce(p_entry->>'type', '')));
  v_amount := public.finance_adjustment_value(p_entry, 'amount');
  v_original := public.finance_adjustment_value(p_entry, 'original_amount');

  perform public.finance_adjustment_value(p_entry, k)
  from unnest(array[
    'business_use_percent', 'miles_driven', 'mileage_rate', 'sales_tax_collected',
    'shipping_charged', 'sales_tax_rate', 'shipping_cost', 'material_cost',
    'packaging_cost', 'labor_cost', 'other_direct_cost'
  ]) k;

  if v_type not in ('income', 'expense')
     or v_amount < 0
     or v_original < 0
     or nullif(btrim(p_entry->>'title'), '') is null
     or nullif(btrim(p_entry->>'category'), '') is null then
    raise exception 'Manual Finance entry is invalid' using errcode = '22023';
  end if;

  update public.financial_entries
  set
    type = v_type,
    entry_date = (p_entry->>'entry_date')::date,
    category = p_entry->>'category',
    tax_category = p_entry->>'tax_category',
    title = p_entry->>'title',
    notes = coalesce(p_entry->>'notes', ''),
    amount = coalesce(v_amount, 0),
    original_amount = coalesce(v_original, 0),
    vendor_name = coalesce(p_entry->>'vendor_name', ''),
    payment_method = coalesce(p_entry->>'payment_method', ''),
    receipt_link = coalesce(p_entry->>'receipt_link', ''),
    business_use_percent = coalesce((p_entry->>'business_use_percent')::numeric, 100),
    miles_driven = coalesce((p_entry->>'miles_driven')::numeric, 0),
    mileage_rate = coalesce((p_entry->>'mileage_rate')::numeric, 0),
    trip_purpose = coalesce(p_entry->>'trip_purpose', ''),
    trip_from = coalesce(p_entry->>'trip_from', ''),
    trip_to = coalesce(p_entry->>'trip_to', ''),
    round_trip = coalesce((p_entry->>'round_trip')::boolean, false),
    destination_county = coalesce(p_entry->>'destination_county', ''),
    sales_tax_collected = coalesce((p_entry->>'sales_tax_collected')::numeric, 0),
    tax_exempt_sale = coalesce((p_entry->>'tax_exempt_sale')::boolean, false),
    shipping_charged = coalesce((p_entry->>'shipping_charged')::numeric, 0),
    tax_included = 'no',
    sales_tax_rate = coalesce((p_entry->>'sales_tax_rate')::numeric, 0),
    shipping_cost = coalesce((p_entry->>'shipping_cost')::numeric, 0),
    material_cost = coalesce((p_entry->>'material_cost')::numeric, 0),
    packaging_cost = coalesce((p_entry->>'packaging_cost')::numeric, 0),
    labor_cost = coalesce((p_entry->>'labor_cost')::numeric, 0),
    other_direct_cost = coalesce((p_entry->>'other_direct_cost')::numeric, 0)
  where id = p_entry_id
    and user_id = v_actor
    and not coalesce(finance_command_owned, false)
    and finance_command_id is null
    and finance_command is null
    and order_id is null
    and order_number is null
    and posted_by is null
    and posted_at is null
    and correction_of_entry_id is null
    and reversal_of_entry_id is null
    and replacement_for_entry_id is null
    and correction_group_id is null
    and correction_kind is null
  returning * into v_entry;

  if not found then
    raise exception 'Manual Finance entry was not found or is not editable' using errcode = '42501';
  end if;

  return jsonb_build_object('entry_id', v_entry.id, 'entry', to_jsonb(v_entry));
end
$function$;

revoke all on function public.update_manual_financial_entry(uuid, jsonb) from public, anon;
grant execute on function public.update_manual_financial_entry(uuid, jsonb) to authenticated, service_role;

comment on function public.update_manual_financial_entry(uuid, jsonb) is
  'Updates only the authenticated owner''s ordinary manual Finance entry. Command-owned postings and correction rows remain immutable.';

commit;
