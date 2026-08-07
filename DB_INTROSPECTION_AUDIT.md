# Database introspection runtime audit

## Finding

No browser, shared JavaScript, application-startup, API-request, auth-refresh,
timer, background-job, build, deploy, or CI code in this repository performs
PostgreSQL schema/function introspection. Normal production runtime therefore
has no repository-owned catalog walk to disable.

The reported query shapes match PostgREST's own schema-cache discovery more
closely than an application data request. Repository evidence cannot map the
two query IDs without their complete normalized SQL or Supabase/PostgREST
logs. Hundreds of calls are not explained by the once-daily keep-alive data
request or by any checked-in runtime loop. Investigate PostgREST restarts and
external schema-reload notifications if the call count continues.

## Executable path inventory

| File | Function/script | Trigger | Environment | Frequency | Purpose | Safe to disable in production? |
|---|---|---|---|---|---|---|
| `.github/workflows/supabase-keepalive.yml` | `ping` | daily cron or manual dispatch | CI | once daily | one `orders` REST data read; no metadata access | Not relevant; it cannot explain catalog calls |
| `supabase/migrations/202607160002_repair_milestone_2a_order_status.sql` | trailing verification selects | migration application | operator/deploy | once for this migration | validate constraint, column, and trigger state | Yes after migration; never runtime |
| `supabase/migrations/202607210001_retire_complete_production_job_overloads.sql` | migration `DO` block | migration application | operator/deploy | once for this migration | preserve five deployed function identities while retiring their bodies | Yes after migration; never runtime |
| `supabase/migrations/202608020007_orders_optional_customer_phone.sql` | migration preflight `DO` block | migration application | operator/deploy | once for this migration | fail deployment if the known Orders insert contract differs | Yes after migration; never runtime |
| `supabase/migrations/202608030003_remove_recursive_workflow_trigger_paths.sql` | migration preflight `DO` block | migration application | operator/deploy | once for this migration | reject trigger recursion before replacement | Yes after migration; never runtime |
| `supabase/migrations/202608010003_authoritative_order_finance_tax_metadata.sql`, `202608020005_repair_orders_tax_metadata_and_finance_county.sql` | `to_regprocedure` existence checks | migration application | operator/deploy | once per migration | idempotent function rename guard; no broad scan | Yes after migration; never runtime |
| `supabase/verification/*.sql` (10 files) | standalone SQL | explicit operator execution only | operator workstation/SQL console | only on demand | deployment contracts, function definitions, workflow graphs, and lock/activity captures | Yes; now supported through a fail-closed runner |
| `scripts/run-db-introspection.sh` | verification runner | explicit shell command with opt-in and database URL | operator workstation | only on demand | gate and execute one named verification | Disabled by default |

Catalog references in Markdown outside `supabase/verification` are operational
notes or historical evidence, not executable entry points. Catalog references
in `tests` are static contract assertions and never connect to Supabase.

## Runtime/build/CI boundary

`RUN_DB_INTROSPECTION` has no production default. The operator runner requires
the exact value `true`, a database URL, and one checked-in verification name.
No application or workflow imports the runner or verification SQL. The daily
keep-alive makes one terminating data request and does not run Supabase CLI,
type generation, `db pull`, migration diff/status, or schema generation.

The runner is Bash and must be executed from a terminal; it is not valid input
for the Supabase SQL editor. An SQL-editor operator must instead review and run
only the contents of the intended `supabase/verification/*.sql` file. Because
the SQL editor cannot consume the shell environment gate, that path is an
explicit, manually reviewed operator action and must never be scheduled.

Several historical migrations issue `NOTIFY pgrst, 'reload schema'` once while
being applied. They are immutable deployment history rather than runtime entry
points. Replaying the migration directory or repeatedly applying its SQL would
cause PostgREST cache rebuilds, but no checked-in workflow does so. The
operator-only `remove_production_workflow_stage_trace.sql` also reloads the
schema because it changes functions; it remains safe only under the explicit
operator boundary documented above.

## Operational follow-up for the supplied query IDs

Capture full normalized SQL, `application_name`, role, and timestamps for
query IDs `-3076875962393720596` and `4566076159892086781`. Correlate them with
PostgREST process starts and `NOTIFY pgrst` events. If they are PostgREST cache
queries, inspect platform restarts, health failures, and any deployment system
outside this repository. Do not increase `work_mem` merely to conceal repeated
cache rebuilds.

This audit and repair changes no RLS policy, table, index, database function,
migration, or application business logic.
