-- Synthetic contract fixture only. No production data or credentials.
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.orders(
 id uuid primary key,user_id uuid,order_number text,source_quote_number text,quantity integer,
 order_total numeric,deposit_amount numeric,balance_amount numeric,payment_status text,status text,
 updated_at timestamptz,paid_date date,finance_pushed boolean default false,
 taxable_subtotal numeric,sales_tax_rate numeric,sales_tax_amount numeric,destination_county text,
 tax_exempt boolean default false,tax_exempt_reason text,exemption_certificate_on_file boolean,
 invoice_number text,customer_name text,customer_email text,shipping_company text,billing_address text,
 shipping_address text,order_title text,fulfillment text,invoice_date date,invoice_due_date date,tracking_number text
);
create table public.quote_accepted_commercial_snapshots(user_id uuid,order_number text,quote_number text,snapshot jsonb);
create table public.order_tracking_public(
 user_id uuid,order_number text,order_title text,status text,payment_status text,order_total numeric,
 public_status_text text,public_next_step text,shipping_or_pickup_note text,tracking_number text,
 payment_link text,payment_link_stripe text,payment_link_paypal text,payment_link_venmo text,
 paid_date date,po_number text,invoice_number text,invoice_terms text,updated_at timestamptz
);
create table public.financial_entries(
 id uuid primary key default gen_random_uuid(),user_id uuid,order_id uuid,order_number text,finance_command text,
 sales_tax_collected numeric,shipping_charged numeric,invoice_breakdown_status text,accepted_commercial_snapshot jsonb,
 sales_county text,sales_tax_rate numeric,tax_exempt_sale boolean,amount numeric,original_amount numeric
);
alter table public.financial_entries
 add column type text default 'income', add column entry_date date default current_date,
 add column category text default 'Sales', add column tax_category text default 'auto',
 add column title text default 'Order', add column notes text,
 add column finance_command_owned boolean default true, add column finance_command_id text,
 add column correction_of_entry_id uuid, add column reversal_of_entry_id uuid,
 add column replacement_for_entry_id uuid, add column correction_group_id uuid,
 add column correction_kind text, add column correction_reason text,
 add column posted_by uuid, add column posted_at timestamptz default now(), add column created_at timestamptz default now(),
 add column vendor_name text, add column payment_method text, add column receipt_link text,
 add column business_use_percent numeric default 100, add column tax_included text,
 add column shipping_cost numeric default 0, add column material_cost numeric default 0,
 add column packaging_cost numeric default 0, add column labor_cost numeric default 0,
 add column other_direct_cost numeric default 0, add column miles_driven numeric default 0,
 add column mileage_rate numeric default 0, add column trip_purpose text,
 add column trip_from text, add column trip_to text, add column round_trip boolean;
create table public.finance_correction_receipts(
 command_identity text primary key, owner_id uuid, original_entry_id uuid, effective_entry_id uuid,
 correction_group_id uuid, correction_kind text, metadata_entry_id uuid, reversal_entry_id uuid,
 replacement_entry_id uuid, reason text, changed_fields jsonb, effective_record jsonb, created_at timestamptz
);
create function public.prevent_quote_accepted_snapshot_mutation() returns trigger language plpgsql as $$ begin raise exception 'accepted commercial snapshots are immutable'; end $$;
create function public.is_ohio_county(text) returns boolean language sql as $$select $1='Portage'$$;
create function public.public_order_tracking_lookup(text) returns jsonb language sql as $$select '{}'::jsonb$$;
create function public.touch_order_pricing_fixture() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
create trigger fixture_updated_at before update on public.orders for each row execute function public.touch_order_pricing_fixture();
