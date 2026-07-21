-- Repository reconciliation for the manually repaired Finance column privilege deployment.
--
-- Operator evidence: migration 202607210005 deployed successfully after a manual CASE-expression
-- correction in append_finance_correction, then a Finance privilege defect was found and repaired
-- manually. The defect was table-level authenticated INSERT/UPDATE authority on financial_entries
-- after command-owned column revocation. This forward-only migration records the exact successful
-- privilege reconciliation in source control.
--
-- The operator already applied equivalent SQL manually in the deployed Supabase project.
-- Do not manually rerun this reconciliation SQL solely for deployment; keep this migration as the
-- idempotent repository-forward contract for already repaired and future sequential environments.
--
-- This migration does not change historical Finance rows, post historical Orders, reinterpret
-- duplicate candidates, or alter the known shipping inconsistency. Runtime browser tests remain
-- pending until exercised with deployed credentials.

begin;

alter table if exists public.financial_entries enable row level security;

-- Remove broad table-level browser mutation authority. These revokes are intentionally safe to
-- rerun in an already repaired deployment.
revoke insert, update on table public.financial_entries from public, anon, authenticated;

-- Preserve reviewed read/delete behavior for authenticated owners. Owner scope remains governed by
-- the existing financial_entries RLS policies; this migration only reconciles relation privileges.
grant select, delete on table public.financial_entries to authenticated;

-- Finance Pro still creates ordinary manual entries directly from the browser. Grant only the
-- reviewed manual-entry payload columns and exclude Finance command-owned columns.
grant insert(
  user_id,
  type,
  entry_date,
  category,
  tax_category,
  title,
  notes,
  amount,
  original_amount,
  vendor_name,
  payment_method,
  receipt_link,
  business_use_percent,
  miles_driven,
  mileage_rate,
  trip_purpose,
  trip_from,
  trip_to,
  round_trip,
  destination_county,
  sales_tax_collected,
  tax_exempt_sale,
  shipping_charged,
  tax_included,
  sales_tax_rate,
  shipping_cost,
  material_cost,
  packaging_cost,
  labor_cost,
  other_direct_cost
) on public.financial_entries to authenticated;

grant update(
  user_id,
  type,
  entry_date,
  category,
  tax_category,
  title,
  notes,
  amount,
  original_amount,
  vendor_name,
  payment_method,
  receipt_link,
  business_use_percent,
  miles_driven,
  mileage_rate,
  trip_purpose,
  trip_from,
  trip_to,
  round_trip,
  destination_county,
  sales_tax_collected,
  tax_exempt_sale,
  shipping_charged,
  tax_included,
  sales_tax_rate,
  shipping_cost,
  material_cost,
  packaging_cost,
  labor_cost,
  other_direct_cost
) on public.financial_entries to authenticated;

-- Explicitly preserve RPC and service-role authority from the prior Finance command migration.
-- SECURITY DEFINER command functions continue to own command-owned fields even though browser roles
-- cannot directly insert/update those columns.
grant execute on function public.post_order_finance_income(uuid,text,timestamptz,text) to authenticated, service_role;
grant execute on function public.append_finance_correction(uuid,text,numeric,text,text) to authenticated, service_role;

/*
Consolidated read-only JSONB verification query:
select jsonb_build_object(
  'captured_at', now(),
  'financial_entries_counts', (select jsonb_build_object(
    'rows', count(*),
    'authoritative_order_postings', count(*) filter (where finance_command = 'post_order_income'),
    'authoritative_corrections', count(*) filter (where finance_command = 'correct_entry'),
    'authoritative_reversals', count(*) filter (where finance_command = 'reverse_entry')
  ) from public.financial_entries),
  'table_privileges', jsonb_build_object(
    'anon_insert', has_table_privilege('anon','public.financial_entries','insert'),
    'anon_update', has_table_privilege('anon','public.financial_entries','update'),
    'anon_delete', has_table_privilege('anon','public.financial_entries','delete'),
    'authenticated_select', has_table_privilege('authenticated','public.financial_entries','select'),
    'authenticated_insert', has_table_privilege('authenticated','public.financial_entries','insert'),
    'authenticated_update', has_table_privilege('authenticated','public.financial_entries','update'),
    'authenticated_delete', has_table_privilege('authenticated','public.financial_entries','delete')
  ),
  'manual_column_privileges', jsonb_build_object(
    'authenticated_insert_title', has_column_privilege('authenticated','public.financial_entries','title','insert'),
    'authenticated_insert_amount', has_column_privilege('authenticated','public.financial_entries','amount','insert'),
    'authenticated_update_title', has_column_privilege('authenticated','public.financial_entries','title','update'),
    'authenticated_update_amount', has_column_privilege('authenticated','public.financial_entries','amount','update')
  ),
  'command_owned_column_privileges', jsonb_build_object(
    'authenticated_insert_order_id', has_column_privilege('authenticated','public.financial_entries','order_id','insert'),
    'authenticated_update_order_id', has_column_privilege('authenticated','public.financial_entries','order_id','update'),
    'authenticated_insert_finance_command_id', has_column_privilege('authenticated','public.financial_entries','finance_command_id','insert'),
    'authenticated_update_finance_command_id', has_column_privilege('authenticated','public.financial_entries','finance_command_id','update'),
    'authenticated_update_correction_of_entry_id', has_column_privilege('authenticated','public.financial_entries','correction_of_entry_id','update'),
    'authenticated_update_reversal_of_entry_id', has_column_privilege('authenticated','public.financial_entries','reversal_of_entry_id','update')
  ),
  'rpc_privileges', jsonb_build_object(
    'authenticated_post_order_finance_income', has_function_privilege('authenticated','public.post_order_finance_income(uuid,text,timestamptz,text)','execute'),
    'service_role_post_order_finance_income', has_function_privilege('service_role','public.post_order_finance_income(uuid,text,timestamptz,text)','execute'),
    'authenticated_append_finance_correction', has_function_privilege('authenticated','public.append_finance_correction(uuid,text,numeric,text,text)','execute'),
    'service_role_append_finance_correction', has_function_privilege('service_role','public.append_finance_correction(uuid,text,numeric,text,text)','execute')
  ),
  'operator_note', 'Equivalent SQL was already applied manually; do not rerun solely for deployment.',
  'runtime_status', 'live posting, retry, correction, reversal, concurrency, and browser tests pending'
) as finance_column_privilege_reconciliation_verification;
*/

commit;
