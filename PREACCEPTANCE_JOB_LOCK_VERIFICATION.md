# Pre-acceptance Production job-lock verification

## Root cause and lock design

The command-identity try-lock in migration `202607280006` separated requests by
`p_correlation_id`. Concurrent requests for one Production job with different
IDs therefore acquired different locks and converged on the same
`production_jobs ... FOR UPDATE`, forming tuple/transaction lock queues.

Migration `202607280007_job_scoped_preacceptance_lock.sql` separates two duties:

1. **Aggregate concurrency:** a transaction try-lock on the signed 64-bit value
   returned by
   `hashtextextended('preacceptance-production-job:' || p_job_id::text, 0)`.
   The domain prefix prevents accidental key-space sharing with other advisory
   lock uses; the canonical UUID text supplies the stable aggregate identity.
2. **Command idempotency:** a second nonblocking, domain-separated 64-bit lock
   derived from `p_correlation_id`, followed by the primary-key receipt lookup.
   This prevents concurrent reuse of one identity across different jobs from
   waiting on the receipt uniqueness constraint.

Both are transaction-scoped try-locks. Blocking advisory locks are forbidden.
`lock_timeout = 2s` is transaction-local secondary protection for unrelated row
lock contention, not the normal same-job concurrency mechanism.

## RPC execution order

1. Require authenticated actor, job ID, expected timestamp, and correlation ID.
2. Set transaction-local `lock_timeout` to two seconds.
3. Acquire the nonblocking job lock; fail immediately with `55P03` if held.
4. Acquire the nonblocking command-identity lock; fail immediately with `55P03`
   if the same identity is currently executing elsewhere.
5. Read the immutable receipt by its existing `command_identity` primary key.
6. Return current authoritative state for a matching completed replay, or reject
   owner/job/command identity reuse with `23505`.
7. Lock the Production row and validate owner, unlinked pre-acceptance state,
   absent actual evidence, and `expected_updated_at`.
8. Validate the command, update the authoritative row, insert one receipt, and
   return the row in the same transaction.

No additional index is justified: `workflow_command_receipts` already has a
primary key on `command_identity`; `production_jobs` is accessed through its
primary key `id`, with `user_id` checked on that one row. An owner/job/command
index would duplicate a lookup already narrowed to one receipt.

## Browser error contract

| SQLSTATE | Operator message | Retry |
|---|---|---|
| `55P03`, job scope | Another Quote handoff is already using this Production job. Refresh before retrying. | Never automatic |
| `55P03`, command scope | This Quote handoff command is already being processed. Refresh before retrying. | Never automatic |
| `55P03`, row timeout | The Production record is busy in another operation. Refresh before retrying. | Never automatic |
| `40001` | This estimate changed since it was loaded. Refresh before retrying. | Never automatic |
| `22023` / `23505` | Quote handoff was rejected. Refresh the estimate and review the record. | Never automatic |
| `42501` | Quote handoff was not authorized. Refresh or sign in before retrying. | Never automatic |
| Abort/network/504 | Quote handoff could not be confirmed. Refresh the record before retrying. | Never automatic |

Detailed HTTP/SQL status remains on the logged error; raw SQL detail is not
shown as the operator message.

## Safe stale-request inspection and cancellation

Identification is read-only and matches the backend's **current** query:

```sql
select
  a.pid,
  a.state,
  a.xact_start,
  a.query_start,
  a.wait_event_type,
  a.wait_event,
  pg_blocking_pids(a.pid) as blocking_pids,
  a.query
from pg_stat_activity a
where a.pid <> pg_backend_pid()
  and a.backend_type = 'client backend'
  and a.state = 'active'
  and a.query ~* 'preacceptance_production_command\s*\('
order by a.query_start;
```

Cancel only sessions whose current active query still matches at statement
execution time. This excludes pooled/reused idle PIDs, `set_config`, `LISTEN
pgrst`, and unrelated PostgREST work:

```sql
select a.pid, pg_cancel_backend(a.pid) as cancel_requested
from pg_stat_activity a
where a.pid <> pg_backend_pid()
  and a.backend_type = 'client backend'
  and a.state = 'active'
  and a.query ~* 'preacceptance_production_command\s*\(';
```

Rerun the read-only identification query and expect zero rows. Cancellation is
an operator action only; it is not embedded in application code or a migration.

## Required two-session PostgreSQL verification

Use two SQL sessions with a reviewed test owner and two disposable eligible
estimates. Do not add a sleep to the production function. In each transaction,
set the same authenticated test identity using the environment-approved JWT
claims mechanism; the illustrative `set_config` below may require adjustment to
the Supabase test environment.

### Same job, different correlation IDs

Session A:

```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<OWNER_UUID>","role":"authenticated"}', true);
select * from public.preacceptance_production_command(
  '<JOB_A_UUID>', 'mark_waiting_customer', '<JOB_A_UPDATED_AT>',
  jsonb_build_object('quote_number','<Q_NUMBER>'), 'concurrency-A', null
);
-- Leave this transaction open after the function returns. The xact job lock,
-- authoritative update, and uncommitted receipt remain held without a sleep.
```

While A remains open, Session B:

```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<OWNER_UUID>","role":"authenticated"}', true);
select clock_timestamp() as started_at;
select * from public.preacceptance_production_command(
  '<JOB_A_UUID>', 'mark_waiting_customer', '<JOB_A_UPDATED_AT>',
  jsonb_build_object('quote_number','<Q_NUMBER>'), 'concurrency-B', null
);
-- Expect immediate SQLSTATE 55P03, then:
rollback;
```

From an observer session, the Session B call must not appear waiting on
`transactionid` or `tuple`. Commit Session A, then verify exactly one status
change and one receipt (`command_identity = 'concurrency-A'`), and no
`concurrency-B` receipt.

### Different jobs

Begin Session A again for Job A and leave its transaction open after the RPC
returns. Invoke the RPC for eligible Job B with correlation ID `concurrency-C`
in Session B. Job B must complete because its job-lock key differs. Commit both,
then verify one receipt and one authoritative update per job.

These live two-session results are the acceptance proof. Repository contract
tests and the executable concurrency model are not represented as a substitute
for PostgreSQL concurrency execution.

## Narrow lifecycle RPC risk review

| RPC | Aggregate | Current advisory key | Row locks before mutation | Different IDs on same aggregate | Immediate risk / follow-up |
|---|---|---|---|---|---|
| `preacceptance_production_command` | Production job UUID | **Job UUID try-lock**, then command-ID try-lock | Production job | Rejected before row lock | Fixed in scope; complete live two-session gate |
| `production_workflow_command` | Order number / linked Production job | Blocking correlation ID | Order, then Production job | Can queue on Order/job | High workflow-concurrency risk; focused follow-up audit, no change here |
| `fulfillment_workflow_command` | Order number / linked Production job | Blocking correlation ID | Order, then Production job | Can queue on Order/job | High workflow-concurrency risk; focused follow-up audit, no change here |
| `reserve_production_material` | Production job plus roll set | Blocking reservation command ID | Production job, Order, each roll | Can queue on job/roll | Medium-high Inventory command risk; audit aggregate/roll lock ordering separately |
| `release_production_material_reservation` | Production job reservations | Blocking release command ID | Production job, Order, reservations | Can queue on job/reservations | Medium-high Inventory command risk; separate Inventory-owned review |
| `consume_production_attempt` | Production attempt plus roll set | Blocking correlation ID | Production job, Order, reservations/rolls | Can queue on job/roll | High Inventory accounting concurrency risk; separate Inventory-owned review |
| `post_order_finance_income` | Order UUID | Blocking **32-bit** correlation hash | Receipt entry, Order | Can queue on Order | Medium-high; replace with domain-separated aggregate bigint in Finance follow-up |
| `append_finance_correction` | Original Finance entry UUID | Blocking **32-bit** correlation hash | Receipt entry, original entry | Can queue on original entry | Medium-high; Finance-owned aggregate lock review |

No out-of-scope RPC is changed by this repair.
