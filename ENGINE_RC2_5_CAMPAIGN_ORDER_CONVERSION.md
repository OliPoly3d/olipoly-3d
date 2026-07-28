# OliPoly Engine RC2.5 — Campaign Order Conversion

> **RC2.7 continuity:** Native generic campaign requests now enter the same RC2.4 tables with source `generic_public_campaign`. They remain review-gated, unverified, and Not yet an Order until this unchanged RC2.5 authority is explicitly invoked by an authenticated operator.

## Executive summary and authority map

RC2.5 establishes one database-owned Order identity for future Quote and campaign Orders, plus one atomic owner-only transition from an immutable approved RC2.4 submission to an unpaid Order. Baseline was `ce77f0f`; implementation continued from authority-gate commit `385a9ad`. The owner confirmed the deployed RC2.4 tables, RLS, anonymous denial, RPC permissions/search paths, idempotency, immutability, and empty initial staging tables.

Authority remains: RC2.4 submission/items own staged sale evidence; conversion owns only the one-time transition; Orders owns operational/payment summary; the immutable conversion snapshot owns historical campaign commerce; Production begins only through an explicit Order handoff; Customer 360 displays only safely related Orders; Finance posts only through its existing later payment/Order command. Conversion writes none of Production, Inventory, Finance, tracking, invoices, email, or assets.

## Global Order-number authority

`public.olipoly_order_number_seq` is global, noncycling, and initialized once during migration to one above the greatest conforming historical `OP-` numeric suffix. Nonconforming history is ignored and no Order is updated. Gaps are intentional: PostgreSQL sequence values are not rolled back or reused. `allocate_order_number()` uses only `nextval`, formats `OP-000001`, is `SECURITY DEFINER` with fixed search path, and is revoked from public/anonymous/authenticated browser roles. A unique Order-number index remains the final collision guard.

The active `respond_to_quote_public` definition from `202607200005_quote_acceptance_runtime_safety.sql` is preserved except for identity allocation: an already accepted Quote resolves and returns its existing Order before allocation; a new accepted Quote calls the allocator after financial validation and retains Quote UUID/source number, accepted snapshot, totals, deposit, balance, payment status, Production linkage, tracking, events, grants, and idempotency. Historical Quote/Order pairs are untouched. Quote suffixes no longer determine future Order numbers. Invoice numbering is unchanged.

## Conversion preconditions and transaction

The RPC requires `auth.uid()`, locks the exact submission, verifies owner UUID, returns exact converted Order evidence on retry, and otherwise requires `approved_for_conversion`. It loads immutable items in line sequence, requires at least one, verifies item quantity/count and line/envelope totals from stored RC2.4 numeric values, and never reads current campaign products.

In the same transaction it allocates one Order number; builds a versioned immutable source/campaign/submission/customer/fulfillment/payment-evidence/totals/item snapshot; inserts one `ready_to_print` Order under a unique submission relationship; records total exactly, deposit zero, balance exactly equal to accepted total, and payment status `unpaid`; inserts the immutable conversion snapshot; and records Order UUID/number, converter/time, and `converted` on the submission. Row locking and unique relationships make double clicks/concurrent calls converge; inconsistent converted evidence fails.

Shipping/tax remain exactly nullable/zero as staged, explicit zero remains zero, and payment selection/evidence is never payment. No discount, payment, income, inventory mutation, customer message, tracking row, invoice, or Production job is invented.

## Line items, customer, attribution, assets, and Finance

Every submitted line is preserved in sequence with product UUID/code, offer/title/variant snapshot, quantity, personalization selection, authoritative base/personalization prices, line total, and notes. The Order keeps typed campaign/submission relationships and convenient public reference/code plus the complete JSONB history.

RC2.4 public input contains no trusted Customer UUID authority—even a UUID inside public customer JSON is untrusted text. RC2.5 therefore stores the immutable contact snapshot, sets `unresolved_review_required`, and leaves campaign customer UUID null. It performs no name/email lookup or profile mutation. Customer 360 prevents approximate matching for unresolved campaign Orders; a directly selected Order can display its attribution without relating other records.

RC2.4 defines no submission asset relationship, so RC2.5 creates/copies no asset or Storage bytes. Order attribution is sufficient for the existing later Finance posting workflow; conversion posts no ledger record and changes no calculation.

## Production handoff and UI

No existing command could create a job for an Order without a Quote job. `create_production_job_for_order(uuid)` is therefore an explicit authenticated owner-only RPC. It locks the Order, returns an existing linked job idempotently, or inserts one normal `ready_to_print` production job. Campaign conversion never invokes it and it performs no Inventory/Finance action.

Campaign Manager displays immutable contact, ordered items, personalization, total, and unverified evidence; enables conversion only after approval; requires confirmation; locks duplicate clicks; calls one RPC; reloads authoritative state; reports created/already-converted/failure outcomes; and links to Orders Admin. Orders Admin presents source, campaign/reference, customer-link/evidence state, and immutable items. Customer 360 timeline attribution is limited by the identity rule above.

## Security, deployment, rollback, and verification

Deploy in this exact order: (1) confirm migrations through `202607280002`; (2) run read-only duplicate/preflight checks; (3) owner-review and manually apply `202607280003_campaign_order_conversion.sql`; (4) run sanitized verification below; (5) deploy private UI/JS; (6) perform synthetic owner/cross-owner/concurrency/regression/browser tests. This repository work did not execute the migration.

```sql
select last_value, is_called from public.olipoly_order_number_seq;
select order_number,count(*) from public.orders group by 1 having count(*)>1;
select campaign_submission_id,count(*) from public.orders where campaign_submission_id is not null group by 1 having count(*)>1;
select proname,prosecdef,proconfig from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('allocate_order_number','respond_to_quote_public','convert_campaign_submission_to_order','create_production_job_for_order');
select has_function_privilege('anon','public.convert_campaign_submission_to_order(uuid)','execute') as anon_can_convert,
       has_function_privilege('authenticated','public.convert_campaign_submission_to_order(uuid)','execute') as operator_can_convert,
       has_function_privilege('authenticated','public.allocate_order_number()','execute') as browser_can_allocate;
select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relname='campaign_order_conversion_snapshots';
select s.id,s.review_status,s.conversion_status,s.converted_order_id,o.order_number
from public.campaign_submissions s left join public.orders o on o.id=s.converted_order_id
where s.review_status='converted' and (o.id is null or o.campaign_submission_id is distinct from s.id);
```

If deployment fails, PostgreSQL rolls back the migration transaction except consumed sequence values (gaps are acceptable). After deployment, first revoke conversion/handoff EXECUTE and disable UI if needed; preserve Orders/snapshots/audit evidence and ship a reviewed forward fix rather than destructive rollback.

## Synthetic manual validation still required

Use only synthetic campaigns/customers: submit plus exact/conflicting retry; review and approve; inspect contact/items/personalization/totals; convert once and concurrently; verify one Order and same retry response; verify unpaid/zero deposit/full balance; inspect Orders; confirm no job/inventory/finance/email/tracking side effect; explicitly invoke Production handoff twice and verify one job; verify cross-owner/anonymous denial; verify unresolved Customer 360 isolation; move only through safe test workflow; review at 375, 430, 768, 1280, and 1440 px. Do not accept payment, send email, use real PII, or execute against live Niles data.

## RC2.6 boundary

No Niles page, Tally form, Square link, CSV, or historical record is changed/imported. A later reviewed import must supply stable source key, campaign/product UUID mappings, immutable customer/order snapshots, payment evidence, approval, duplicate detection, and personalization; it may not infer these from names, labels, clicks, or approximate matches.
