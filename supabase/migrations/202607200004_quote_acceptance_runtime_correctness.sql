-- Supersession marker only.
--
-- Migration 202607200004_quote_acceptance_runtime_correctness.sql was merged as
-- repository evidence for a planned Quote acceptance runtime correction, but it
-- was reviewed before deployment and found unsafe. It was never deployed to the
-- production Supabase project and must not apply runtime changes in any normal
-- sequential migration runner.
--
-- The corrected and only runtime deployment artifact for this correction is:
--   supabase/migrations/202607200005_quote_acceptance_runtime_safety.sql
--
-- This file intentionally contains no function replacement, trigger/function
-- removal, permission changes, table changes, indexes, or data mutations.
-- Fresh/sequential environments may safely execute this no-op marker and then
-- execute 202607200005 to install the corrected runtime behavior.

begin;

do $$
begin
  raise notice 'Migration 202607200004 was superseded before deployment by 202607200005_quote_acceptance_runtime_safety.sql; no runtime changes applied.';
end;
$$;

commit;
