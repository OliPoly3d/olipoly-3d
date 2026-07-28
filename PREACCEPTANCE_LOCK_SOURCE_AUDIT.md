# Pre-acceptance 55P03 lock-source audit

## Current evidence boundary

The live `HTTP 500 / PostgreSQL 55P03` proves a controlled lock-not-available
outcome, but the deployed `202607280007` definition assigns the same SQLSTATE to
the job try-lock, command try-lock, and PostgreSQL `lock_timeout`. Because the
captured response did not include a distinct message/detail, it does **not**
deterministically identify which statement raised it. No lock owner can be named
from a prior PID snapshot after PostgREST reuse.

Migration `202607280008_distinguish_preacceptance_lock_failures.sql` is diagnostic
hardening, not a concurrency change. The next response identifies exactly one:

| Source statement | Message | DETAIL marker |
|---|---|---|
| `pg_try_advisory_xact_lock(v_job_lock_key)` returned false | `Pre-acceptance Production job lock is already held.` | `lockScope=job jobId=… lockKey=…` |
| `pg_try_advisory_xact_lock(v_command_lock_key)` returned false | `Pre-acceptance command identity lock is already held.` | `lockScope=command jobId=… lockKey=…` |
| A later receipt/job/update/index lock exceeded transaction-local `lock_timeout` | `Pre-acceptance database row or index lock timed out.` | `lockScope=row_timeout jobId=…` |

The function retains the same locks and authority. It only gives each 55P03 a
durable message, DETAIL, and HINT that PostgREST already returns and the client
already preserves.

## Exact affected job key

PostgreSQL 16 computed this repository expression:

```sql
hashtextextended(
  'preacceptance-production-job:' ||
  '27be9786-47bb-4e20-a4b5-5ad05c407f08', 0
)
```

as signed bigint **`-8964079901114347293`**. Its bigint advisory-lock mapping is:

- `classid = 2207854802`
- `objid = 3688648931`
- `objsubid = 1`

The command key cannot be computed from the supplied evidence because the exact
live `p_correlation_id` was not included. Paste it into
`supabase/verification/preacceptance_lock_owner_capture.sql`; the live database
will compute the authoritative command key and both unsigned 32-bit halves.

## Repository-wide advisory-lock inventory

Historical migrations remain listed because deployment drift can leave an older
definition active. `CREATE OR REPLACE` means repeated definitions of one
signature do not coexist when migrations were applied in order.

| File / function | Lock call | Namespace / source | Width | Scope / wait | Aggregate | Pre-acceptance namespace overlap |
|---|---|---|---:|---|---|---|
| `202607200006/007/008` — `production_workflow_command` | `pg_advisory_xact_lock(hashtextextended(v_command_id,0))` | raw correlation ID | 64 | transaction / blocking | Order + Production job | Cannot derive either exact prefixed input; 64-bit hash collision remains theoretically possible |
| `202607200006/007/008` — `fulfillment_workflow_command` | same | raw correlation ID | 64 | transaction / blocking | Order + Production job | Same conclusion |
| `202607200006/007/008` — historical `preacceptance_production_command` | same | raw correlation ID | 64 | transaction / blocking | Production job | Superseded; no prefixed namespace |
| `202607280006` — pre-acceptance | command try-lock | raw command ID | 64 | transaction / nonblocking | Command receipt | Superseded by job-scoped definition |
| `202607280007/008` — pre-acceptance job | `pg_try_advisory_xact_lock(v_job_lock_key)` | `preacceptance-production-job:` + job UUID | 64 | transaction / nonblocking | Production job | **Only these definitions derive this exact namespace** |
| `202607280007/008` — pre-acceptance command | `pg_try_advisory_xact_lock(v_command_lock_key)` | `preacceptance-production-command:` + correlation ID | 64 | transaction / nonblocking | Receipt identity | **Only these definitions derive this exact namespace** |
| `202607210004` — reserve material | blocking xact lock | raw reservation command ID | 64 | transaction / blocking | Production reservation/rolls | Does not derive either prefixed input |
| `202607210004` — release reservation | blocking xact lock | raw release command ID | 64 | transaction / blocking | Production reservations | Does not derive either prefixed input |
| `202607210002/003/004` — consume attempt | blocking xact lock | raw correlation ID | 64 | transaction / blocking | Production attempt/rolls | Does not derive either prefixed input |
| `202607210005` — post Order income | blocking xact lock with `hashtext` | `finance-order-posting:` + correlation ID | 32 | transaction / blocking | Order/Finance entry | Distinct prefix and width; cannot derive exact pre-acceptance input |
| `202607210005` — append correction | blocking xact lock with `hashtext` | `finance-correction:` + correlation ID | 32 | transaction / blocking | Finance entry | Distinct prefix and width |

No quote conversion, campaign conversion, trigger, helper, or test migration
contains an advisory-lock call. No production migration contains
`pg_advisory_lock` or `pg_try_advisory_lock` (the session-scoped forms); every
repository advisory call is transaction-scoped (`*_xact_lock`). Therefore the
repository cannot create a session-persistent advisory lock. A live granted
advisory lock with `xact_start IS NULL` would prove out-of-repository/manual or
stale deployed session-level behavior.

PostgreSQL advisory locks are reentrant within one session/transaction. A local
PostgreSQL 16 check acquiring the same bigint twice with
`pg_try_advisory_xact_lock` returned `true, true`; nested same-transaction
acquisition does not explain a false result.

## Overload and PostgREST verification

The frontend sends all six named arguments: `p_job_id`, `p_command`,
`p_expected_updated_at`, `p_payload`, `p_correlation_id`, and `p_causation_id`.
The read-only capture script lists every live overload, OID, identity arguments,
result, language, SECURITY DEFINER flag, settings, full definition, ACL, and
role-specific execute privilege. Its final query expects exactly the repository
six-argument `regprocedure`. Do not drop any additional live overload until that
output and repository callers are reviewed.

## Stale session-lock remediation

First run the key-matched capture. If a granted matching advisory lock has no
open transaction (`xact_start IS NULL`), it is session-level. Record its PID and
`backend_start`; re-query both values and the exact `classid/objid/objsubid`
immediately before action.

`pg_cancel_backend` cancels only a current statement and does not release a
session-level advisory lock held by an idle pooled session. Try cancellation
only if the exact backend is actively executing the affected RPC. If the same
PID/backend-start still holds the exact advisory key with no transaction after
cancellation, terminate that one verified backend:

```sql
select pg_terminate_backend(a.pid)
from pg_stat_activity a
join pg_locks l on l.pid=a.pid and l.locktype='advisory' and l.granted
where a.pid = <VERIFIED_PID>
  and a.backend_start = '<VERIFIED_BACKEND_START>'::timestamptz
  and a.xact_start is null
  and l.classid::bigint = 2207854802
  and l.objid::bigint = 3688648931
  and l.objsubid = 1;
```

This must return exactly one row/`true`. Otherwise stop. Never terminate generic
PostgREST, `LISTEN pgrst`, `set_config`, or unrelated sessions.

## Live decision procedure

1. Deploy migrations through `202607280009` and the cache-busted frontend.
2. Click once and record the exact correlation ID, response message, DETAIL,
   HINT, and SQLSTATE.
3. Run the key computation and point-in-time owner capture during the request.
4. `lockScope=job`: match key `-8964079901114347293` to its exact holder.
5. `lockScope=command`: compute the command key and match its exact holder.
6. `lockScope=row_timeout`: both try-locks succeeded; use the all-lock result to
   name the tuple/transaction/relation/index blocker.
7. Apply no further repair until the response and same-time lock snapshot name
   the source and owner.

The issue is not reported fixed until a fresh request returns the authoritative
`production_jobs` row.
