# Legacy history import dry run

The CLI compares two JSON snapshots for a single owner and prints a review plan. It reads the two files and has no database connection or write mode. Use fictional fixtures for this milestone.

```sh
node scripts/legacy-history-dry-run.mjs tests/fixtures/legacy-history/existing.json tests/fixtures/legacy-history/incoming.json
node --test tests/legacy-history-dry-run.test.mjs
```

Each input is an array of archive summaries with the original stable `source_key`, `record_type`, `archived_status`, explicit `related_order` or `null`, and arrays for `evidence`, `open_issues` and literal `references`. Prepare snapshots for the same owner; ownership comes from the authorized export step. An evidence entry here is a label. Asset bytes, private document links, financial amounts, and operational records are outside this summary contract.

| Result | Meaning |
| --- | --- |
| Add | New source key, distinct literal reference keys and no unresolved issues. |
| Skip | Same source key and identical archive summary. Reference order in the input is irrelevant. |
| Review | Same source key with changed fields, repeated source key in the incoming batch, new record sharing an indexed reference, or unresolved source issues. A shared reference can be legitimate and needs an explicit relationship decision. |

Review the report before any write is considered. A completed comparison returns status 0 even if there are review rows. Invalid input exits with status 1. The first fixture run should show one addition, one skip and three review rows. The test suite stages that one addition in memory and compares again, expecting zero additions, two skips and three review rows.

The next rehearsal needs a scoped test snapshot and an approved write path that revalidates the reviewed plan against current records. Reconcile private PDF availability, payment and Finance totals, literal identifier reservations, and rollback independently before a live migration. An archived summary never establishes an active order or authorizes fulfillment.
