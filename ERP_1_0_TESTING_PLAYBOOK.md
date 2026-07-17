# OliPoly ERP 1.0 Testing Playbook

[Handbook](ERP_1_0_HANDBOOK.md) · [Workflow map](ERP_1_0_WORKFLOW_MAP.md) · [Deployment](ERP_1_0_DEPLOYMENT_GUIDE.md) · [Release audit](ERP_1_0_RELEASE_CANDIDATE_AUDIT.md)

Use a non-production Supabase project with production migrations and RLS. Use synthetic customer data. Record row IDs, timestamps, screenshots, console, and relevant Network requests. Repository tests cannot prove live RLS, Storage, email, payments, or database concurrency.

## Repository quality gate

```bash
# Syntax: check every tracked JavaScript file
git ls-files '*.js' -z | xargs -0 -n1 node --check

# Automated assertion suite
node --test tests/*.test.js

# Migration static safety checks used by this repository
node --test tests/release-1.0.test.js tests/release-candidate-acceptance.test.js

# Markdown internal links (repository-provided checker, if present)
node scripts/check-doc-links.js

# Patch hygiene
git diff --check
git status --short --branch
```

If no repository link checker exists, use the documented link parser/check command in the PR and manually inspect anchors. Do not claim browser verification from Node tests.

## Script A — retail customer to closeout

1. Sign in at Hub; create unique retail intake and explicitly open/save in Production. Assert no Order/reservation/Finance income.
2. Enter quantity, grams/hours, material, labor, packaging, hardware, printer; save `estimate`. Record UUID/Q.
3. Reload device B; clear device A site data and reload. Durable job must survive; local draft need not.
4. Send to Quote. Assert `waiting_customer`, unchanged inventory, Production suggested price consumed.
5. Enter retail pickup/delivery, tax, deposit, notes, turnaround, terms; save/send. Record snapshot/public URL.
6. Private/anonymous session: approve once while recording Network; double-click/reload/resubmit. Exactly one `respond_to_quote_public`; same returned OP.
7. Verify one Quote/Order/source link/event, identical snapshot, Production ready, exact Q/OP chain.
8. On device B compare Orders, Customer 360, Hub, tracking/payment, and Asset links.
9. Verify ready reservation, printing retention, mounted actual roll.
10. Record actuals/scrap, enter QC, trigger one reprint; first attempt remains, new reservation/attempt exists, no double depletion.
11. Complete reprint and QC pass: two attempts, consumption exactly actual+scrap once, unused released, zero active reservation.
12. Fulfill; record deposit/balance. Finance taxable sale/freight/payments reconcile and do not duplicate on reload.
13. Close Production/Orders. Tracking complete, read models/events consistent, assets retained, zero reservation.
14. Separate paid Order refund: linked refund/payment state/report correct; live reservation releases; consumed stock remains consumed.

## Script B — PO, exemption, invoice, Net 30

Create from saved estimate using Professional/PO mode. Enter company/contact, PO and part numbers/revision, billing/shipping, exemption evidence, freight, Net 30, zero deposit. Verify tax zero and snapshot on device B. Accept publicly and assert one RPC/OP/Order/event, preserved terms/evidence, Production ready. Execute production/inventory from Script A. Generate invoice; due date is invoice date +30, freight separate, full open balance. Verify Customer 360/Hub/tracking/private Assets on device B. Record one payment, verify paid/zero balance/tax-exempt reporting, close with no reservation.

## Script C — cancellation, shortage, mounted roll, concurrency

Cancel one waiting job (no reservation) and one ready job (full release/no consumption). Create demand over availability (visible shortage, no false adequate start/negative balance). Mount a roll and verify only it depletes at QC. With devices A/B, commit in A then submit stale B: warning/refresh, one final event, no duplicate ledger action. Disconnect A during save: no cloud success; reconnect and prove recovery never silently overwrites B.

## Job Files / Assets security and revision script

1. User A uploads an allowed synthetic file linked to exact recipe/Q/OP/job/customer keys and marks customer supplied; verify private object + metadata + links.
2. Upload new revision; verify prior object/metadata/links remain and exact-revision deep link remains pinned.
3. Archive/restore and reload; current-version selection and audit history behave correctly.
4. Generate signed download; verify it works while authorized and expires/is replaceable with a fresh request.
5. User B and anonymous session attempt metadata/path/object access: all denied. Confirm public Quote/tracking HTML/network contains no private path/signed URL.
6. Force/observe a safe failed upload in staging and verify no blind duplicate; inspect all storage/metadata layers.

## Backup/import and multi-device script

Create supported JSON export, parse it, record scope/count/checksum, and store securely. In isolated staging, take a pre-import backup; preview/import approved missing data; reload and reconcile counts/identities/totals. Confirm duplicate/conflict handling. Test draft, recovery, cache, and preference separately: only Supabase records appear on device B; recovery requires explicit import and never auto-uploads.

## Browser and accessibility matrix

Use desktop A, mobile B, and public/private session at widths 320, 375, 768, and desktop. Complete primary actions with keyboard and touch. Check no clipped action, horizontal page trap, inaccessible modal, overlapping keyboard/form control, unusable focus, or uncaught console error. This is a behavior check, not permission to redesign.

## Release acceptance checklist

- [ ] Every owner/handoff/status matches the [status dictionary](ERP_1_0_STATUS_DICTIONARY.md).
- [ ] One acceptance request/Order/event/Q→OP chain; no inferred IDs.
- [ ] Totals snapshot matches all customer/Order/Finance consumers.
- [ ] Inventory reservation/use/scrap/reprint/cancel/shortage/concurrency reconcile.
- [ ] Retail and PO/Net 30/Finance paths reconcile.
- [ ] Asset revision/private signed access and RLS matrix pass.
- [ ] Browser recovery does not auto-upload or overwrite newer remote data.
- [ ] Internal doc links and active-page Help links resolve to correct sections.
- [ ] Automated commands and migration static verification pass.
- [ ] Manual results, devices, synthetic IDs, defects, and screenshots/evidence are recorded truthfully.

