# Test migration application record

Applied with Rob's explicit approval on **November 4, 2026**, to **OliPoly ERP Test** (`llscjdyiiatmuqhilube`, `us-east-2`, OliPoly3d's Org). Both approved migrations succeeded. No additional schema changes were applied. The live project was not modified; the source remains in draft PR #298 and has not been merged or deployed to olipoly3d.com. A separate owner-private test copy has since been published; see [DEPLOYMENT.md](DEPLOYMENT.md).

## Applied scripts

Supabase assigned hosted migration-history versions at application time. The reviewed source filenames and bytes are unchanged.

| Approved source script | Hosted version / name | SHA-256 |
| --- | --- | --- |
| `20261104125424_ops_test_business_baseline.sql` | `20261104133319` / `ops_test_business_baseline` | `9f0d0078d4a4535b671654d795f9ca599345e96114c3848a0075e2422af43f74` |
| `20261104130021_ops_test_connected_workspace.sql` | `20261104133324` / `ops_test_connected_workspace` | `410e63abd06d70664fc153e2485053b3f08c52ab8930b8ba341afb8cf7f51b8c` |

Before application, the target was verified ACTIVE_HEALTHY, with an empty public schema and empty migration history. Local file hashes matched the reviewed versions. Each script returned success and both names/versions appear in hosted migration history.

## Hosted verification performed

| Check | Result |
| --- | --- |
| Public tables | 42 |
| Tables with RLS enabled | 42 of 42 |
| RLS policies | 109 |
| Public views | Five, all security-invoker |
| Business/workspace functions across public and private schemas | 77 |
| New internal RPC grants | Authenticated EXECUTE; no anonymous EXECUTE |
| Staging table grants | Authenticated SELECT only, owner-scoped by RLS; no anonymous access or direct mutation |
| Private helper schema access | Neither anon nor authenticated has USAGE |
| Anonymous workspace SELECT and initialize | Denied in database role probes |
| Authenticated role without user identity | Initialize/load denied by auth checks |
| Direct workspace INSERT | Denied |
| Public tracking via hosted REST | HTTP 200, empty result for nonexistent fictional OP-000001 |
| Internal initialize via anonymous hosted REST | HTTP 401 / PostgreSQL 42501, permission denied |
| Live records copied | None |
| Orders / Finance entries / workspaces / Auth users after application | Zero in each |
| Personal Money tables | None |

Role probes ran in a rolled-back transaction and left no fixtures behind. Public tracking is functioning but has no sample order until a test user initializes a workspace and accepts a quote. Hosted REST checks used only the public publishable key.

## Advisor findings retained for review

The advisor scans returned **no ERROR-level findings**, but did return the following WARN/INFO items. These are not a complete security approval. No policies or grants were weakened and no unapproved cleanup migrations were applied.

| Advisor | Level | Findings | Interpretation / next review |
| --- | --- | --- | --- |
| [RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) | INFO | 4 | Baseline `customers`, `document_counters`, payment receipts and accepted snapshots deny direct row access. Review each intended RPC-only/direct-access contract before adding policies. |
| [Anonymous SECURITY DEFINER access](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) | WARN | 6 | Inherited campaign/quote acceptance/tracking public endpoints. Each requires a deliberate public-access and payload review before real data. No new internal workspace RPC is anonymous. |
| [Authenticated SECURITY DEFINER access](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) | WARN | 36 | Includes the three new workspace RPCs and inherited business commands. Owner/identity checks in the three new RPCs are retained; anonymous and missing-identity probes passed. Full signed-in hosted isolation testing remains. |
| [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) | INFO | 30 | Includes five new staging foreign keys and inherited business relationships. Index review can be a separate migration. |
| [Auth RLS evaluation](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) | WARN | 99 | Inherited policy predicates evaluate auth helpers per row; optimize only after reviewing policy equivalence. New staging policies use scalar-select auth.uid. |
| [Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) | INFO | 84 | Expected for a new, empty test project; do not delete indexes merely because they have no recorded use. |
| [Multiple permissive policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies) | WARN | 83 | Inherited overlapping policy combinations; review for authorization equivalence before consolidation. |
| [Duplicate indexes](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index) | WARN | 9 | Inherited duplicate sets; retain until a separately reviewed cleanup. |

## Still pending

A user-created, separately confirmed test Auth account is needed for signed-in hosted verification. No Auth users were fabricated through SQL and no production session was copied. Then verify initialization, acceptance, parallel runs/reprints, actual consumption, payment/fee posting, receipt, public tracking and cross-device reload/conflicts through the new pages. Test iPad Safari print/share on Rob's actual device.

Private test publication is recorded in [DEPLOYMENT.md](DEPLOYMENT.md). Any PR merge or deployment to the customer website remains a separate action. Finance direct-cost reconciliation, verified tax sourcing/certificates and the other staged workflows retain the limits in [README.md](README.md). This application did not convert or migrate legacy business data and did not reconcile physical inventory.

For recovery, stop using the optional test connection and retain the applied schema/data. Any corrective schema change requires its own reviewed migration. Do not automatically reset this project or drop records. See [MIGRATION_REVIEW.md](MIGRATION_REVIEW.md) for the approved scope and recovery procedure.


## Permanent project numbering and shared production queue — November 4, 2026

Rob explicitly approved merge and implementation. PR #299 merged into the existing `agent/ipad-operations-preview` test branch at `430cc209fe664ccd72e685785e011fd6696859e4`. PR #298 remains separate from main; this did not publish olipoly3d.com.

- Exact approved script: `supabase/ops-preview/migrations/20261105003419_ops_test_permanent_project_numbers.sql`.
- SHA-256: `2cab67f8459bb8435d689bbaa447ee7ab6af05838b2ad7de18e8d28e3997eb4e`.
- Verified target: OliPoly ERP Test, `llscjdyiiatmuqhilube`.
- Hosted migration: `20261105005406 ops_test_permanent_project_numbers`; application succeeded.
- Before application, all four hosted function bodies matched the reviewed originals. After application, all four body hashes matched the approved replacement SQL exactly.
- Complete-row digests and row counts were identical before/after for orders (1), quotes (1), production jobs (1), workspace (1), financial entries (1), raw inventory (3), accepted snapshots (1). No business row reset or renumbering occurred.
- Existing suffix 1 is reserved. Sequence is at 1/already-called; no verification allocation burned another number. New allocation logic was exercised in the local PostgreSQL rehearsal.
- Reservation table RLS is enabled; authenticated table SELECT and sequence UPDATE are denied, anonymous sequence USAGE is denied. Anonymous commit EXECUTE is denied, authenticated commit EXECUTE retained. Legacy lookup Q-000001 still resolves to OP-000001; its current public status is closed/paid with zero balance.
- 33 focused local checks passed, zero skips, including migration, high historical Q/counter seeding, retry, stable send/accept/release identity, skipped rollback allocation, surviving legacy reservation after row deletion, next project for a second owner, QC/Inventory/Finance/isolation regressions. Syntax and diff checks passed.

Security advisors returned no ERROR-level findings. The new private reservation table contributes an intentional INFO finding for RLS enabled without client policies: access is server-only and no client grants were added. Inherited warnings remain for six anonymous privileged functions, 36 authenticated privileged functions and disabled leaked-password protection. These were not silently changed by this numbering migration. Remediation references:

- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

A signed-in hosted/iPad/cross-device walkthrough remains a user test; no credentials were fabricated or requested in chat, and no test record was added to the owner's workspace for verification. The customer preview is still internal and not approved for public customer sharing. Finance integration and final customer quote/tracking/payment screens remain subsequent milestones.
