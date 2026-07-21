# ERP Retail versus Business Browser/Runtime Verification Results

> **Milestone type:** Documentation-only runtime verification checklist  
> **Blueprint:** ERP Blueprint v1 applies  
> **Status:** Pending operator evidence  
> **Production safety:** Do not change application code, schema, migrations, RLS, grants, UI, automated tests, customer data, or deployed data as part of this milestone.

## 1. Purpose and hard boundaries

This milestone creates a controlled browser/runtime verification plan for the Retail/Individual and Business/PO Quote paths recommended by `ERP_RETAIL_BUSINESS_CONTRACT_VERIFICATION.md`.

The operator must create exactly two new controlled test records:

1. One **Retail/Individual Quote**.
2. One **Business/PO Quote**.

The operator may observe and record evidence, but must not use this document to repair defects. If a concrete defect is discovered later, open a separate focused corrective milestone with its own scope, evidence, implementation, tests, commit, and PR.

### Explicitly out of scope

- Application code changes.
- Supabase schema, migration, RLS, grant, trigger, or function changes.
- UI redesign or behavior changes.
- Automated test changes.
- Test customer creation beyond the two controlled records named above.
- Any change to real customer data.
- Any SQL that writes data.
- Merging, deploying, or accepting real customer Quotes.

## 2. Repository evidence used for this checklist

The checklist is grounded only in checked-in repository evidence and is still pending deployed/browser proof.

| Evidence                                                                                                                                    | Repository file                                                                                                               | Runtime implication                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| One shared Quote type selector/configuration includes Retail and Business/PO variants.                                                      | `js/quote.js`                                                                                                                 | Browser should use one Quote path with customer-type-specific presentation.                                                                          |
| Quote save/load includes Business commercial fields such as PO, tax-exempt evidence flags, billing address, and shipping fields.            | `js/quote.js`                                                                                                                 | Business/PO values supplied by the operator should persist through save/reload.                                                                      |
| One pricing engine computes subtotal, tax, deposit, balance, and final total.                                                               | `js/quote-pricing.js`                                                                                                         | Retail and Business/PO displayed totals should agree with the same canonical totals snapshot.                                                        |
| Acceptance RPC creates/links the accepted Order, accepted commercial snapshot, public tracking row, and Production handoff transactionally. | `supabase/migrations/202607200005_quote_acceptance_runtime_safety.sql`                                                        | Public acceptance should create exactly one OP identity and move accepted Production to `ready_to_print`.                                            |
| Accepted commercial snapshots are immutable and must contain Quote number and totals.                                                       | `supabase/migrations/202607200002_quote_acceptance_authority.sql`                                                             | Accepted Quote evidence should not be rewritten by browser edits after acceptance.                                                                   |
| Public tracking lookup exposes an explicit allowlisted projection.                                                                          | `supabase/migrations/202607200001_public_access_ownership_security_hardening.sql`                                             | Public tracking must not leak tokens, auth data, tax evidence files, AP-only fields beyond the allowlist, or unnecessary customer-sensitive details. |
| Workflow command contracts use shared Order/Production/Inventory/Finance identities.                                                        | `supabase/migrations/202607200008_workflow_command_authority_parameter_default_compatibility.sql` and `js/workflow-status.js` | Production, Inventory, Finance, and tracking should agree on the same OP identity regardless of customer type.                                       |

## 3. Classification vocabulary

Use only these result classifications in this document:

- **Compliant**
- **Partially compliant**
- **Conflicting**
- **Missing**
- **Unable to verify from repository evidence**

All rows below start as **Pending operator evidence** until screenshots, browser observations, network observations, and the read-only diagnostic output are supplied.

## 4. Controlled test-record naming

Use names that cannot be confused with real customers.

| Test path             | Required identifying values                                                                                                              | Operator-filled value |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Retail/Individual     | Customer name begins with `RUNTIME VERIFY RETAIL`, unique timestamp, and a non-customer test email.                                      | Pending               |
| Business/PO           | Company begins with `RUNTIME VERIFY BUSINESS`, contact begins with `RUNTIME VERIFY AP`, unique timestamp, and a non-customer test email. | Pending               |
| Retail Quote number   | Assigned by the application after save.                                                                                                  | Pending               |
| Business Quote number | Assigned by the application after save.                                                                                                  | Pending               |
| Retail Order number   | Assigned by acceptance; expected `OP-######` corresponding to Quote number.                                                              | Pending               |
| Business Order number | Assigned by acceptance; expected `OP-######` corresponding to Quote number.                                                              | Pending               |

## 5. Operator checklist: Retail/Individual Quote

> **Evidence status:** Pending until an operator supplies observations.  
> **Expected classification:** Retail/Individual.

### 5.1 Production estimate creation

1. Sign in as an authorized internal operator.
2. Open the current deployed Production Control page.
3. Create a new controlled Production estimate with the Retail test name.
4. Enter manufacturing assumptions sufficient to produce a suggested selling price.
5. Save the estimate.
6. Confirm the estimate is in a pre-acceptance state such as `estimate` or `waiting_customer`.
7. Confirm no Order number exists yet.
8. Confirm no Inventory reservation or consumption is created at estimate/waiting-customer time.
9. Record the Production job identifier, Quote number if assigned, status, estimated material, estimated hours, suggested price, and timestamp.

### 5.2 Quote creation and customer-type selection

1. Push or create the Quote from the Production estimate using the normal deployed workflow.
2. Select the Retail/Individual customer type.
3. Enter only Retail-appropriate customer/contact fields.
4. Do not enter Business-only purchasing fields such as PO number, invoice terms, AP email, tax exemption evidence, formal billing address, or company purchasing identity unless the Retail UI unexpectedly requires them.
5. Save the Quote.
6. Reload the Quote from the server, not only from browser state.
7. Confirm the Retail classification persists.
8. Confirm no Business-only purchasing field is required to save or present the Quote.

### 5.3 Canonical totals

1. Record displayed subtotal, discount if any, tax, deposit, balance, and total.
2. Confirm the public Quote page shows the same customer-facing totals.
3. Confirm the accepted commercial snapshot later contains the same subtotal/tax/deposit/balance/total values.
4. Confirm the accepted Order has matching total, deposit, and balance values.
5. If any downstream view displays a different value, classify the row as **Conflicting** and stop before proposing a fix.

### 5.4 Public Quote rendering on desktop and mobile

1. Open the public Quote link on desktop.
2. Capture a screenshot of the visible customer-facing Quote page.
3. Open the same public Quote link using a mobile viewport or phone.
4. Capture a screenshot of the mobile public Quote page.
5. Confirm Business-only fields are absent from Retail public presentation and not required for acceptance.
6. Confirm customer-facing totals match the internal Quote.
7. Confirm no public token is visible in page content, console logs, or copied customer-facing text.

### 5.5 Public acceptance

1. Accept the Retail Quote using only the public Quote acceptance control.
2. Do not manually create an Order.
3. Do not manually move Production to accepted state.
4. Record the browser response and assigned Order number.
5. Retry page refresh once after acceptance and confirm the already-accepted state is stable and does not create a second Order.

### 5.6 Accepted commercial snapshot, Order creation, linkage, and handoff

1. Confirm the Quote shows accepted/converted status.
2. Confirm the accepted commercial snapshot exists.
3. Confirm exactly one Order exists for the source Quote.
4. Confirm the accepted Order begins in `ready_to_print`.
5. Confirm `orders.source_quote_number`, `quotes.converted_order_number`, `production_jobs.quote_number`, and `production_jobs.order_number` form one exact Q/OP chain.
6. Confirm Production moved to `ready_to_print` only through acceptance handoff.
7. Confirm Inventory reservation begins only at the Ready-to-Print boundary and not before acceptance.
8. Confirm no Finance posting occurs until the Finance posting boundary is intentionally reached by the appropriate internal action.
9. Confirm public tracking uses the accepted Order identity.
10. Confirm Retail public tracking does not expose Business-only PO, invoice terms, AP, billing, shipping, or tax-exempt evidence details.

## 6. Operator checklist: Business/PO Quote

> **Evidence status:** Pending until an operator supplies observations.  
> **Expected classification:** Business/PO.

### 6.1 Production estimate creation

1. Sign in as an authorized internal operator.
2. Open the current deployed Production Control page.
3. Create a new controlled Production estimate with the Business test company/contact identifiers.
4. Enter manufacturing assumptions sufficient to produce a suggested selling price.
5. Save the estimate.
6. Confirm the estimate is in a pre-acceptance state such as `estimate` or `waiting_customer`.
7. Confirm no Order number exists yet.
8. Confirm no Inventory reservation or consumption is created at estimate/waiting-customer time.
9. Record the Production job identifier, Quote number if assigned, status, estimated material, estimated hours, suggested price, and timestamp.

### 6.2 Quote creation and customer-type selection

1. Push or create the Quote from the Production estimate using the normal deployed workflow.
2. Select the Business/PO customer type.
3. Enter company and customer/contact identity.
4. Enter a controlled PO number.
5. Enter applicable tax-exempt evidence indicators if this test is intended to exercise exemption.
6. Enter invoice terms and AP email where the UI supplies those fields.
7. Enter billing and shipping fields where the UI supplies those fields.
8. Save the Quote.
9. Reload the Quote from the server, not only from browser state.
10. Confirm the Business/PO classification persists.
11. Confirm company/customer identity, PO number, tax-exempt evidence indicators, invoice terms, AP email, billing fields, and shipping fields persist where supplied.
12. Confirm no Retail payment assumptions overwrite supplied Business terms.

### 6.3 Canonical totals

1. Record displayed subtotal, discount if any, tax, deposit, balance, and total.
2. Confirm tax is zero only if tax-exempt behavior was explicitly supplied and displayed as such.
3. Confirm the public Quote page shows the same customer-facing totals.
4. Confirm the accepted commercial snapshot later contains the same subtotal/tax/deposit/balance/total values.
5. Confirm the accepted Order has matching total, deposit, and balance values.
6. If any downstream view displays a different value, classify the row as **Conflicting** and stop before proposing a fix.

### 6.4 Public Quote rendering on desktop and mobile

1. Open the public Quote link on desktop.
2. Capture a screenshot of the visible customer-facing Quote page.
3. Open the same public Quote link using a mobile viewport or phone.
4. Capture a screenshot of the mobile public Quote page.
5. Confirm company/customer identity appears as intended.
6. Confirm PO, invoice terms, billing/shipping fields, and tax-exempt indicators appear only where intended for the Quote recipient.
7. Confirm AP email and tax-exempt evidence files are not exposed publicly unless the deployed UI has an explicit customer-facing reason to show them.
8. Confirm no public token is visible in page content, console logs, or copied customer-facing text.

### 6.5 Public acceptance

1. Accept the Business/PO Quote using only the public Quote acceptance control.
2. Do not manually create an Order.
3. Do not manually move Production to accepted state.
4. Record the browser response and assigned Order number.
5. Retry page refresh once after acceptance and confirm the already-accepted state is stable and does not create a second Order.

### 6.6 Accepted commercial snapshot, Order creation, linkage, and handoff

1. Confirm the Quote shows accepted/converted status.
2. Confirm the accepted commercial snapshot exists.
3. Confirm exactly one Order exists for the source Quote.
4. Confirm the accepted commercial snapshot and Order agree exactly on totals and customer type.
5. Confirm `orders.source_quote_number`, `quotes.converted_order_number`, `production_jobs.quote_number`, and `production_jobs.order_number` form one exact Q/OP chain.
6. Confirm Production moved to `ready_to_print` only through acceptance handoff.
7. Confirm Inventory reservation begins only at the Ready-to-Print boundary and not before acceptance.
8. Confirm no Finance posting occurs until the Finance posting boundary is intentionally reached by the appropriate internal action.
9. Confirm Production, Inventory, Finance, and tracking use the same Order identity.
10. Confirm public tracking does not leak unnecessary PO evidence, tax exemption evidence, AP email, billing details, shipping details, public token values, auth data, or internal notes.

## 7. Browser localStorage and network behavior checklist

Run this checklist once for each controlled Quote.

1. Before saving, open browser developer tools and record relevant `localStorage` keys.
2. Save and reload the Quote from the server.
3. Confirm local browser draft/fallback keys do not become the authority after a server save.
4. Open the public Quote page in a clean browser profile or incognito session.
5. Confirm no authenticated operator session is required for public Quote rendering.
6. Inspect network calls during public render and acceptance.
7. Confirm public acceptance uses the Quote public response path/RPC and does not call browser-side direct inserts/updates for `orders`, `production_jobs`, `order_tracking_public`, Inventory, Finance, or customer tables.
8. Confirm public network responses do not include public tokens, auth tokens, RLS bypass evidence, or unnecessary customer-sensitive fields.
9. Confirm any localStorage values created by public pages contain only non-authoritative UI state.

## 8. Result tables

### 8.1 Retail browser observations

| Observation                                                  | Expected result                                                                      | Evidence supplied          |                            Classification |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------- | ----------------------------------------: |
| Retail/Individual classification persists after save/reload. | Retail/Individual.                                                                   | Pending operator evidence. | Unable to verify from repository evidence |
| Business-only purchasing fields are not required.            | No PO, invoice terms, AP email, or tax evidence required.                            | Pending operator evidence. | Unable to verify from repository evidence |
| Retail payment behavior is preserved.                        | Retail payment/deposit behavior appears and is not overwritten by Business terms.    | Pending operator evidence. | Unable to verify from repository evidence |
| Subtotal, tax, deposit, balance, and total are correct.      | Internal Quote, public Quote, accepted snapshot, and Order agree.                    | Pending operator evidence. | Unable to verify from repository evidence |
| Accepted Order starts ready to print.                        | Order status is `ready_to_print`.                                                    | Pending operator evidence. | Unable to verify from repository evidence |
| Public tracking excludes Business-only fields.               | No PO, AP, Business invoice terms, tax evidence, or billing details leak for Retail. | Pending operator evidence. | Unable to verify from repository evidence |

### 8.2 Business browser observations

| Observation                                            | Expected result                                                              | Evidence supplied          |                            Classification |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------- | ----------------------------------------: |
| Business/PO classification persists after save/reload. | Business/PO.                                                                 | Pending operator evidence. | Unable to verify from repository evidence |
| Company/customer identity persists.                    | Company and contact remain visible after server reload.                      | Pending operator evidence. | Unable to verify from repository evidence |
| PO number persists.                                    | Supplied controlled PO number remains on Quote/Order where expected.         | Pending operator evidence. | Unable to verify from repository evidence |
| Tax-exempt evidence persists where supplied.           | Tax-exempt flags/reason/certificate indicator remain available internally.   | Pending operator evidence. | Unable to verify from repository evidence |
| Invoice terms and AP email persist where supplied.     | Business terms are not overwritten by Retail defaults.                       | Pending operator evidence. | Unable to verify from repository evidence |
| Billing/shipping fields persist where supplied.        | Internal Quote/Order preserve supplied fields.                               | Pending operator evidence. | Unable to verify from repository evidence |
| Accepted snapshot and Order agree exactly.             | Customer type and totals agree between accepted snapshot and Order.          | Pending operator evidence. | Unable to verify from repository evidence |
| Same Order identity is used downstream.                | Production, Inventory, Finance, and tracking all use the accepted OP number. | Pending operator evidence. | Unable to verify from repository evidence |

### 8.3 Mobile/public privacy observations

| Observation                        | Expected result                                                                                            | Evidence supplied          |                            Classification |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------: |
| Retail public desktop rendering.   | Totals and Retail presentation match internal Quote.                                                       | Pending operator evidence. | Unable to verify from repository evidence |
| Retail public mobile rendering.    | Same content, responsive layout, no Business field leak.                                                   | Pending operator evidence. | Unable to verify from repository evidence |
| Business public desktop rendering. | Business presentation is intentional and customer-facing only.                                             | Pending operator evidence. | Unable to verify from repository evidence |
| Business public mobile rendering.  | Same content, responsive layout, no unnecessary sensitive details.                                         | Pending operator evidence. | Unable to verify from repository evidence |
| Public tracking privacy.           | Allowlisted tracking projection only; no tokens/auth data/internal notes.                                  | Pending operator evidence. | Unable to verify from repository evidence |
| Customer-facing privacy.           | No unnecessary PO evidence files, tax evidence files, AP-only notes, private addresses, or auth data leak. | Pending operator evidence. | Unable to verify from repository evidence |

### 8.4 Network/RPC observations

| Observation                        | Expected result                                                                                    | Evidence supplied          |                            Classification |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------: |
| Public Quote render network calls. | Public read path only; no direct browser writes.                                                   | Pending operator evidence. | Unable to verify from repository evidence |
| Public acceptance network calls.   | `respond_to_quote_public` or deployed equivalent; no direct inserts to Orders/Production/tracking. | Pending operator evidence. | Unable to verify from repository evidence |
| Idempotent acceptance retry.       | One accepted Quote, one Order, one tracking identity.                                              | Pending operator evidence. | Unable to verify from repository evidence |
| Browser localStorage.              | Non-authoritative UI/cache state only.                                                             | Pending operator evidence. | Unable to verify from repository evidence |
| Network payload privacy.           | No public tokens/auth/session data or unnecessary sensitive customer fields in responses.          | Pending operator evidence. | Unable to verify from repository evidence |

### 8.5 Consolidated SQL output

| Observation                                  | Expected result                                                                     | Evidence supplied          |                            Classification |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------: |
| One JSONB row returned.                      | Result column is `retail_business_runtime_verification`.                            | Pending operator evidence. | Unable to verify from repository evidence |
| Quote identity and customer type compared.   | Retail and Business are classified as expected.                                     | Pending operator evidence. | Unable to verify from repository evidence |
| Quote totals and commercial fields compared. | Totals and expected fields match UI observations.                                   | Pending operator evidence. | Unable to verify from repository evidence |
| Accepted snapshots present and consistent.   | Snapshot exists for each accepted Quote and agrees with Order totals.               | Pending operator evidence. | Unable to verify from repository evidence |
| Converted Order identity present.            | One OP identity per source Quote.                                                   | Pending operator evidence. | Unable to verify from repository evidence |
| Production linkage/status present.           | Production uses same Q/OP chain and `ready_to_print` after acceptance.              | Pending operator evidence. | Unable to verify from repository evidence |
| Inventory reservation linkage visible.       | Reservation evidence, if present, links through the same Production/Order identity. | Pending operator evidence. | Unable to verify from repository evidence |
| Finance posting linkage visible.             | Finance evidence, if present, links through the same Order identity.                | Pending operator evidence. | Unable to verify from repository evidence |
| Missing or mismatched fields reported.       | `missing_or_mismatched_fields` is empty only if no mismatches are found.            | Pending operator evidence. | Unable to verify from repository evidence |

### 8.6 Final classification

| Area                                              |                      Final classification | Evidence basis             | Notes    |
| ------------------------------------------------- | ----------------------------------------: | -------------------------- | -------- |
| Retail/Individual browser/runtime flow            | Unable to verify from repository evidence | Pending operator evidence. | Pending. |
| Business/PO browser/runtime flow                  | Unable to verify from repository evidence | Pending operator evidence. | Pending. |
| Public desktop/mobile rendering                   | Unable to verify from repository evidence | Pending operator evidence. | Pending. |
| Accepted commercial snapshot parity               | Unable to verify from repository evidence | Pending operator evidence. | Pending. |
| Order/Production/Inventory/Finance identity chain | Unable to verify from repository evidence | Pending operator evidence. | Pending. |
| Public tracking/customer-facing privacy           | Unable to verify from repository evidence | Pending operator evidence. | Pending. |
| Browser localStorage/network authority            | Unable to verify from repository evidence | Pending operator evidence. | Pending. |

## 9. Consolidated read-only Supabase diagnostic query

> **Operator instruction:** Run only after the two controlled Quotes have been created and accepted. Replace the two placeholders with the controlled Quote numbers. This query is strictly read-only, returns one row with one JSONB column, and intentionally avoids public tokens, authentication data, raw customer emails, raw phone numbers, tax evidence files, and internal notes.

```sql
with input as (
  select
    'Q-RETAIL-QUOTE-NUMBER-HERE'::text as retail_quote_number,
    'Q-BUSINESS-QUOTE-NUMBER-HERE'::text as business_quote_number
), quote_scope as (
  select 'retail'::text as expected_path, retail_quote_number as quote_number from input
  union all
  select 'business'::text as expected_path, business_quote_number as quote_number from input
), q as (
  select
    qs.expected_path,
    qu.id,
    qu.user_id,
    qu.quote_number,
    qu.quote_status,
    qu.customer_response,
    qu.converted_order_number,
    qu.accepted_at,
    qu.accepted_date,
    qu.accepted_commercial_snapshot_id,
    qu.customer_name is not null as has_customer_name,
    qu.customer_email is not null as has_customer_email,
    qu.customer_phone is not null as has_customer_phone,
    qu.quote_title,
    qu.quote_total,
    qu.customer_totals,
    qu.quote_data,
    qu.po_number,
    qu.tax_exempt,
    qu.tax_exempt_reason is not null as has_tax_exempt_reason,
    qu.exemption_certificate_on_file,
    qu.po_file_on_file,
    qu.po_part_number,
    qu.olipoly_part_number,
    qu.part_revision,
    qu.shipping_contact_name is not null as has_shipping_contact_name,
    qu.shipping_company is not null as has_shipping_company,
    qu.shipping_address is not null as has_shipping_address,
    qu.billing_address is not null as has_billing_address
  from quote_scope qs
  left join public.quotes qu on qu.quote_number = qs.quote_number
), s as (
  select
    q.expected_path,
    snap.id,
    snap.quote_number,
    snap.order_number,
    snap.accepted_at,
    snap.snapshot
  from q
  left join public.quote_accepted_commercial_snapshots snap
    on snap.quote_number = q.quote_number
), o as (
  select
    q.expected_path,
    ord.id,
    ord.user_id,
    ord.order_number,
    ord.source_quote_number,
    ord.created_from_quote,
    ord.accepted_date,
    ord.status,
    ord.quantity,
    ord.order_total,
    ord.deposit_amount,
    ord.balance_amount,
    ord.payment_status,
    ord.fulfillment,
    ord.customer_name is not null as has_customer_name,
    ord.customer_email is not null as has_customer_email,
    ord.customer_phone is not null as has_customer_phone,
    ord.order_title,
    ord.po_number,
    ord.tax_exempt,
    ord.tax_exempt_reason is not null as has_tax_exempt_reason,
    ord.exemption_certificate_on_file,
    ord.po_file_on_file,
    ord.po_part_number,
    ord.olipoly_part_number,
    ord.part_revision,
    ord.invoice_number,
    ord.invoice_date,
    ord.invoice_due_date,
    ord.invoice_terms,
    ord.ap_email is not null as has_ap_email,
    ord.billing_address is not null as has_billing_address,
    ord.shipping_address is not null as has_shipping_address,
    ord.shipping_contact_name is not null as has_shipping_contact_name,
    ord.shipping_company is not null as has_shipping_company,
    ord.finance_pushed,
    ord.finance_pushed_at,
    ord.invoice_sent,
    ord.invoice_sent_at,
    ord.updated_at
  from q
  left join public.orders ord
    on ord.source_quote_number = q.quote_number
    or ord.order_number = q.converted_order_number
), p as (
  select
    q.expected_path,
    coalesce(jsonb_agg(jsonb_build_object(
      'production_job_id', pj.id,
      'quote_number', pj.quote_number,
      'order_number', pj.order_number,
      'production_status', pj.production_status,
      'has_actual_usage', coalesce(pj.actual_grams_used, 0) > 0,
      'updated_at', pj.updated_at
    ) order by pj.updated_at desc) filter (where pj.id is not null), '[]'::jsonb) as production_jobs
  from q
  left join public.production_jobs pj
    on pj.quote_number = q.quote_number
    or pj.order_number = q.converted_order_number
  group by q.expected_path
), tracking as (
  select
    q.expected_path,
    coalesce(jsonb_agg(jsonb_build_object(
      'order_number', otp.order_number,
      'order_title_present', otp.order_title is not null,
      'status', otp.status,
      'payment_status', otp.payment_status,
      'order_total', otp.order_total,
      'public_status_text_present', otp.public_status_text is not null,
      'public_next_step_present', otp.public_next_step is not null,
      'shipping_or_pickup_note_present', otp.shipping_or_pickup_note is not null,
      'tracking_number_present', otp.tracking_number is not null,
      'payment_link_present', otp.payment_link is not null or otp.payment_link_stripe is not null or otp.payment_link_paypal is not null or otp.payment_link_venmo is not null,
      'paid_date', otp.paid_date,
      'po_number_present', otp.po_number is not null,
      'invoice_number_present', otp.invoice_number is not null,
      'invoice_terms_present', otp.invoice_terms is not null
    ) order by otp.updated_at desc) filter (where otp.order_number is not null), '[]'::jsonb) as public_tracking_allowlisted_projection
  from q
  left join public.order_tracking_public otp
    on otp.order_number = q.converted_order_number
    or otp.order_number = regexp_replace(q.quote_number, '^Q-', 'OP-')
  group by q.expected_path
), inventory as (
  select
    q.expected_path,
    coalesce(jsonb_agg(jsonb_build_object(
      'reservation_id', pmr.id,
      'production_job_id', pmr.production_job_id,
      'order_number', pmr.order_number,
      'reserved_grams', pmr.reserved_grams,
      'status', pmr.status,
      'reservation_command_id', pmr.reservation_command_id,
      'release_command_id_present', pmr.release_command_id is not null,
      'consume_command_id_present', pmr.consume_command_id is not null,
      'attempt_id_present', pmr.attempt_id is not null,
      'created_at', pmr.created_at,
      'updated_at', pmr.updated_at
    ) order by pmr.updated_at desc) filter (where pmr.id is not null), '[]'::jsonb) as inventory_reservation_linkage
  from q
  left join o on o.expected_path = q.expected_path
  left join public.production_jobs pj
    on pj.quote_number = q.quote_number
    or pj.order_number = coalesce(o.order_number, q.converted_order_number)
  left join public.production_material_reservations pmr
    on pmr.production_job_id = pj.id
    or pmr.order_number = coalesce(o.order_number, q.converted_order_number)
  group by q.expected_path
), finance as (
  select
    q.expected_path,
    coalesce(jsonb_agg(jsonb_build_object(
      'financial_entry_id', fe.id,
      'order_number', fe.order_number,
      'type', fe.type,
      'amount', fe.amount,
      'finance_command', fe.finance_command,
      'created_at', fe.created_at
    ) order by fe.created_at desc) filter (where fe.id is not null), '[]'::jsonb) as finance_posting_linkage
  from q
  left join o on o.expected_path = q.expected_path
  left join public.financial_entries fe
    on fe.order_number = coalesce(o.order_number, q.converted_order_number)
  group by q.expected_path
), per_path as (
  select
    q.expected_path,
    jsonb_build_object(
      'quote_identity_and_customer_type', jsonb_build_object(
        'expected_path', q.expected_path,
        'quote_found', q.id is not null,
        'quote_number', q.quote_number,
        'quote_status', q.quote_status,
        'customer_response', q.customer_response,
        'converted_order_number', q.converted_order_number,
        'customer_type_from_quote_data', coalesce(q.quote_data->>'customerType', q.quote_data->>'liteQuoteType', q.quote_data->>'quoteType'),
        'has_customer_name', q.has_customer_name,
        'has_customer_email', q.has_customer_email,
        'has_customer_phone', q.has_customer_phone
      ),
      'quote_totals_and_commercial_fields', jsonb_build_object(
        'quote_total', q.quote_total,
        'customer_totals', q.customer_totals,
        'quote_data_total_fields', jsonb_build_object(
          'subtotal', q.quote_data->>'subtotal',
          'tax', q.quote_data->>'tax',
          'deposit', q.quote_data->>'deposit',
          'balance', q.quote_data->>'balance',
          'total', q.quote_data->>'total'
        ),
        'po_number_present', q.po_number is not null,
        'tax_exempt', q.tax_exempt,
        'has_tax_exempt_reason', q.has_tax_exempt_reason,
        'exemption_certificate_on_file', q.exemption_certificate_on_file,
        'po_file_on_file', q.po_file_on_file,
        'po_part_number_present', q.po_part_number is not null,
        'olipoly_part_number_present', q.olipoly_part_number is not null,
        'part_revision_present', q.part_revision is not null,
        'has_billing_address', q.has_billing_address,
        'has_shipping_address', q.has_shipping_address,
        'has_shipping_contact_name', q.has_shipping_contact_name,
        'has_shipping_company', q.has_shipping_company
      ),
      'accepted_snapshot', jsonb_build_object(
        'snapshot_found', s.id is not null,
        'snapshot_quote_number', s.quote_number,
        'snapshot_order_number', s.order_number,
        'snapshot_accepted_at', s.accepted_at,
        'snapshot_totals', s.snapshot->'totals',
        'snapshot_customer_type', coalesce(s.snapshot#>>'{offer,customerType}', s.snapshot#>>'{offer,liteQuoteType}', s.snapshot#>>'{offer,quoteType}')
      ),
      'converted_order_identity', jsonb_build_object(
        'order_found', o.id is not null,
        'order_number', o.order_number,
        'source_quote_number', o.source_quote_number,
        'created_from_quote', o.created_from_quote,
        'accepted_date', o.accepted_date
      ),
      'order_totals_and_customer_type', jsonb_build_object(
        'status', o.status,
        'quantity', o.quantity,
        'order_total', o.order_total,
        'deposit_amount', o.deposit_amount,
        'balance_amount', o.balance_amount,
        'payment_status', o.payment_status,
        'fulfillment', o.fulfillment,
        'order_customer_type_from_quote_data', coalesce(q.quote_data->>'customerType', q.quote_data->>'liteQuoteType', q.quote_data->>'quoteType')
      ),
      'po_tax_invoice_billing_shipping_fulfillment_fields', jsonb_build_object(
        'po_number_present', o.po_number is not null,
        'tax_exempt', o.tax_exempt,
        'has_tax_exempt_reason', o.has_tax_exempt_reason,
        'exemption_certificate_on_file', o.exemption_certificate_on_file,
        'po_file_on_file', o.po_file_on_file,
        'po_part_number_present', o.po_part_number is not null,
        'olipoly_part_number_present', o.olipoly_part_number is not null,
        'part_revision_present', o.part_revision is not null,
        'invoice_number_present', o.invoice_number is not null,
        'invoice_date', o.invoice_date,
        'invoice_due_date', o.invoice_due_date,
        'invoice_terms', o.invoice_terms,
        'has_ap_email', o.has_ap_email,
        'has_billing_address', o.has_billing_address,
        'has_shipping_address', o.has_shipping_address,
        'has_shipping_contact_name', o.has_shipping_contact_name,
        'has_shipping_company', o.has_shipping_company,
        'fulfillment', o.fulfillment,
        'finance_pushed', o.finance_pushed,
        'finance_pushed_at', o.finance_pushed_at,
        'invoice_sent', o.invoice_sent,
        'invoice_sent_at', o.invoice_sent_at
      ),
      'production_linkage_status', p.production_jobs,
      'public_tracking_allowlisted_projection', tracking.public_tracking_allowlisted_projection,
      'inventory_reservation_linkage', inventory.inventory_reservation_linkage,
      'finance_posting_linkage', finance.finance_posting_linkage,
      'missing_or_mismatched_fields', (
        select coalesce(jsonb_agg(issue), '[]'::jsonb)
        from (
          select 'quote_missing'::text as issue where q.id is null
          union all select 'accepted_snapshot_missing' where q.customer_response = 'accepted' and s.id is null
          union all select 'converted_order_missing' where q.customer_response = 'accepted' and o.id is null
          union all select 'quote_converted_order_mismatch' where q.converted_order_number is not null and o.order_number is not null and q.converted_order_number is distinct from o.order_number
          union all select 'order_source_quote_mismatch' where o.source_quote_number is not null and o.source_quote_number is distinct from q.quote_number
          union all select 'snapshot_quote_mismatch' where s.quote_number is not null and s.quote_number is distinct from q.quote_number
          union all select 'snapshot_order_mismatch' where s.order_number is not null and o.order_number is not null and s.order_number is distinct from o.order_number
          union all select 'accepted_order_not_ready_to_print' where q.customer_response = 'accepted' and o.status is distinct from 'ready_to_print'
          union all select 'quote_total_order_total_mismatch' where q.quote_total is not null and o.order_total is not null and q.quote_total is distinct from o.order_total
          union all select 'business_po_missing' where q.expected_path = 'business' and q.po_number is null and o.po_number is null
          union all select 'business_identity_missing' where q.expected_path = 'business' and q.has_customer_name is not true and o.has_customer_name is not true
          union all select 'retail_has_business_po_field' where q.expected_path = 'retail' and (q.po_number is not null or o.po_number is not null)
        ) issues
      )
    ) as result
  from q
  left join s on s.expected_path = q.expected_path
  left join o on o.expected_path = q.expected_path
  left join p on p.expected_path = q.expected_path
  left join tracking on tracking.expected_path = q.expected_path
  left join inventory on inventory.expected_path = q.expected_path
  left join finance on finance.expected_path = q.expected_path
)
select jsonb_build_object(
  'verification_status', 'pending_operator_evidence',
  'query_safety', jsonb_build_object(
    'read_only', true,
    'returns_one_row', true,
    'excludes_public_tokens_and_auth_data', true,
    'masks_direct_customer_contact_values_as_presence_flags', true
  ),
  'inputs', (select jsonb_build_object('retail_quote_number', retail_quote_number, 'business_quote_number', business_quote_number) from input),
  'results', jsonb_object_agg(expected_path, result order by expected_path)
) as retail_business_runtime_verification
from per_path;
```

### 9.1 Schema-drift fallback metadata queries

Use these only if the consolidated read-only query fails because the deployed schema differs from repository evidence. These queries are read-only metadata checks and should not be used as substitutes for fixing schema drift in this milestone.

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'quotes',
    'quote_accepted_commercial_snapshots',
    'orders',
    'production_jobs',
    'order_tracking_public',
    'production_material_reservations',
    'financial_entries'
  )
order by table_name, ordinal_position;
```

```sql
select routine_name, routine_type, data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_quote_public',
    'respond_to_quote_public',
    'public_order_tracking_lookup',
    'production_workflow_command',
    'post_order_finance_income'
  )
order by routine_name;
```

```sql
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'quotes',
    'quote_accepted_commercial_snapshots',
    'orders',
    'production_jobs',
    'order_tracking_public',
    'production_material_reservations',
    'financial_entries'
  )
order by tablename, policyname;
```

## 10. Evidence package the operator should attach later

Attach only controlled-test evidence and redact unnecessary personal details.

- Retail internal Quote screenshot.
- Retail public desktop screenshot.
- Retail public mobile screenshot.
- Retail public tracking screenshot.
- Business internal Quote screenshot.
- Business public desktop screenshot.
- Business public mobile screenshot.
- Business public tracking screenshot.
- Browser network log summary for public render and acceptance for both records.
- Browser localStorage key summary before save, after save/reload, public render, and public acceptance.
- One consolidated SQL JSONB output with the two controlled Quote numbers.
- Notes identifying any **Compliant**, **Partially compliant**, **Conflicting**, **Missing**, or **Unable to verify from repository evidence** results.

## 11. Stop condition if a defect is found

If the operator discovers a concrete defect, record the exact evidence, classify the impacted row, and stop. Do not propose speculative fixes in this document. Create a separate focused corrective milestone that identifies the single defect, root-cause evidence, intended code/schema/test scope, rollback considerations, and manual browser test plan.
