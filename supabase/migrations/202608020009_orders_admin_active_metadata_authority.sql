begin;

-- Orders Admin normal Save is intentionally limited to active, owner-scoped
-- descriptive metadata. Lifecycle, payment, invoice and Finance mutations remain
-- available only through their dedicated security-definer commands.
alter table public.orders enable row level security;

drop policy if exists orders_owner_update_active_metadata on public.orders;
create policy orders_owner_update_active_metadata
on public.orders
for update
to authenticated
using (user_id = auth.uid() and status not in ('closed', 'fulfilled', 'cancelled'))
with check (user_id = auth.uid() and status not in ('closed', 'fulfilled', 'cancelled'));

revoke update on table public.orders from anon, authenticated;
revoke update(
  order_number, quantity, order_total, deposit_amount, balance_amount,
  payment_status, payment_link, payment_link_stripe, payment_link_paypal,
  payment_link_venmo, stripe_invoice_id, paid_date, olipoly_part_number,
  part_revision, material, color, printer_profile, layer_height, nozzle_size,
  estimated_print_time, estimated_piece_price, production_notes,
  post_processing_notes, invoice_number, invoice_date, invoice_due_date,
  invoice_terms, finance_pushed, finance_pushed_at, invoice_sent,
  invoice_sent_at, updated_at
) on public.orders from authenticated;

grant update(
  order_date, customer_name, customer_email, customer_phone, order_title,
  fulfillment, tracking_number, po_number, tax_exempt, tax_exempt_reason,
  destination_county, sales_tax_rate, taxable_subtotal, sales_tax_amount,
  exemption_certificate_on_file, po_file_on_file, po_part_number,
  shipping_contact_name, shipping_company, ap_email, billing_address,
  shipping_address, internal_notes
) on public.orders to authenticated;

-- Keep modification time server-owned; the browser uses the prior value only as
-- an optimistic-concurrency filter.
create or replace function public.set_orders_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_orders_updated_at();

revoke all on function public.set_orders_updated_at() from public, anon, authenticated;
grant execute on function public.set_orders_updated_at() to service_role;

commit;
