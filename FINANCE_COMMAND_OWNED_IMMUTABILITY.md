# Finance command-owned immutability contract

## Confirmed root cause

The live role has column-level `UPDATE` on financially significant `financial_entries` fields. A
permissive owner `UPDATE` policy reaches every owner row, and no `BEFORE UPDATE` guard distinguishes
manual bookkeeping from command-owned postings. Column privilege plus that policy permits a direct
REST update even without table-level `UPDATE`, bypassing the correction receipt and effective-entry
model.

## Existing entry semantics

* **Manual income and expenses** have no Order, command, posting, or correction identity. Finance Pro
  creates, updates, and deletes them through the three guarded manual-entry RPCs. Both types remain
  editable and deletable by their owner.
* **Order income** is inserted by `post_order_finance_income`, has
  `finance_command_owned = true`, `finance_command = 'post_order_income'`, immutable Order/command
  identity, and atomically advances `orders.finance_pushed`.
* **Corrections** are append-only command-owned metadata rows or reversal/replacement pairs.
  `correct_financial_entry` locks but never changes the original, writes exactly one receipt for its
  command identity, and retries return that receipt. Effective reporting resolves the receipt rather
  than rewriting the original.

## Remediation

Migration `202608110002_finance_command_owned_immutability.sql` replaces authenticated/public
`UPDATE`, `DELETE`, and `ALL` policies with owner-scoped manual-only policies, revokes browser updates
to authority identity columns, and adds a simple `BEFORE UPDATE OR DELETE` guard. The guard has no
bypass: authoritative posting and correction functions only insert new ledger rows and take row
locks, so no authoritative workflow needs to update or delete an existing posted row.

Manual Finance safety is unchanged: owner and absence of every authority marker are required, and
Finance Pro continues to use its validated SECURITY DEFINER RPCs. Cross-owner access remains denied.
No tax, posting, correction, expense, reporting, or UI calculation is changed.

## Deployment and verification

Apply the forward-only migration through the reviewed Supabase deployment process. Do not assume it
is live merely because it exists in the repository. After deployment, run
`supabase/verification/finance_command_owned_immutability.sql` with a read-only/operator connection
and archive all result sets. It checks effective privileges, every column grant, policy expressions,
trigger/function definition and hash, RPC/service capability, and non-sensitive row counts without
issuing a mutation.

Manual browser checks still required after deployment: create/edit/delete one manual expense and one
manual income; post one test Order; correct it; retry the same correction command; confirm the
original is unchanged, one receipt exists, effective reporting resolves the replacement, and
`finance_pushed` remains correct. Perform destructive denial probes only in a rollback-only test
database, never against production.
