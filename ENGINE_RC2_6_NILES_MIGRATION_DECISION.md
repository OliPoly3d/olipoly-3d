# OliPoly Engine RC2.6 — Niles migration decision

## Owner decision

Niles is an intentionally excluded, one-off historical/manual fundraiser workflow. It will not be migrated into the generic RC2.4 campaign-submission authority or the RC2.5 reviewed Order-conversion authority. This closes RC2.6 as a documentation and regression-boundary milestone; it does not authorize implementation or data work.

This decision means:

- do not import historical Niles Tally submissions or Niles CSV rows;
- do not create `campaign_submissions`, Orders, Customer 360 identities, Production jobs, Inventory records, Finance entries, invoices, payments, or other ERP records from historical Niles data;
- do not infer payment from a Square link, link click, customer choice, Tally response, CSV field, name, label, or approximate match;
- do not reconstruct missing prices, offer versions, products, personalization, consent, tax, fulfillment, customer identity, commercial snapshots, or payment snapshots; and
- retain the existing manual/CSV records outside generic campaign authority rather than manufacturing a partial history.

## Current one-off architecture

`niles.html` is a standalone historical public page. It presents Niles-specific products, prices, personalization and content; embeds a hosted Tally intake; and links to organization-hosted Square payment pages. The repository has no Niles ingestion adapter, webhook, authenticity verification, payment confirmation, or authoritative join between those external systems. Existing reconciliation and recordkeeping are manual/CSV processes outside the generic campaign database.

The page, Tally embed, Square/payment links, product codes, prices, personalization, content, imagery, and public URLs are frozen by this decision. RC2.6 changes none of them and adds no Niles-specific schema, migration, RPC, trigger, importer, or conversion workflow.

## Why historical import is unsafe

The historical sources do not establish the complete immutable evidence required by RC2.4 and RC2.5. A form response or CSV row may describe intent, but it cannot prove the exact published offer/version, later edits, consent language, authoritative product UUID, duplicate status, fulfillment outcome, or an accepted commercial snapshot. Names and labels are not stable identities. Reconstructing these fields would turn assumptions into authoritative records and could duplicate or misstate historical work.

Tally is only an external intake channel: this repository does not establish authenticity, stable field mappings, complete revision history, or ERP identity. Square links are only external destinations: a displayed link, click, or selected payment method is not settlement evidence, and no trusted payment confirmation returns to this repository. Neither source authorizes an Order or a paid state.

## Historical/manual retention and operations

- Preserve existing manual and CSV records in their present owner-controlled location; do not copy them into the generic campaign tables.
- Continue any necessary historical reconciliation manually, without creating new ERP authority or filling gaps by inference.
- Do not ingest CSV files, access live Tally submissions or Square data, or create records merely to validate this decision.
- If an operator needs to answer a historical question, consult the retained source under existing access controls and describe uncertainty rather than normalizing it into an ERP record.
- Do not use Niles as a precedent for bypassing campaign submission review, conversion approval, payment evidence, or downstream module ownership.

## Data and privacy boundary

Historical Niles sources may contain customer PII. RC2.6 collects, copies, transforms, logs, or stores none of it. Keep retained records under their existing owner-approved access, retention, deletion, and disclosure practices; use least-privilege access and avoid local working copies. This milestone does not establish a new retention schedule or legal hold. Any disposal, export, disclosure, or retention-policy change requires the appropriate owner decision and must not be performed through the generic campaign system by default.

## Future fundraiser rule

Future fundraisers must use the generic authorities from inception: RC2.4 captures immutable, idempotent submission evidence and RC2.5 converts only reviewed `approved_for_conversion` submissions through its protected atomic command. Orders, Production, Inventory, Customer 360, and Finance then retain their defined responsibilities. A manual page, external form, payment link, or CSV must never become an alternate authority.

## Separately authorized reconsideration

Reconsider Niles only in a distinct owner-authorized milestone. Authorization must state a business/legal need, data custodian and privacy/retention basis, trusted source identifiers, source authenticity and export provenance, exact campaign/product/offer mappings, duplicate resolution, complete commercial snapshots, independent payment evidence and reconciliation, exception handling, dry-run review, rollback/audit requirements, and downstream-record policy. It must include a reviewed migration plan and tests before any data access or mutation.

Absent all of those conditions and explicit owner approval, the answer remains **no migration**. Even a future reconsideration must not infer missing facts, treat external selections as payments, or alter the preserved Niles public experience as a side effect.

## Closeout

RC2.6 is complete when this decision and its regression boundary are retained. No browser validation is required because no runtime or public page changed. Operators should use the generic RC2.4/RC2.5 path for every new fundraiser and leave historical Niles records manual and external to that authority.
