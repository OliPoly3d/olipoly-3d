-- P0 Finance control: browser-editable manual rows must not make posted ledger rows mutable.
-- Forward-only. No rows are rewritten and correction/posting semantics are unchanged.
begin;

alter table public.financial_entries enable row level security;

-- Remove every permissive UPDATE/DELETE path currently applicable to authenticated users.
-- Policy names differ between the original dashboard-created schema and sequential environments,
-- so identify the applicable policies from the catalog rather than guessing their names.
do $migration$
declare v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'financial_entries'
      and cmd in ('UPDATE', 'DELETE', 'ALL')
      and (roles && array['authenticated'::name] or roles && array['public'::name])
  loop
    execute format('drop policy %I on public.financial_entries', v_policy.policyname);
  end loop;
end
$migration$;

-- Preserve the read and ordinary-manual-create portions of any removed legacy ALL policy.
-- Existing dedicated owner SELECT/INSERT policies may coexist; permissive duplicates do not widen
-- either expression beyond the same owner/manual boundary.
create policy financial_entries_owner_select_p0
on public.financial_entries for select to authenticated
using (auth.uid() = user_id);

create policy financial_entries_owner_insert_manual_only_p0
on public.financial_entries for insert to authenticated
with check (
  auth.uid() = user_id
  and not coalesce(finance_command_owned, false)
  and finance_command_id is null and finance_command is null
  and order_id is null and order_number is null
  and posted_by is null and posted_at is null
  and correction_of_entry_id is null and reversal_of_entry_id is null
  and replacement_for_entry_id is null and correction_group_id is null and correction_kind is null
);

-- Direct table access, where a deployment still grants it, is limited to ordinary manual rows.
-- WITH CHECK preserves owner scope and prevents a manual row from acquiring authoritative identity.
create policy financial_entries_owner_update_manual_only
on public.financial_entries for update to authenticated
using (
  auth.uid() = user_id
  and not coalesce(finance_command_owned, false)
  and finance_command_id is null and finance_command is null
  and order_id is null and order_number is null
  and posted_by is null and posted_at is null
  and correction_of_entry_id is null and reversal_of_entry_id is null
  and replacement_for_entry_id is null and correction_group_id is null and correction_kind is null
)
with check (
  auth.uid() = user_id
  and not coalesce(finance_command_owned, false)
  and finance_command_id is null and finance_command is null
  and order_id is null and order_number is null
  and posted_by is null and posted_at is null
  and correction_of_entry_id is null and reversal_of_entry_id is null
  and replacement_for_entry_id is null and correction_group_id is null and correction_kind is null
);

create policy financial_entries_owner_delete_manual_only
on public.financial_entries for delete to authenticated
using (
  auth.uid() = user_id
  and not coalesce(finance_command_owned, false)
  and finance_command_id is null and finance_command is null
  and order_id is null and order_number is null
  and posted_by is null and posted_at is null
  and correction_of_entry_id is null and reversal_of_entry_id is null
  and replacement_for_entry_id is null and correction_group_id is null and correction_kind is null
);

-- Protected identity is never browser-writable, even if a stale deployment retained column grants.
revoke update(
  user_id, order_id, order_number, finance_command_owned, finance_command_id, finance_command,
  posted_by, posted_at, correction_of_entry_id, reversal_of_entry_id, replacement_for_entry_id,
  correction_group_id, correction_kind, correction_reason, accepted_commercial_snapshot
) on public.financial_entries from public, anon, authenticated;

-- Defense in depth: authoritative postings and all append-only correction rows cannot be changed by
-- UPDATE or DELETE under any role. Authoritative commands only lock originals and INSERT new rows,
-- so this guard does not require (and deliberately has no) client-controlled bypass.
create or replace function public.guard_command_owned_financial_entry_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
begin
  if coalesce(old.finance_command_owned, false)
     or old.finance_command_id is not null or old.finance_command is not null
     or old.order_id is not null or old.order_number is not null
     or old.posted_by is not null or old.posted_at is not null
     or old.correction_of_entry_id is not null or old.reversal_of_entry_id is not null
     or old.replacement_for_entry_id is not null or old.correction_group_id is not null
     or old.correction_kind is not null then
    raise exception 'Posted Finance entries are immutable; create an append-only correction instead.'
      using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end
$function$;

revoke all on function public.guard_command_owned_financial_entry_mutation() from public, anon, authenticated;

drop trigger if exists financial_entries_guard_command_owned_mutation on public.financial_entries;
create trigger financial_entries_guard_command_owned_mutation
before update or delete on public.financial_entries
for each row execute function public.guard_command_owned_financial_entry_mutation();

comment on function public.guard_command_owned_financial_entry_mutation() is
  'Rejects UPDATE/DELETE of command-owned postings and correction rows. Corrections remain INSERT-only.';

commit;
