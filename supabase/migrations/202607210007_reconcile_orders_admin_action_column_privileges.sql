-- Reconcile Orders Admin action column privileges.
-- Forward-only corrective migration for visible Orders Admin actions audited after
-- workflow authority locked ordinary browser updates to a narrow column set.
--
-- Does not grant UPDATE on identity, workflow-owned status, source Quote linkage,
-- accepted commercial snapshots, finance command-owned fields, or public tracking
-- projection fields. Codex must not deploy this migration.

revoke update(user_id, status, source_quote_number, created_from_quote, accepted_date, accepted_commercial_snapshot, public_status_text, public_next_step, shipping_or_pickup_note, finance_pushed, finance_pushed_at)
on public.orders from authenticated;

grant update(completion_email_sent, completion_email_sent_at, catalog_part_id)
on public.orders to authenticated;

select jsonb_build_object(
  'migration', '202607210007_reconcile_orders_admin_action_column_privileges',
  'authenticated_update_user_id', has_column_privilege('authenticated','public.orders','user_id','update'),
  'authenticated_update_status', has_column_privilege('authenticated','public.orders','status','update'),
  'authenticated_update_source_quote_number', has_column_privilege('authenticated','public.orders','source_quote_number','update'),
  'authenticated_update_public_status_text', has_column_privilege('authenticated','public.orders','public_status_text','update'),
  'authenticated_update_finance_pushed', has_column_privilege('authenticated','public.orders','finance_pushed','update'),
  'authenticated_update_completion_email_sent', has_column_privilege('authenticated','public.orders','completion_email_sent','update'),
  'authenticated_update_completion_email_sent_at', has_column_privilege('authenticated','public.orders','completion_email_sent_at','update'),
  'authenticated_update_catalog_part_id', has_column_privilege('authenticated','public.orders','catalog_part_id','update')
) as orders_admin_action_privilege_reconciliation_verification;
