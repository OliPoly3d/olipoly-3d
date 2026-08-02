-- Canonical owner-scoped Finance reporting projection.
-- Original ledger rows remain immutable; correction receipts provide the current
-- effective snapshot without contributing another monetary transaction.
begin;

create or replace function public.get_effective_financial_entries()
returns setof jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    to_jsonb(root)
    || coalesce(receipt.effective_record, '{}'::jsonb)
    || jsonb_build_object(
      'id', root.id,
      'original_entry_id', root.id,
      'effective_entry_id', coalesce(receipt.effective_entry_id, root.id),
      'correction_group_id', receipt.correction_group_id,
      'correction_kind', receipt.correction_kind,
      'correction_status', case when receipt.command_identity is null then 'original' else 'active' end,
      'is_corrected', receipt.command_identity is not null,
      'correction_command_identity', receipt.command_identity,
      'metadata_correction_entry_id', receipt.metadata_entry_id,
      'reversal_entry_id', receipt.reversal_entry_id,
      'replacement_entry_id', receipt.replacement_entry_id,
      'correction_reason', receipt.reason,
      'changed_fields', coalesce(receipt.changed_fields, '{}'::jsonb),
      'correction_history', coalesce(history.items, '[]'::jsonb),
      'effective_version_at', coalesce(receipt.created_at, root.posted_at, root.created_at),
      'report_transaction_count', 1
    )
  from public.financial_entries root
  left join lateral (
    select r.*
    from public.finance_correction_receipts r
    where r.owner_id = auth.uid()
      and r.original_entry_id = root.id
      and coalesce(r.effective_record->>'correction_status', 'active') <> 'voided'
    order by r.created_at desc, r.command_identity desc
    limit 1
  ) receipt on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'command_identity', r.command_identity,
      'correction_group_id', r.correction_group_id,
      'correction_kind', r.correction_kind,
      'metadata_entry_id', r.metadata_entry_id,
      'reversal_entry_id', r.reversal_entry_id,
      'replacement_entry_id', r.replacement_entry_id,
      'reason', r.reason,
      'changed_fields', r.changed_fields,
      'created_at', r.created_at,
      'status', coalesce(r.effective_record->>'correction_status', 'active')
    ) order by r.created_at, r.command_identity) as items
    from public.finance_correction_receipts r
    where r.owner_id = auth.uid()
      and r.original_entry_id = root.id
  ) history on true
  where auth.uid() is not null
    and root.user_id = auth.uid()
    and root.correction_of_entry_id is null
    and root.reversal_of_entry_id is null
    and root.replacement_for_entry_id is null
  order by root.entry_date desc, root.created_at desc, root.id;
$$;

revoke all on function public.get_effective_financial_entries() from public, anon;
grant execute on function public.get_effective_financial_entries() to authenticated, service_role;
comment on function public.get_effective_financial_entries() is
  'One owner-scoped effective Finance transaction per immutable original. Latest active cumulative correction snapshot wins; correction ledger rows never add report count or money.';

commit;
