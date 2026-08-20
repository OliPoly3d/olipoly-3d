begin;

-- Save only customer-document presentation metadata through the existing
-- owner-scoped, optimistic-concurrency command. Invoice identity, pricing,
-- payment state, lifecycle, Finance, and audit fields remain protected.
alter table public.orders enable row level security;
revoke update on table public.orders from public, anon, authenticated;

create or replace function public.update_order_metadata(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb
)
returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_allowed constant text[] := array[
    'order_date','customer_name','customer_email','customer_phone','order_title',
    'fulfillment','tracking_number','po_number','tax_exempt','tax_exempt_reason',
    'destination_county','sales_tax_rate','exemption_certificate_on_file',
    'po_file_on_file','po_part_number','shipping_contact_name','shipping_company',
    'ap_email','billing_address','shipping_address','shipping_or_pickup_note',
    'invoice_date','invoice_due_date','invoice_terms','olipoly_part_number',
    'part_revision','internal_notes'
  ];
  v_rejected text[];
begin
  if v_actor is null then
    raise exception 'Authenticated order owner is required'
      using errcode = '42501', detail = 'update_order_metadata requires auth.uid()', hint = 'Sign in and retry.';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Order metadata changes must be a JSON object' using errcode = '22023';
  end if;

  select array_agg(key order by key) into v_rejected
  from jsonb_object_keys(p_changes) as key
  where not (key = any(v_allowed));
  if v_rejected is not null then
    raise exception 'Protected order fields cannot be changed through normal Save'
      using errcode = '22023', detail = 'Rejected keys: ' || array_to_string(v_rejected, ', '), hint = 'Use the owning lifecycle, payment, invoice, or Finance command.';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and user_id = v_actor for update;
  if not found then
    raise exception 'Order not found for authenticated owner'
      using errcode = '42501', detail = 'The order ID is not owned by auth.uid().', hint = 'Do not retry this request.';
  end if;
  if lower(coalesce(v_order.status, '')) in ('closed','fulfilled','cancelled','canceled') then
    raise exception 'This order is closed and cannot be edited'
      using errcode = '55000', detail = 'Closed, fulfilled, and cancelled orders are immutable through normal Save.';
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'Order changed after it was loaded'
      using errcode = '40001', detail = 'The expected updated_at value no longer matches.', hint = 'Refresh before retrying.';
  end if;

  update public.orders set
    order_date = case when p_changes ? 'order_date' then (p_changes->>'order_date')::date else order_date end,
    customer_name = case when p_changes ? 'customer_name' then p_changes->>'customer_name' else customer_name end,
    customer_email = case when p_changes ? 'customer_email' then p_changes->>'customer_email' else customer_email end,
    customer_phone = case when p_changes ? 'customer_phone' then p_changes->>'customer_phone' else customer_phone end,
    order_title = case when p_changes ? 'order_title' then p_changes->>'order_title' else order_title end,
    fulfillment = case when p_changes ? 'fulfillment' then p_changes->>'fulfillment' else fulfillment end,
    tracking_number = case when p_changes ? 'tracking_number' then p_changes->>'tracking_number' else tracking_number end,
    po_number = case when p_changes ? 'po_number' then p_changes->>'po_number' else po_number end,
    tax_exempt = case when p_changes ? 'tax_exempt' then (p_changes->>'tax_exempt')::boolean else tax_exempt end,
    tax_exempt_reason = case when p_changes ? 'tax_exempt_reason' then p_changes->>'tax_exempt_reason' else tax_exempt_reason end,
    destination_county = case when p_changes ? 'destination_county' then p_changes->>'destination_county' else destination_county end,
    sales_tax_rate = case when p_changes ? 'sales_tax_rate' then (p_changes->>'sales_tax_rate')::numeric else sales_tax_rate end,
    exemption_certificate_on_file = case when p_changes ? 'exemption_certificate_on_file' then (p_changes->>'exemption_certificate_on_file')::boolean else exemption_certificate_on_file end,
    po_file_on_file = case when p_changes ? 'po_file_on_file' then (p_changes->>'po_file_on_file')::boolean else po_file_on_file end,
    po_part_number = case when p_changes ? 'po_part_number' then p_changes->>'po_part_number' else po_part_number end,
    shipping_contact_name = case when p_changes ? 'shipping_contact_name' then p_changes->>'shipping_contact_name' else shipping_contact_name end,
    shipping_company = case when p_changes ? 'shipping_company' then p_changes->>'shipping_company' else shipping_company end,
    ap_email = case when p_changes ? 'ap_email' then p_changes->>'ap_email' else ap_email end,
    billing_address = case when p_changes ? 'billing_address' then p_changes->>'billing_address' else billing_address end,
    shipping_address = case when p_changes ? 'shipping_address' then p_changes->>'shipping_address' else shipping_address end,
    shipping_or_pickup_note = case when p_changes ? 'shipping_or_pickup_note' then p_changes->>'shipping_or_pickup_note' else shipping_or_pickup_note end,
    invoice_date = case when p_changes ? 'invoice_date' then nullif(p_changes->>'invoice_date','')::date else invoice_date end,
    invoice_due_date = case when p_changes ? 'invoice_due_date' then nullif(p_changes->>'invoice_due_date','')::date else invoice_due_date end,
    invoice_terms = case when p_changes ? 'invoice_terms' then p_changes->>'invoice_terms' else invoice_terms end,
    olipoly_part_number = case when p_changes ? 'olipoly_part_number' then p_changes->>'olipoly_part_number' else olipoly_part_number end,
    part_revision = case when p_changes ? 'part_revision' then p_changes->>'part_revision' else part_revision end,
    internal_notes = case when p_changes ? 'internal_notes' then p_changes->>'internal_notes' else internal_notes end
  where id = v_order.id returning * into v_order;

  return next v_order;
end;
$$;

revoke all on function public.update_order_metadata(uuid,timestamptz,jsonb) from public, anon;
grant execute on function public.update_order_metadata(uuid,timestamptz,jsonb) to authenticated, service_role;

commit;
