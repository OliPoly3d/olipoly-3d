# OliPoly Engine RC2.7 — Generic Campaign Intake

## Executive summary and baseline

RC2.7 activates the existing `fundraiser.html?campaign=<slug>` as a native, multi-item intake client for the immutable RC2.4 staging boundary. Baseline `6d7a676b130474a6bebb1955219e552674a87be6` is the authoritative merged `main` available in this checkout and contains RC2.4 (`202607280002_campaign_submission_authority.sql`) and RC2.5 (`202607280003_campaign_order_conversion.sql`), including the global allocator and review-gated conversion UI. This checkout has no conventional remote. RC2.5 documentation records owner confirmation that deployed RC2.4 tables, RLS, anonymous denial, grants, search paths, immutability, idempotency, and empty initial staging passed; this environment has no privileged database connection and did not independently rerun those deployed checks.

This milestone stages sale intent only. It creates no Order, Production job, inventory event, Finance posting, invoice, payment evidence, Customer 360 merge, email, or redirect. A staged request is **Not yet an OliPoly Order**.

## Active public source map

| Concern | Active authority / runtime |
|---|---|
| URL and page frame | `fundraiser.html?campaign=<slug>` plus the existing RC5 legacy frame |
| Intake presentation | `assets/css/fundraiser-intake.css` |
| Browser data entry | `js/fundraiser-intake.js` using the publishable Supabase key only |
| Public catalog | `get_public_campaign(text)` |
| Campaign and offer configuration | `campaigns` and enabled `campaign_products` |
| Durable intake | `submit_campaign_submission(jsonb)` only |
| Staged evidence | immutable `campaign_submissions` and `campaign_submission_items` |
| Operator review | existing Campaign Manager queue and `review_campaign_submission` |
| Order conversion | authenticated RC2.5 `convert_campaign_submission_to_order`; never called publicly |

The prior page only rendered the catalog and optional external `public_config.intake_url`. RC2.7 removes that competing external-intake action from the generic page and calls the existing RC2.4 RPC. It adds no page, public lookup, queue, webhook, or endpoint.

## Public form and payload mapping

The public catalog returns only campaign identity/description/status/dates, a narrow safe configuration allowlist, and enabled offers. Each offer includes an opaque `campaign_product_id` used only as the RPC selector, public code/name/description/image, displayed price, variant rules, personalization rules, and customer disclosures. IDs are not rendered to customers.

The customer can select multiple distinct offers, quantities, standard/personalized mode, per-item personalization, configured variant, and authorized item notes. The form collects trimmed name/email, optional phone/organization/customer notes, one configured fulfillment choice, shipping address only for shipping, one configured instructional payment choice, and consent. Customer text is created with DOM `textContent`; it is not interpolated into HTML or logged.

The browser sends this shape (synthetic values only):

```json
{
  "source": "generic_public_campaign",
  "source_event_key": "00000000-0000-4000-8000-000000000000",
  "source_schema_version": "1",
  "campaign_code": "synthetic-campaign",
  "customer": {"name":"Synthetic Customer","email":"synthetic@example.invalid","phone":"","organization":""},
  "fulfillment_selection": "event_pickup",
  "fulfillment": {},
  "payment_method_selection": "pay_later",
  "items": [{"campaign_product_id":"00000000-0000-4000-8000-000000000001","quantity":1,"personalization_requested":false,"personalization":{},"variant":{}}],
  "customer_notes": "",
  "consent": {"acknowledged":true,"terms_version":"synthetic-v1"}
}
```

No client price, subtotal, total, shipping amount, tax, owner, payment evidence, review state, conversion state, reviewer, Order ID, or internal note is sent. The RPC resolves campaign/product relationships and database prices, calculates numeric line/envelope totals, snapshots configured options and offers, and returns only `submission_reference` and safe status. Displayed browser prices are catalog presentation, not a second pricing engine; the summary deliberately says the price is confirmed after submission.

## Configuration vocabulary

Campaign `public_config.fulfillment_options` is a configured array of strings or safe objects (`value`/`code`, optional label/instructions). Allowed codes are `event_pickup`, `local_pickup`, and `shipping`. No option is shown or accepted unless configured. Shipping requires an object with an explicit nonnegative `shipping_amount` (zero is preserved) and a shipping address; the server adds that configured amount. Pickup instructions/location come from the snapshotted configured object, not browser authority.

`public_config.payment_options` uses the same configured shape and permits `external_online`, `cash_at_event`, and `pay_later`. Selection is instructional. Evidence remains RC2.4's default `unverified`. An allowlisted `payment_link` is shown only after successful `external_online` staging; clicking it changes no record and causes no redirect before success. Campaign Manager configuration UI does not yet provide structured editors for these JSON fields; operators must use its existing `public_config` JSON field with reviewed configuration.

## Idempotency, state, retry, and confirmation

One cryptographically random UUID is created per logical attempt. A short-lived `sessionStorage` record holds only campaign slug and pending key—not PII or payload. Double clicks are locked. Network failure/timeouts retain fields, selections, and the same key. Exact retries converge on the database unique key/fingerprint and recover the same public reference. A changed replay receives a safe conflict message and cannot overwrite the snapshot. Confirmed success removes the pending key; only a genuinely new form creates another.

The accessible live region covers validation, submitting, server validation, conflict, and network-retry states without ordinary alert dialogs or raw Supabase/SQL/JWT detail. Loading, unavailable, scheduled/closed, no-products, misconfigured, ready, and submitted states render inline. Confirmation stays on the same URL and shows only public reference, campaign, item summary, fulfillment, instructional/unverified payment selection, support/approved payment instruction, review language, and **Not yet an OliPoly Order**.

## Security, PII, and abuse boundary

Migration `202607280004_generic_campaign_intake.sql` is required because RC2.4's public catalog omitted the opaque product UUID and RC2.4 offer configuration fields required to form a valid request, returned broad `public_config`/branding JSON, and did not strictly reject all unknown/nested fields or enforce configured intake options. The additive migration replaces only the two existing RPC definitions. It narrows catalog output, retains fixed search paths and explicit grants/revokes, and strengthens the writer with a 64 KiB request limit, 25-line limit, quantity 1–1000, contact/note limits, email validation, consent, nested allowlists, configured vocabulary, active campaign/offer relationships, required/unauthorized personalization checks, and duplicate logical-line rejection. It does not change live campaign rows or Niles.

Anonymous users retain only RPC execution: staging table SELECT remains revoked/RLS-protected; review/conversion remain authenticated-only; no service role or submission-search endpoint exists. The browser cannot select owner or authority state. The server stores the minimum submitted fulfillment contact snapshot needed for review and does not log it. RC2.7 adds no retention/deletion job. Spam remains possible because approved scope excludes CAPTCHA/rate-limit vendors; database/platform rate limiting, monitoring, retention policy, and abuse response remain owner decisions.

## Campaign Manager continuity

The writer inserts directly into RC2.4 tables, so no copying/import exists. The existing owner queue reads the envelope/items, safely escapes customer text, shows authoritative totals, personalization, fulfillment, instructional/unverified payment evidence, and “Not yet an Order.” RC2.7 adds a readable generic-source label but does not expose the source key. Only existing authenticated review transitions can reach `approved_for_conversion`; only RC2.5 then creates an unpaid Order. Conversion and its downstream isolation are unchanged.

## Niles and Tally boundaries

`niles.html`, its Tally embed, Square links, products, prices, personalization, images, URL, and historical/manual data are unchanged. Niles is not routed through this generic client and no Niles backfill/order exists. Automatic Tally ingestion remains inactive: no webhook, browser secret, Edge Function, adapter, or import was added. Future generic fundraisers use RC2.7 native intake unless a separately approved secure external-ingestion milestone is completed.

## Deployment and rollback

1. Confirm deployed migrations through RC2.5 and rerun RC2.4/RC2.5 structural and permission checks.
2. Review campaign safe configuration; do not mutate campaigns automatically.
3. Owner-review and manually apply `202607280004_generic_campaign_intake.sql`. This change did **not** execute it.
4. Run the sanitized verification below and anonymous/authenticated synthetic policy tests.
5. Deploy `fundraiser.html`, its JS/CSS, Campaign Manager label, and documentation.
6. Configure and test a synthetic generic campaign—not Niles—before a real campaign.

Rollback the public page/JS first, then revoke anon EXECUTE on `submit_campaign_submission(jsonb)` if intake must be stopped. Preserve staged evidence. Restore the prior RPC definitions only through a reviewed forward migration; do not destructively drop staging rows/tables.

```sql
select p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('get_public_campaign','submit_campaign_submission','review_campaign_submission','convert_campaign_submission_to_order');
select has_function_privilege('anon','public.submit_campaign_submission(jsonb)','execute') as anon_can_submit,
       has_function_privilege('anon','public.review_campaign_submission(uuid,text,text)','execute') as anon_can_review,
       has_function_privilege('anon','public.convert_campaign_submission_to_order(uuid)','execute') as anon_can_convert;
select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace
where n.nspname='public' and relname in ('campaign_submissions','campaign_submission_items');
select grantee,table_name,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in ('campaign_submissions','campaign_submission_items') order by 1,2,3;
select submission_source,review_status,payment_evidence_state,count(*) from public.campaign_submissions
where user_id=auth.uid() group by 1,2,3 order by 1,2,3;
```

## Synthetic manual validation and RC2.8 handoff

Manual validation remains required at 320, 375, 390, 430, 768, and desktop widths with a synthetic active campaign: load offers; mix standard/personalized lines; validate variants, required text, quantities, and shipping; submit; inspect one envelope/all items/reference/unverified evidence; exact retry and conflicting replay; tamper product/price/authority fields; verify anonymous reads/review/conversion fail; inspect Campaign Manager; optionally perform separately reviewed RC2.5 conversion; and confirm no pre-review Order, Production, Inventory, Finance, email, invoice, customer merge, or payment event. Repeat scheduled/closed/unavailable and network-timeout states. Confirm Niles byte-for-byte unchanged.

RC2.8 may build only on the immutable staged snapshot and reviewed conversion. It must not reinterpret a link click as payment, introduce public submission lookup, or activate Tally/Niles ingestion without separately approved authenticity, mapping, secret-custody, retention, and operations contracts.
