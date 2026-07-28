# Authenticated pre-acceptance transport trace

## Evidence boundary

The latest browser evidence proves one `fetch` did not resolve to response
headers before the 30-second client guard. It does not prove whether PostgreSQL
entered or returned from the function, whether the transaction committed, or
whether PostgREST produced an upstream response. Those answers require the
correlated live procedure below. No failing layer or production fix is claimed
before that capture.

## Diagnostic design

Migration `202607280010_trace_preacceptance_transport_boundary.sql` preserves
the exact six-argument production RPC, return type, locks, validation, update,
receipt, grants, and `auth.uid()` behavior. A fresh correlation ID beginning
`diagnostic:` opts one authenticated call into transaction-local stage markers
in `pg_stat_activity.application_name`. Normal Production Control correlation
IDs do not activate tracing.

The marker contains only a stage, the first eight job UUID characters, and the
first twelve hexadecimal characters of `md5(correlation_id)`. It never contains
a JWT, payload, customer data, or full command identity. `set_config(..., true)`
makes every marker transaction-local; pooled sessions cannot retain it.

Stages are:

1. `function_enter`
2. `arguments_validated`
3. `job_try_lock_acquired`
4. `command_try_lock_acquired`
5. `receipt_lookup_started`
6. `receipt_lookup_completed`
7. `production_row_lock_started`
8. `production_row_lock_acquired`
9. `validations_complete`
10. `production_update_started`
11. `production_update_complete`
12. `receipt_insert_started`
13. `receipt_insert_complete`
14. `function_returning`

No diagnostic table is used: an ordinary table write participates in the same
transaction, is invisible to another session before commit, and disappears on
rollback. An autonomous logging connection would materially alter the
transaction and credential surface. The live `pg_stat_activity` snapshot plus
the committed receipt is the safe deterministic combination.

## One authenticated HTTP request

Use a reviewed eligible estimate owned by the access-token user. Export secrets
only in the operator shell; do not paste output containing tokens into tickets.
The script prints neither key nor token and performs exactly one `fetch`, with no
auth refresh and no retry.

```bash
export SUPABASE_URL='https://PROJECT.supabase.co'
export SUPABASE_ANON_KEY='runtime public anon key'
export SUPABASE_ACCESS_TOKEN='current user access token'
export PREACCEPTANCE_RPC_BODY='{
  "p_job_id":"27be9786-47bb-4e20-a4b5-5ad05c407f08",
  "p_command":"mark_waiting_customer",
  "p_expected_updated_at":"REPLACE_FROM_CURRENT_ROW",
  "p_payload":{},
  "p_correlation_id":"diagnostic:REPLACE_WITH_FRESH_UUID",
  "p_causation_id":"operator-transport-diagnostic"
}'
node scripts/preacceptance-authenticated-trace.mjs
unset SUPABASE_ACCESS_TOKEN PREACCEPTANCE_RPC_BODY
```

The timeline distinguishes `fetch_called`, response headers, body-read start,
body-read completion, fetch rejection, and the diagnostic transport guard. Run
`supabase/verification/preacceptance_transport_trace_capture.sql` repeatedly in
SQL Editor while the request is pending after replacing the job and correlation
values.

## Deterministic interpretation

| Evidence | Conclusion |
|---|---|
| No matching backend and no `function_enter` marker captured | No proof of function entry; inspect PostgREST/gateway admission and repeat the synchronized capture |
| Last marker is a middle stage | The immediately following SQL statement is the function boundary under investigation |
| `function_returning` observed, then matching receipt visible | Function returned and transaction committed; a missing browser response is beyond the PL/pgSQL body |
| Receipt visible and `resulting_updated_at` equals the job row | Update and receipt committed atomically, even if transport was lost |
| Backend disappears and no receipt/job change exists | Transaction rolled back or never began; correlate PostgREST logs and HTTP timing |
| `response_headers_received` but no body completion | Browser/PostgREST body streaming or serialization boundary |
| Only `fetch_called`, followed by timeout | Browser received no response headers; use the simultaneous server stage to split database from PostgREST/gateway |

The full `production_jobs` composite versus a minimal diagnostic response is
not changed or tested in this milestone. That experiment would duplicate the
authoritative mutation or require a new RPC. It is justified only if the trace
first proves `function_returning` and commit while response generation stalls.

## Targeted stale-request cancellation

Prefer observation. If an affected request remains active after evidence is
captured, first reselect the backend using its PID **and** immutable
`backend_start`, and require both the diagnostic application name and current
pre-acceptance query to still match. PID alone is unsafe with a pool:

```sql
select pid, backend_start, xact_start, query_start, state,
       wait_event_type, wait_event, application_name, query
from pg_stat_activity
where pid = REPLACE_CAPTURED_PID
  and backend_start = 'REPLACE_CAPTURED_BACKEND_START'::timestamptz
  and application_name like 'olipoly-preacc s=%'
  and query ilike '%preacceptance_production_command%';

select pg_cancel_backend(pid)
from pg_stat_activity
where pid = REPLACE_CAPTURED_PID
  and backend_start = 'REPLACE_CAPTURED_BACKEND_START'::timestamptz
  and state = 'active'
  and application_name like 'olipoly-preacc s=%'
  and query ilike '%preacceptance_production_command%';
```

Cancellation interrupts an active statement and PostgreSQL rolls its transaction
back. Do not terminate a pooled backend merely because an old snapshot listed
its PID; never match `LISTEN pgrst`, generic `set_config`, or unrelated sessions.

## PostgREST and database checks

During the request, retain the trace-capture output, Supabase API logs, and—if
available—Postgres logs. Inspect project settings for statement timeout, pool
acquisition timeout, idle-in-transaction timeout, gateway timeout, and pool
exhaustion. The repository controls only the transaction-local two-second
`lock_timeout`; it does not contain Supabase platform timeout configuration.

The RPC returns one composite row. `production_jobs` includes JSON/JSONB and
text fields, but repository inspection alone cannot establish live TOAST size
or serialization time. Measure the returned body byte count from the script
before changing the return contract.

## Disable and removal

Tracing is disabled by default because normal command IDs do not begin
`diagnostic:`. After diagnosis, apply a follow-up `CREATE OR REPLACE FUNCTION`
from migration `202607280009_nowait_preacceptance_production_row.sql` to remove
the opt-in `application_name` statements, or codify that exact body in a new
forward removal migration. Never roll migration history backward and never
delete a migration already applied to Supabase.

## Live acceptance gate

1. Apply migration `202607280010` without altering grants.
2. Close old Production Control tabs and hard-refresh one tab.
3. Prepare a fresh `diagnostic:` correlation ID and current expected timestamp.
4. Start the authenticated trace script.
5. While pending, run the capture SQL repeatedly and retain every timestamped
   result.
6. Record the last stage, waits, blockers, backend identity/times, and state.
7. After completion or timeout, rerun the committed-outcome query.
8. Compare database evidence with HTTP header/body milestones.
9. Apply a fix only to the proven failing layer.
10. Disable/remove diagnostics, refresh, and run one ordinary browser handoff.
11. Require one prompt authoritative response, one update, one receipt, and no
    later replay before reporting the runtime fixed.
