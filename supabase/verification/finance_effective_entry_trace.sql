-- Read-only trace for OP-000010. Run as the owning authenticated user.
with original as (
  select *
  from public.financial_entries
  where user_id = auth.uid()
    and order_number = 'OP-000010'
    and correction_of_entry_id is null
    and reversal_of_entry_id is null
    and replacement_for_entry_id is null
), corrections as (
  select r.*
  from public.finance_correction_receipts r
  join original o on o.id = r.original_entry_id
), effective as (
  select effective_row as row
  from public.get_effective_financial_entries() effective_row
  where effective_row->>'order_number' = 'OP-000010'
)
select
  o.id as original_entry_id,
  o.destination_county as original_county,
  o.sales_tax_rate as original_rate,
  c.metadata_entry_id,
  c.correction_group_id,
  c.correction_kind,
  c.changed_fields,
  c.effective_record->>'destination_county' as corrected_county,
  (c.effective_record->>'sales_tax_rate')::numeric as corrected_rate,
  e.row->>'destination_county' as effective_county,
  (e.row->>'sales_tax_rate')::numeric as effective_rate,
  (e.row->>'taxable_sales')::numeric as effective_taxable_sales,
  (e.row->>'sales_tax_collected')::numeric as effective_tax_collected,
  (e.row->>'report_transaction_count')::integer as effective_transaction_count,
  e.row->>'correction_status' as correction_status,
  e.row->>'effective_entry_id' as effective_entry_id
from original o
left join corrections c on true
cross join effective e
order by c.created_at;
