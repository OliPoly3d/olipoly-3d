# Pre-acceptance Production row NOWAIT verification

## Evidence boundary and blocking analysis

The supplied 30.308-second transport timeout proves that no HTTP response was
received before the browser guard. It does not include the simultaneous
`pg_stat_activity`/`pg_locks` snapshot needed to name the exact live statement
or owning transaction. The prior RPC could block at a relation lock during the
receipt read, the Production `FOR UPDATE`, update/trigger work, receipt unique
index insertion, or transaction completion. The exact live owner remains
unidentified; it is not inferred from elapsed time.

Migration `202607280009_nowait_preacceptance_production_row.sql` removes the
principal row-wait boundary without removing the row lock. Both new-command and
receipt-replay Production row reads use `FOR UPDATE NOWAIT`. A stage marker is
set before every potentially locking statement:

- `receipt_lookup`;
- `receipt_replay_production_row`;
- `production_row`;
- `production_update`;
- `receipt_insert`.

Row acquisition contention returns immediate `55P03` with
`lockScope=row_nowait`. Any remaining relation, update, trigger, receipt index,
or transaction lock that reaches the transaction-local two-second
`lock_timeout` returns `lockScope=database_lock_timeout` plus the exact stage.

## Production Control write audit

| Write path | Remote Production write | Same-job coordinator |
|---|---|---|
| Page-load local-to-cloud migration | `cloudSaveJob` INSERT/PATCH | Yes |
| Estimate/details form save | `cloudSaveJob` | Yes |
| Full save fallback PATCHes | inside `cloudSaveJobUncoordinated` | Yes, outer wrapper |
| Status-related ordinary editable-field save | `cloudSaveJob` before lifecycle RPC | Yes |
| Inventory-exclusion toggle | narrow `production_jobs` PATCH | Yes |
| Bulk machine edit | `cloudSaveJob` | Yes |
| Printer PM save | `printer_pm`, not Production row | Not applicable |
| Reliability autosave/beforeunload | browser form snapshot only | No remote write |
| Reliability interval | renders health only | No remote write |
| Recovery quote draft | localStorage only | No remote write |

The globally shared `operationCoordinator` serializes ordinary saves per job.
Quote handoff marks the job as handoff-pending, waits for the existing same-job
save tail to settle, then issues the RPC. A save requested after handoff begins
is rejected rather than queued after lifecycle success. Different jobs use
independent coordinator entries. The guard is always released in the handoff
handler's `finally`.

This coordination prevents the same page from knowingly starting Quote handoff
behind its own outstanding PATCH. It does not replace database NOWAIT authority
and cannot prevent another tab, client, workflow RPC, or operator transaction.

## Local two-session PostgreSQL result

The final migration was executed in a disposable PostgreSQL 16 database. Session
A locked job `27be9786-47bb-4e20-a4b5-5ad05c407f08` with `FOR UPDATE` and held
the transaction. Session B invoked the six-argument RPC.

Session B returned in **156 ms** with:

```text
ERROR:  Production job row is busy in another operation.
DETAIL: lockScope=row_nowait stage=production_row
SQLSTATE: 55P03
```

It changed no row and inserted no receipt. After Session A committed, one fresh
RPC returned the authoritative job row in `waiting_customer`, and verification
showed exactly one receipt.

## Live verification

1. Run `production_job_write_lock_capture.sql` during the current pending request
   before deploying the fix; retain PID, backend start, transaction start,
   blocker PIDs, relation/tuple/transaction locks, and current query.
2. Deploy migration `202607280009_nowait_preacceptance_production_row.sql` and
   frontend asset `?v=20260728-row-nowait-v6`.
3. Close old tabs and hard-refresh one Production Control tab.
4. Confirm an unlocked eligible estimate returns an authoritative row promptly.
5. In SQL Session A, begin a transaction and lock the exact Production row with
   `SELECT ... FOR UPDATE`; leave the transaction open.
6. Click once in the browser. Expect immediate `55P03`,
   `lockScope=row_nowait`, and the fixed estimate-busy message—not a transport
   timeout.
7. Confirm no row change and no receipt for the failed correlation ID.
8. Commit Session A, refresh, and click once.
9. Confirm authoritative success, one receipt, Quote navigation, and no later
   replay.

The live issue is not reported fixed until the unlocked browser request returns
the authoritative `production_jobs` row before the client timeout.
