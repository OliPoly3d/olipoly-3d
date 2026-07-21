# ERP Retail versus Business Contract Verification

> **Milestone type:** Documentation-only verification  
> **Blueprint:** ERP Blueprint v1 applies  
> **Production safety:** No fixes, application code, migrations, schema, RLS, grants, data, tests, UI, SQL execution, or customer-data changes are included in this milestone.

## 1. Scope and evidence rules

This milestone verifies whether Retail and Business/PO customer flows share the same authoritative ERP contracts while allowing different presentation and commercial fields.

### Evidence categories used

- **Confirmed repository evidence:** Checked-in source, migrations, tests, and architecture documents directly inspected in this repository.
- **Operator-supplied deployed evidence:** None supplied for this milestone.
- **Repository inference:** Conclusions that follow from repository structure but still require deployed/runtime confirmation.
- **Requires browser/runtime verification:** Behaviors that need a real browser, deployed Supabase project, public-token flow, or operator observation.
- **Historical or abandoned behavior:** Prior compatibility code, legacy status normalization, or previous verification notes that should not be treated as current deployed proof without re-verification.

### Classification vocabulary

Each contract is classified only as **Compliant**, **Partially compliant**, **Conflicting**, **Missing**, or **Unable to verify from repository evidence**.

## 2. Confirmed repository evidence

- The Quote page exposes one `liteQuoteType` selector with Retail, Custom, Business/PO, Repeat, Craft Show, and Professional/PO variants rather than a separate Business quote page.
- `js/quote.js` defines one Quote configuration map where Retail and Business/PO differ by labels, professional formatting, payment terms, deposits, PO visibility, and business-field visibility.
- `js/quote-pricing.js` exposes one `calculateQuoteTotals(input)` function that computes subtotal, tax, deposit, balance, and final totals from the same input contract; no customer-type branch appears in that pricing engine.
- Repository tests assert Retail and Business quote totals use the same pricing engine, that Business fields remain available, and that customer type affects presentation/defaults.
- Internal Quote acceptance and public Quote response call `respond_to_quote_public`; repository tests assert the browser must not independently create Orders, Production rows, tracking rows, or project events during acceptance.
- The current acceptance migration creates one deterministic Order number from the Quote number, validates the accepted Quote, writes an accepted commercial snapshot, creates/links the Order, creates public tracking, emits events, and advances linked Production only as an acceptance handoff.
- `quote_accepted_commercial_snapshots` are protected by a mutation guard migration and tests assert browser roles cannot execute the guard directly.
- Customer 360 groups rows by shared customer identity and infers Business presentation from `customer_type`, PO number, or invoice number; it does not define a separate lifecycle.
- Hub Business Pulse treats Business as a commercial/presentation concern by highlighting overdue invoices and missing PO numbers; it does not define separate numbering, acceptance, Production, Inventory, or Finance authority.
- Workflow and Inventory helpers use shared order/job contracts and idempotency keys; no Retail-versus-Business branch was found in reservation or consumption helper contracts.
- Fundraiser documentation exists only as a deferred extension plan/gate and explicitly says fundraiser behavior must not duplicate customer, Order, Production, Inventory, Recipe, Finance, or Asset authority.

## 3. Operator-supplied deployed evidence

None supplied. This milestone did not execute SQL, mutate production data, merge, deploy, or perform browser acceptance against deployed customer records.

## 4. Repository inference

- Retail and Business/PO appear to share the same Quote lifecycle, acceptance RPC, Order identity pattern, Production handoff, Inventory helper contracts, Finance posting path, tracking projection, and customer-history projection.
- Customer type appears intended to change field visibility, defaults, terms, invoice/PO presentation, and business reminders only.
- The repository cannot prove deployed Supabase functions, triggers, grants, RLS policies, Storage policies, or public-token boundaries match the checked-in migrations.
- Because browser code can be served stale, cached, or deployed independently of git, repository evidence cannot prove the currently deployed public Quote response or mobile UI is running the checked-in bundle.
- Historical compatibility mappings and prior workflow migrations indicate abandoned/legacy behavior may exist in old rows or older deployed environments; old evidence must be isolated from the current contract.

## 5. Contract classification summary

| Contract | Classification | Evidence category | Verification note |
|---|---:|---|---|
| One Quote system for Retail and Business/PO | Compliant | Confirmed repository evidence | One Quote page and one Quote script configure customer-type variants. |
| Customer type changes presentation and applicable fields | Compliant | Confirmed repository evidence | Business/PO turns on company, PO, professional, invoice, tax-exempt, billing/shipping style fields; Retail uses simpler defaults. |
| Customer type must not create separate numbering | Compliant | Confirmed repository evidence | Acceptance maps `Q-######` to `OP-######` regardless of customer type. |
| Customer type must not create separate totals engine | Compliant | Confirmed repository evidence | `calculateQuoteTotals()` has no Retail/Business pricing branch. |
| Quote page, saved Quote, acceptance, and Order consume totals snapshot rather than recalculate downstream | Partially compliant | Confirmed repository evidence + repository inference | Tests assert acceptance browser does not recalculate; runtime PDF/email/render paths still need browser inspection for exact displayed values. |
| Public acceptance authority | Compliant | Confirmed repository evidence | Public and internal acceptance route through `respond_to_quote_public`. |
| Accepted commercial snapshot immutability | Compliant | Confirmed repository evidence | Migrations/tests provide snapshot mutation guard and role restrictions. |
| Order creation and Quote linkage | Compliant | Confirmed repository evidence | Acceptance RPC owns Order creation/linkage and idempotent accepted evidence checks. |
| Deposits and balances | Compliant | Confirmed repository evidence | Pricing engine computes deposit/balance; acceptance validates deposit against accepted total. |
| Payment methods | Unable to verify from repository evidence | Requires browser/runtime verification | Repository has payment fields/statuses, but this milestone did not prove deployed payment-method capture parity. |
| PO numbers and purchasing fields | Partially compliant | Confirmed repository evidence | Business/PO fields exist and downstream reminders use them; runtime save/acceptance field persistence needs browser verification. |
| Tax exemption evidence | Partially compliant | Confirmed repository evidence | Tax-exempt total behavior exists through pricing input and Business field intent, but evidence file upload/retention and deployed persistence need verification. |
| Billing and shipping addresses | Partially compliant | Confirmed repository evidence | Business presentation fields exist; downstream snapshot/order persistence requires runtime verification. |
| Fulfillment methods | Compliant | Confirmed repository evidence | Acceptance normalizes pickup/delivery/shipping from Quote data through a shared branch, not customer-type-specific lifecycle. |
| Invoice terms and AP email | Partially compliant | Confirmed repository evidence | Professional/PO defaults and Customer 360 invoice terms exist; AP email persistence/visibility needs runtime verification. |
| Catalog/reorder behavior | Partially compliant | Confirmed repository evidence | Customer 360 reorder creates a shared Quote draft from completed Orders; catalog/reorder runtime coverage needs browser verification. |
| Production handoff | Compliant | Confirmed repository evidence | Acceptance creates/links shared Production handoff without Retail/Business branching. |
| Inventory reservation and consumption | Compliant | Confirmed repository evidence | Shared workflow helpers reserve/release/consume by Production job and command, not customer type. |
| Finance posting | Partially compliant | Confirmed repository evidence + repository inference | Finance posting corrections exist and Hub reads money status; end-to-end Retail/Business posting parity needs deployed verification. |
| Public tracking | Compliant | Confirmed repository evidence | Acceptance creates public tracking from the accepted Order regardless of customer type. |
| Assets and customer-supplied files | Unable to verify from repository evidence | Requires browser/runtime verification | Asset model tests reject localStorage authority, but this milestone did not trace Retail/Business file presentation and public-token exposure end to end. |
| Browser/localStorage handoff keys | Partially compliant | Confirmed repository evidence | Reorder draft and workflow idempotency keys are shared; deployed/browser stale-key behavior needs manual verification. |
| Email/message templates | Partially compliant | Confirmed repository evidence | Quote messaging uses shared Quote fields and Business text defaults; sent email/PDF exact rendering needs browser/runtime verification. |
| Mobile/public behavior | Unable to verify from repository evidence | Requires browser/runtime verification | Source suggests shared paths, but responsive/public UI was not run. |
| RLS, grants, RPCs, public-token boundaries | Partially compliant | Confirmed repository evidence | Migrations/tests assert intended boundaries; deployed catalog, policies, and grants require read-only verification. |
| Fundraiser behavior as deferred extension gate | Compliant | Confirmed repository evidence | Fundraiser plans keep implementation out of scope and require no duplicate ERP authority. |

## 6. Retail versus Business field matrix

| Field or concern | Retail expected behavior | Business/PO expected behavior | Repository classification |
|---|---|---|---:|
| Customer/contact name | Shown and saved as customer identity. | Shown and saved, usually with company context. | Compliant |
| Company name | Hidden/minimal unless supplied. | Visible as purchasing identity. | Compliant |
| Customer type | `retail`/friendly defaults. | `business` or `po`/professional defaults. | Compliant |
| Quantity | Same Quote quantity input and totals engine. | Same Quote quantity input and totals engine. | Compliant |
| Suggested selling price | Same customer-facing total source. | Same customer-facing total source. | Compliant |
| Custom selling price override | Same manual-price contract. | Same manual-price contract. | Compliant |
| Discount | Same calculation path. | Same calculation path. | Compliant |
| Tax and tax exemption | Tax applies unless tax-exempt input is set. | Tax exemption fields/evidence expected where applicable. | Partially compliant |
| Deposit | Retail defaults commonly require deposit. | Business defaults vary; PO can default to no deposit/customer terms. | Compliant |
| Balance | Same total-minus-deposit calculation. | Same total-minus-deposit calculation. | Compliant |
| PO number | Normally hidden/not required. | Visible/expected for PO flow; Hub warns if missing. | Partially compliant |
| Invoice terms | Simple payment terms. | Professional/customer terms and invoice wording. | Partially compliant |
| AP email | Usually unnecessary. | Expected purchasing/AP contact field. | Unable to verify from repository evidence |
| Billing address | Usually same as customer/contact or not formalized. | Expected formal billing address. | Partially compliant |
| Shipping address | Pickup/delivery/shipping as selected. | Formal shipping address and delivery instructions expected. | Partially compliant |
| Fulfillment method | Shared pickup/delivery/shipping normalization. | Shared pickup/delivery/shipping normalization. | Compliant |
| Customer files/assets | Shared Asset authority expected. | Shared Asset authority expected, with possible purchasing evidence. | Unable to verify from repository evidence |
| Public token | Same public Quote response boundary. | Same public Quote response boundary. | Compliant |

## 7. Shared lifecycle matrix

| Lifecycle stage | Retail path | Business/PO path | Classification |
|---|---|---|---:|
| Customer/intake creation | Quote/customer fields identify customer. | Same intake plus company/purchasing fields. | Partially compliant |
| Customer type classification | Presentation/defaults. | Presentation/defaults and business reminders. | Compliant |
| Quote creation | Same Quote page and save path. | Same Quote page and save path. | Compliant |
| Quote totals | Same `calculateQuoteTotals()` engine. | Same `calculateQuoteTotals()` engine. | Compliant |
| Public Quote response | Same `quote-response.html` RPC call. | Same `quote-response.html` RPC call. | Compliant |
| Acceptance snapshot | Same immutable accepted snapshot table. | Same immutable accepted snapshot table plus Business fields if persisted in Quote data. | Partially compliant |
| Order creation/linkage | Same RPC-created OP number and source Quote link. | Same RPC-created OP number and source Quote link. | Compliant |
| Production handoff | Same ready-to-print handoff. | Same ready-to-print handoff. | Compliant |
| Inventory reservation/consumption | Same Production job/reservation commands. | Same Production job/reservation commands. | Compliant |
| Finance posting | Same Order/Finance contracts expected. | Same contracts plus PO/invoice terms. | Partially compliant |
| Public tracking | Same tracking projection. | Same tracking projection. | Compliant |
| Closure/reorder | Same completed Order and Customer 360 reorder draft. | Same completed Order and Customer 360 reorder draft plus PO context. | Partially compliant |

## 8. Authority/path comparison

| Authority | Retail path | Business/PO path | Contract result |
|---|---|---|---:|
| Quote authority | `quote.html` / `js/quote.js` / `calculateQuoteTotals()` | Same files and function with Business config. | Compliant |
| Acceptance authority | `respond_to_quote_public` RPC | Same RPC. | Compliant |
| Accepted commercial evidence | `quote_accepted_commercial_snapshots` | Same table. | Compliant |
| Order authority | RPC-created `orders` row linked to Quote. | Same row plus purchasing fields where captured. | Partially compliant |
| Production authority | Production handoff/job status contracts. | Same contracts. | Compliant |
| Inventory authority | Inventory reservation/consumption RPC request helpers. | Same helpers. | Compliant |
| Finance authority | Finance posting/Orders money status expected. | Same plus invoice/PO fields. | Partially compliant |
| Public tracking authority | Public tracking projection from accepted Order. | Same projection. | Compliant |
| Customer history projection | Customer 360 shared identity matching. | Same projection with Business panel. | Compliant |

## 9. Quote-total and accepted-snapshot comparison

| Concern | Retail | Business/PO | Classification |
|---|---|---|---:|
| Total source | `calculateQuoteTotals()` | `calculateQuoteTotals()` | Compliant |
| Tax source | Same tax input. | Same tax input, optionally tax-exempt. | Compliant |
| Deposit source | Same deposit percent/value calculation. | Same calculation, different defaults. | Compliant |
| Balance source | Same balance calculation. | Same balance calculation. | Compliant |
| Acceptance validation | RPC checks accepted total/deposit. | Same checks. | Compliant |
| Snapshot content | Shared accepted snapshot. | Shared accepted snapshot; Business-specific field completeness requires runtime verification. | Partially compliant |
| Downstream recalculation risk | Tests reject browser acceptance recalculation. | Same tests apply. | Partially compliant |

## 10. Public acceptance comparison

| Concern | Retail | Business/PO | Classification |
|---|---|---|---:|
| Public token lookup | Same Quote number + public token. | Same Quote number + public token. | Compliant |
| Accept/change response | Same RPC response vocabulary. | Same RPC response vocabulary. | Compliant |
| Idempotent re-acceptance | Same accepted-evidence checks. | Same accepted-evidence checks. | Compliant |
| Browser side effects | Tests assert none. | Tests assert none. | Compliant |
| Public PII exposure | Needs deployed/browser verification of rendered fields and tracking. | Higher Business risk due to company, PO, tax, AP, billing/shipping fields. | Partially compliant |

## 11. Order / Production / Inventory / Finance downstream comparison

| Downstream area | Retail | Business/PO | Classification |
|---|---|---|---:|
| Order number | `OP-######` from Quote. | Same. | Compliant |
| Order linkage | `source_quote_number` / converted order evidence. | Same. | Compliant |
| Production handoff | Accepted Quote enters ready-to-print handoff. | Same. | Compliant |
| Inventory reservation | Reserved by Production job, not customer type. | Same. | Compliant |
| Inventory consumption | QC/reprint consumption commands by Production job. | Same. | Compliant |
| Finance posting | Shared Order/Finance posting expected. | Shared posting plus invoice/PO terms. | Partially compliant |
| Public tracking | Same public tracking projection. | Same projection; Business PII review required. | Partially compliant |

## 12. Browser-storage comparison

| Storage key / pattern | Retail use | Business/PO use | Classification |
|---|---|---|---:|
| `sb_token` / Supabase auth token fallback | Auth/session only. | Same. | Compliant |
| Quote local fallback list/draft keys | Draft/save fallback for Quote work. | Same, with Business fields in form data. | Partially compliant |
| `olipoly_reorder_quote_draft_v1` | Customer 360 reorder preload. | Same, includes company/PO/payment terms when present. | Compliant |
| `olipoly_workflow_command:*` | Workflow idempotency only. | Same. | Compliant |
| Asset/file storage | Should be remote-authoritative. | Same, with potentially more sensitive purchasing evidence. | Unable to verify from repository evidence |

## 13. Privacy and public-token risk comparison

| Risk | Retail | Business/PO | Classification |
|---|---|---|---:|
| Public Quote token exposes customer contact fields | Needs public-page browser review. | Same plus company and purchasing fields. | Partially compliant |
| PO number exposure | Usually absent. | Must be limited to intended Quote/Order views. | Unable to verify from repository evidence |
| Tax exemption evidence exposure | Usually absent. | Higher-risk evidence must not be exposed by public token unless intended. | Unable to verify from repository evidence |
| Billing/shipping address exposure | Common but sensitive. | Common and potentially company-sensitive. | Unable to verify from repository evidence |
| AP email exposure | Usually absent. | Must be limited to necessary views. | Unable to verify from repository evidence |
| Asset links and signed URLs | Must remain private unless explicitly shared. | Same, with higher Business evidence risk. | Unable to verify from repository evidence |
| RPC/grant boundary | Intended public-token RPC boundary exists in migrations/tests. | Same. | Partially compliant |

## 14. Historical or abandoned behavior

- Legacy workflow status normalization maps many old labels into the accepted post-acceptance vocabulary. This is compatibility behavior, not proof that old rows were created by the current Retail/Business contract.
- Prior acceptance-authority migrations and verification notes show earlier risk around browser-created side effects and bidirectional workflow synchronization. Current repository tests assert the intended corrected behavior, but deployed evidence is still needed.
- Fundraiser plans are historical/future planning only for this milestone. Fundraiser implementation remains out of scope and should be treated as a deferred extension gate.

## 15. Optional deployed read-only verification

Repository inspection is sufficient for this documentation milestone. If the operator wants deployed confirmation, prefer one consolidated read-only JSONB diagnostic query, run in a safe SQL console by an authorized operator, with small fallbacks only if the schema differs.

```sql
select jsonb_build_object(
  'rpc', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'args', pg_get_function_identity_arguments(p.oid)
    ) order by p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('respond_to_quote_public','get_quote_public','reserve_production_material','consume_production_material','post_order_to_finance')
  ),
  'routine_grants', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'routine_name', routine_name,
      'grantee', grantee,
      'privilege_type', privilege_type
    ) order by routine_name, grantee), '[]'::jsonb)
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('respond_to_quote_public','get_quote_public','reserve_production_material','consume_production_material','post_order_to_finance')
  ),
  'rls_tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', schemaname,
      'table', tablename,
      'rls_enabled', rowsecurity
    ) order by tablename), '[]'::jsonb)
    from pg_tables
    where schemaname = 'public'
      and tablename in ('quotes','quote_accepted_commercial_snapshots','orders','production_jobs','order_tracking_public','project_events','job_assets','finance_transactions')
  ),
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'roles', roles,
      'cmd', cmd
    ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('quotes','quote_accepted_commercial_snapshots','orders','production_jobs','order_tracking_public','project_events','job_assets','finance_transactions')
  ),
  'recent_quote_type_counts', (
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.customer_type), '[]'::jsonb)
    from (
      select coalesce(quote_data #>> '{fields,liteQuoteType}', customer_type, 'unknown') as customer_type,
             count(*) as quote_count,
             count(*) filter (where customer_response = 'accepted') as accepted_count
      from public.quotes
      where created_at >= now() - interval '90 days'
      group by 1
    ) x
  )
) as retail_business_contract_diagnostic;
```

Diagnostic fallback if a listed table/function is absent: remove only the missing object from that subquery and record the absence as **Unable to verify from repository evidence** or **Missing**, depending on whether the deployed schema is expected to contain it.

## 16. Manual browser test checklist

Do not run this checklist against production customer data unless the operator explicitly chooses safe test records. Do not merge, deploy, execute SQL, or modify real customer data as part of this documentation milestone.

### Retail Quote

- [ ] Open Quote in a normal desktop browser and create a Retail Quote with customer name, email/phone, quantity, pickup or delivery, tax setting, deposit default, and one customer note.
- [ ] Confirm Business-only fields are hidden or non-prominent and no PO/AP/tax-exempt evidence is required.
- [ ] Save the Quote and reload from Supabase, not just localStorage.
- [ ] Confirm displayed subtotal, tax, deposit, balance, and total match the Quote review/PDF/email preview values.
- [ ] Open the public Quote link in a private/incognito browser and confirm only intended customer-facing fields appear.
- [ ] Accept the Quote publicly and confirm exactly one Order is created with the expected `OP-######` number, source Quote link, accepted snapshot, public tracking row, and Production handoff.
- [ ] Confirm no browser network request directly writes Orders, Production, tracking, or events outside the acceptance RPC.
- [ ] Confirm deposit/balance/payment method presentation is correct after acceptance.
- [ ] Confirm mobile public acceptance layout is usable and does not expose private fields.

### Business / PO Quote

- [ ] Open Quote and create a Business/PO Quote with company, contact, PO number, invoice terms, AP email, tax exemption status/evidence placeholder, billing address, shipping address, fulfillment method, quantity, and customer notes.
- [ ] Confirm Retail-only simplifications are not treated as a separate lifecycle or separate numbering path.
- [ ] Save the Quote and reload from Supabase, not just localStorage.
- [ ] Confirm displayed subtotal, tax exemption behavior, deposit, balance, and total match Quote review/PDF/email preview values.
- [ ] Open the public Quote link in a private/incognito browser and confirm only intended purchasing/customer-facing fields appear.
- [ ] Accept the Quote publicly and confirm the same acceptance RPC creates exactly one `OP-######` Order, accepted snapshot, public tracking row, events, and Production handoff.
- [ ] Confirm PO number, invoice terms, AP email, tax-exempt status, billing/shipping addresses, and fulfillment method persist into the accepted commercial evidence and downstream views where intended.
- [ ] Confirm Hub/Customer 360 show Business reminders/panels without creating a separate Order, Production, Inventory, Finance, or tracking lifecycle.
- [ ] Confirm mobile public acceptance and public tracking do not expose tax evidence, AP email, billing/shipping details, or files beyond intended customer-facing scope.

## 17. Decision gate

**Gate result:** **Partially compliant — proceed only with targeted runtime verification before making corrections.**

Repository evidence supports one shared Retail/Business ERP lifecycle and one authoritative pricing/acceptance path. The remaining uncertainty is not a reason to redesign Quote, Finance, Inventory, UI, schema, workflow, or fundraiser behavior. It is a narrow verification gap around deployed field persistence, PDF/email/public/mobile rendering, payment method capture, AP/tax/billing/shipping privacy, and deployed RLS/grant/RPC boundaries.

## 18. Exactly one small future corrective milestone

**Future milestone:** Create a read-only browser/runtime verification checklist result document for one Retail Quote and one Business/PO Quote, recording screenshots/network observations and deployed read-only diagnostic output only.

Constraints for that future milestone:

- Do not change application code, schema, migrations, RLS, grants, UI, tests, or customer data.
- Do not implement fundraiser behavior.
- Verify only whether accepted Business commercial fields persist into the accepted snapshot/Order/customer views and whether public/mobile views expose only intended fields.
- If a concrete defect is found, stop and open a separate focused corrective milestone.
