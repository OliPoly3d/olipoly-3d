-- Quote accepted commercial snapshot security synchronization
-- Purpose:
--   Codify the operator-applied deployed security repair for
--   public.quote_accepted_commercial_snapshots and its mutation guard.
--
-- Dependency:
--   This migration depends on
--   supabase/migrations/202607200002_quote_acceptance_authority.sql, which
--   creates public.quote_accepted_commercial_snapshots and
--   public.prevent_quote_accepted_snapshot_mutation(). Apply this migration
--   only after that acceptance-authority migration exists in the target
--   database.
--
-- Deployed context:
--   The prior migration created the snapshot table without enabling RLS or
--   overriding Supabase's broad default table grants. In the deployed project,
--   the table initially inherited broad PUBLIC/anon/authenticated privileges
--   while RLS was disabled. The operator immediately repaired and verified the
--   deployed security state. This forward-only repository migration records
--   that already-applied state so future environments converge to the same
--   contract.
--
-- Contract:
--   Snapshot creation and reads remain internal to the SECURITY DEFINER
--   acceptance RPC. Do not add browser RLS policies for this table. Direct
--   PUBLIC, anon, or authenticated access must remain denied.
--
-- Forward recovery guidance:
--   If verification shows drift, do not edit the already-merged
--   202607200002 migration. Re-run this forward-only migration, or create a
--   later focused forward-only repair if additional deployed facts require it.
--   Do not manually grant browser roles table privileges or direct execution
--   on the mutation guard.
--
-- Post-deployment verification queries:
--   select relrowsecurity
--   from pg_class
--   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
--   where nspname = 'public'
--     and relname = 'quote_accepted_commercial_snapshots';
--
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and table_name = 'quote_accepted_commercial_snapshots'
--     and grantee in ('PUBLIC', 'public', 'anon', 'authenticated', 'service_role')
--   order by grantee, privilege_type;
--
--   select policyname, roles, cmd
--   from pg_policies
--   where schemaname = 'public'
--     and tablename = 'quote_accepted_commercial_snapshots';
--
--   select has_function_privilege('public', 'public.prevent_quote_accepted_snapshot_mutation()', 'execute') as public_execute,
--          has_function_privilege('anon', 'public.prevent_quote_accepted_snapshot_mutation()', 'execute') as anon_execute,
--          has_function_privilege('authenticated', 'public.prevent_quote_accepted_snapshot_mutation()', 'execute') as authenticated_execute,
--          has_function_privilege('service_role', 'public.prevent_quote_accepted_snapshot_mutation()', 'execute') as service_role_execute;
--
-- Codex did not deploy, reapply, or otherwise mutate the Supabase project for
-- this migration.

begin;

alter table public.quote_accepted_commercial_snapshots
  enable row level security;

revoke all
on table public.quote_accepted_commercial_snapshots
from public, anon, authenticated;

grant all
on table public.quote_accepted_commercial_snapshots
to service_role;

revoke all
on function public.prevent_quote_accepted_snapshot_mutation()
from public, anon, authenticated;

grant execute
on function public.prevent_quote_accepted_snapshot_mutation()
to service_role;

commit;
