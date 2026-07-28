# OliPoly Engine RC2.4 — Campaign Submission Authority

> **RC2.7 continuation:** `ENGINE_RC2_7_GENERIC_CAMPAIGN_INTAKE.md` activates the existing native fundraiser page against this authority. Migration `202607280004_generic_campaign_intake.sql` narrows the public catalog and strengthens intake validation without changing staging ownership, immutability, idempotency, or downstream isolation.

## Executive decision and baseline

RC2.4 adds one immutable, idempotent staging authority for public campaign sale intent. A submission is **Not yet an Order** and cannot create Orders, Production, Inventory, Finance, invoices, payments, Customer 360 identities, or messages. Conversion is owned by RC2.5. RC2.6 records that historical Niles data is intentionally excluded, not queued for migration. The baseline is merge `0cbb67d646de8a1d5febff9ec2b4e167ff5c9d7e`, the exact `main` recorded in `.git/FETCH_HEAD`, containing RC2–RC2.3 and `202607280001_authoritative_asset_lifecycle.sql`.

## Current-source map

| Question | Finding |
|---|---|
| Campaign/product writers | Authenticated Campaign Manager writes owner-scoped `campaigns` and `campaign_products` through PostgREST. UUID is internal identity; slug/code/SKU are public lookup inputs. |
| Generic public page | `fundraiser.html?campaign=<slug>` calls only `get_public_campaign(text)`. It displays current enabled offers and an optional external-intake link; it does not collect or persist submissions. |
| Tally | `niles.html` embeds a hosted Tally form. No repository webhook, Edge Function, authenticity check, server runtime, or ingestion adapter exists. Tally is an input channel, not ERP authority. |
| Square | Niles opens external HSA Square links. A click or selection is not payment evidence and no confirmation returns here. |
| Niles | Legacy-specific HTML plus Tally, Square, and CSV/manual reconciliation; it is not a generic campaign database client. |
| Competing authority | No durable campaign-submission table/RPC existed. Historical Tally/CSV stays external. |
| Existing contracts | Campaign slug/code, product UUID/SKU, public URLs, lookup RPC, Tally embed, and Square links are preserved. |

## Schema, snapshot, and pricing authority

`202607280002_campaign_submission_authority.sql` additively supplies offer configuration (`variant_config`, fulfillment/payment options, disclosures), `campaign_submissions`, and `campaign_submission_items`. Searchable workflow fields remain typed; immutable campaign/customer/fulfillment/payment/consent and offer terms use JSONB. Currency amounts use `numeric(12,2)`. Explicit zero survives. Shipping/tax remain nullable because no present authority establishes them. Payment evidence defaults to `unverified`; selection, redirect, and link click never make it paid.

The immutable trigger rejects commercial-envelope mutation and item update/delete after the ingestion function's one atomic total finalization. Authenticated operators receive SELECT only, through owner RLS. Anonymous users receive no table access.

`submit_campaign_submission(jsonb)` is the sole public writer. It is `SECURITY DEFINER` with fixed `public, pg_temp` search path, qualified relations, revoked defaults, and narrow anon/authenticated EXECUTE. It rejects browser totals/prices/status/owner/payment-evidence fields; resolves an active in-window campaign by slug; resolves each enabled product UUID under that campaign; validates integer quantity and personalization; reads stored prices; calculates PostgreSQL numeric totals; snapshots campaign/offer terms; inserts envelope/items atomically; and returns only public reference/status. SQL errors roll back the transaction.

### Sanitized adapter request

```json
{"source":"operator_import","source_event_key":"synthetic-event-0001","source_schema_version":"1","campaign_code":"synthetic-campaign-slug","customer":{"name":"Synthetic Customer","email":"synthetic@example.invalid"},"fulfillment_selection":"event_pickup","fulfillment":{"location":"Synthetic event desk"},"payment_method_selection":"organization_payment","items":[{"campaign_product_id":"00000000-0000-4000-8000-000000000001","quantity":1,"personalization_requested":false,"variant":{}}],"consent":{"terms_version":"synthetic-v1","acknowledged":true},"source_metadata":{"adapter":"reviewed-manual-import"}}
```

Adapters must map fields explicitly, discard unknown fields/secrets/payment URLs, resolve approved product codes to UUIDs, and never include card/bank data. `source_metadata` is non-PII operational metadata and excluded from the replay fingerprint.

## Idempotency

`(submission_source, source_event_key)` is unique. Canonical JSONB is SHA-256 fingerprinted server-side. An exact retry returns the existing reference without new lines; concurrent retries converge on uniqueness. An altered replay increments conflict audit fields and returns rejected `conflicting_replay`, without changing the sale snapshot. Email/timestamp/browser storage are never keys.

## Tally/external status

**Automatic Tally ingestion: not active.** Safe deployment still needs an owner-operated server/Edge Function, Tally authenticity verification where supported, approved field IDs, stable submission ID mapping, explicit option-to-product mapping, secret custody, non-PII logging, and an approved server identity calling the RPC. No browser webhook secret or service key was invented. Until approved, the adapter contract supports reviewed, sanitized operator imports/testing—not live migration.

## Campaign Manager review lifecycle

Owner RLS supplies an authenticated review queue with campaign, status, date, evidence, fulfillment, and customer/reference filters; escaped immutable details; line personalization; stored totals; loading/empty/denied/error states; and a disabled RC2.5 conversion button. `review_campaign_submission` records reviewer/time and permits only:

- `new` → `under_review`, `duplicate`, `rejected`, `cancelled`
- `under_review` → `needs_clarification`, `approved_for_conversion`, `duplicate`, `rejected`
- `needs_clarification` → `under_review`, `cancelled`

`approved_for_conversion` remains staged. `converted` is reserved and blocked in RC2.4. Internal notes are separate from immutable customer text.

## PII, retention, and Niles boundary

No public listing, public review, payment credentials, real fixtures, or payload logging is introduced. Customer text is escaped and multiline notes wrap safely. RC2.4 adds no destructive retention job; retention, legal holds, export, and verified deletion require owner decisions.

No Niles records are imported or altered. Potential mappings include name/contact, SKU choice, quantity, personalization, fulfillment, and a proven stable Tally ID. Historical offer version, exact disclosure/consent, trusted payment evidence, product UUID, and later edits cannot safely be reconstructed from labels/HTML. Risks include duplicates, label mismatch, stale pricing, unverifiable payment, missing consent, and PII excess. RC2.6 records the owner decision: Niles remains a one-off historical/manual workflow, and none of these records may be imported or reconstructed.

## Deployment, verification, rollback

1. Verify migrations through `202607280001_authoritative_asset_lifecycle.sql` and drift.
2. Owner-review and manually apply `202607280002_campaign_submission_authority.sql`; Codex did not execute it.
3. Run sanitized checks below and synthetic cross-owner/anonymous tests.
4. Deploy Campaign Manager only after database verification.
5. Do not activate Tally automation until the missing runtime/authenticity/field-map contract is approved.

```sql
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('campaign_submissions','campaign_submission_items');
select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name like 'campaign_submission%';
select routine_name, security_type from information_schema.routines where routine_schema='public' and routine_name in ('submit_campaign_submission','review_campaign_submission');
select proname, proconfig from pg_proc join pg_namespace on pg_namespace.oid=pronamespace where nspname='public' and proname in ('submit_campaign_submission','review_campaign_submission');
select review_status,payment_evidence_state,count(*) from public.campaign_submissions where user_id=auth.uid() group by 1,2 order by 1,2;
```

Rollback disables RPC EXECUTE and reverts the application first while retaining audit rows. Removing functions/tables/columns is destructive and needs a separate migration. No down migration, backfill, conversion, production mutation, or Niles import is included.

## Manual validation and RC2.5 handoff

With synthetic data: first submit; exact retry; conflicting replay; double-click; inactive campaign; unrelated/disabled product; negative/zero/large quantity; enabled/disabled personalization; attempted client pricing; anonymous list/retrieve/review; cross-owner access; queue filters/details; every valid/invalid transition; multiline/XSS strings; 375/430/768/1280/1440 px; and confirm no downstream record/message/payment.

RC2.5 may consume only `approved_for_conversion` through a new atomic protected conversion authority. It must reference staging UUID, consume stored snapshots/totals rather than current settings, be idempotent, establish customer/order/payment semantics, and replace the conversion-reservation constraint. RC2.4 offers no conversion path.

## Unresolved owner decisions

- Exact fulfillment/payment vocabularies and authoritative shipping/tax configuration.
- Tally field IDs, signature mechanism, hosting runtime, secret custody, and replay/error operations.
- PII retention/deletion/legal-hold terms and trusted external reference policy.
- Multi-operator authorization beyond owner UUID.
- RC2.5 customer identity/payment verification handoff.
