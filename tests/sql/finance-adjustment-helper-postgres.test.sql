\set ON_ERROR_STOP on

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.financial_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  type text, entry_date date, category text, tax_category text, title text, notes text,
  amount numeric, original_amount numeric, vendor_name text, payment_method text,
  receipt_link text, business_use_percent numeric, miles_driven numeric,
  mileage_rate numeric, trip_purpose text, trip_from text, trip_to text, round_trip boolean,
  sales_county text, sales_tax_collected numeric, tax_exempt_sale boolean,
  tax_included text, sales_tax_rate numeric, shipping_charged numeric, shipping_cost numeric,
  material_cost numeric, packaging_cost numeric, labor_cost numeric, other_direct_cost numeric,
  order_id uuid, order_number text, finance_command_id text, finance_command text,
  finance_command_owned boolean, correction_of_entry_id uuid, reversal_of_entry_id uuid,
  replacement_for_entry_id uuid, posted_by uuid, posted_at timestamptz, created_at timestamptz default statement_timestamp(),
  correction_reason text, correction_group_id uuid, correction_kind text,
  accepted_commercial_snapshot jsonb default '{}'::jsonb
);
create table public.finance_correction_receipts (
  command_identity text primary key, owner_id uuid not null, original_entry_id uuid not null,
  effective_entry_id uuid not null, correction_group_id uuid not null,
  correction_kind text not null, metadata_entry_id uuid, reversal_entry_id uuid,
  replacement_entry_id uuid, reason text not null, changed_fields jsonb not null,
  effective_record jsonb not null, created_at timestamptz not null
);

\ir ../../supabase/migrations/202608020003_repair_finance_adjustment_helper_resolution.sql
\ir ../../supabase/migrations/202608020004_restore_ohio_county_validator.sql

select public.is_ohio_county('Portage') as portage_is_valid;
select public.is_ohio_county('Summit') as summit_is_valid;
select public.is_ohio_county('FakeCounty') as fake_county_is_valid;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
insert into public.financial_entries(
  id,user_id,type,entry_date,category,tax_category,title,notes,amount,original_amount,
  business_use_percent,sales_county,sales_tax_rate,sales_tax_collected,tax_exempt_sale,
  tax_included,shipping_charged,shipping_cost,material_cost,packaging_cost,labor_cost,
  other_direct_cost,miles_driven,mileage_rate,finance_command_id,finance_command,
  finance_command_owned,posted_by,posted_at,created_at,accepted_commercial_snapshot
) values (
  '00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000010',
  'income','2026-08-01','Sale','income_sales','OP-000010','fixture',20.50,20.50,
  100,null,6.5,1.33,false,'no',0,0,0,0,0,0,0,0,'op-000010','post_order_income',
  true,'00000000-0000-0000-0000-000000000010','2026-08-01 12:00:00+00','2026-08-01 12:00:00+00','{}'
);

create temporary table correction_result as
select public.correct_financial_entry(
  f.id,
  to_jsonb(f) || jsonb_build_object('sales_county','Portage'),
  array['sales_county']::text[],
  'Correct missing county',
  f.posted_at,
  false,
  null::text,
  'op-000010:county'
) result
from public.financial_entries f where f.finance_command_id='op-000010';

do $$
declare v_result jsonb; v_effective jsonb;
begin
  select result into v_result from correction_result;
  if v_result->>'correction_kind' <> 'metadata_only' then raise exception 'expected metadata_only: %',v_result; end if;
  if v_result->>'reversal_entry_id' is not null or v_result->>'replacement_entry_id' is not null then raise exception 'unexpected monetary correction: %',v_result; end if;
  select effective_record into v_effective from public.finance_correction_receipts where command_identity='op-000010:county';
  if v_effective->>'sales_county' <> 'Portage' or (v_effective->>'amount')::numeric <> 20.50
     or (v_effective->>'sales_tax_rate')::numeric <> 6.5 or (v_effective->>'sales_tax_collected')::numeric <> 1.33 then
    raise exception 'canonical effective values changed incorrectly: %',v_effective;
  end if;
  if (select count(*) from public.financial_entries where reversal_of_entry_id is not null or replacement_for_entry_id is not null) <> 0 then raise exception 'metadata correction created reversal/replacement'; end if;
  if (select sales_county is not null or amount<>20.50 or sales_tax_collected<>1.33 from public.financial_entries where finance_command_id='op-000010') then raise exception 'original mutated'; end if;
end $$;

-- Unknown keys are a stable validation failure, not an overload-resolution error.
do $$ begin
  perform public.finance_adjustment_value('{"gross_sales":1}'::jsonb,'gross_sales'::text);
  raise exception 'unknown adjustment key unexpectedly accepted';
exception when sqlstate '22023' then
  if sqlerrm not like 'Unknown Finance adjustment key:%' then raise; end if;
end $$;
