# Pass QC statement trace runbook

This trace is temporary and changes only server logging. It must be deployed by
an operator with database-owner access before exactly one live Pass QC attempt.

## Deploy the trace

From a trusted workstation connected to the target Supabase project, run only:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/202608100005_trace_consume_production_attempt_statements.sql
```

Do not run the whole migrations directory for this diagnostic step. Confirm the
command ends with `COMMIT` and that the PostgREST schema reload notification is
accepted.

## Capture exactly one failure

1. Hard-refresh Production Control.
2. Open one job in **QC / FINISHING**.
3. Open browser developer tools and select the Network panel.
4. Click **PASS QC** exactly once.
5. Open the `consume_production_attempt` request and copy
   `p_correlation_id` from its JSON request body.
6. In Supabase Logs Explorer, select PostgreSQL logs and search for both
   `OP_ATTEMPT_CONSUME` and the exact correlation ID. Sort ascending by time.
7. Export the complete matching sequence. Record the last marker whose log entry
   completed. A `BEFORE_*` marker without its matching `AFTER_*` marker is the
   authoritative statement boundary; do not infer a boundary from request time.

Each marker includes correlation, attempt, Production job, backend PID,
transaction ID (when assigned), roll ID (inside the roll loop), and wall-clock
timestamp. It deliberately excludes payloads, credentials, Orders, and customer
data.

## Do not deploy a repair yet

Return the captured marker sequence and correlation ID for focused inspection of
only the bounded SQL statement. The permanent repair must replace the temporary
function definition, remove every `OP_ATTEMPT_CONSUME` marker, and be verified
before production acceptance. Reapplying
`202608100003_repair_production_attempt_consumption_locking.sql` can restore the
current clean function in an emergency, but it is not the evidence-based repair.

