# OliPoly ERP 1.0 Release Notes

## Release scope

OliPoly ERP 1.0 is the validated customer-to-closeout operating system for intake, manufacturing estimates, customer quotes, accepted Orders, production, inventory, fulfillment, Finance, reporting views, product recipes, and private Job Files / Assets. The automated release gate and required live manual validation passed before release. This release finalization adds no speculative feature, database migration, workflow transition, or business-rule change.

## Authoritative workflow

Production Control owns manufacturing estimates, costs, suggested pricing, production status, printer assignment, reservations, actual usage, scrap, reprints, and QC. Quote owns customer-facing pricing and terms and consumes Production's suggested price; all customer totals come from `calculateQuoteTotals()` and are saved as a snapshot. Orders begin only after Quote acceptance and own fulfillment, customer communication, payment tracking, and completion. Inventory owns stock, reservations, consumption, adjustments, and reorder policy. Finance owns invoices, receipts, payments, expenses, and profitability reporting.

The released manufacturing path is:

`Estimate` → `Waiting for Customer` → `Ready to Print` → `Printing` → `QC / Finishing` → `Ready for Pickup / Shipment` → `Closed`

Needs Reprint returns to Ready to Print while preserving actual usage. Print completion does not close the Order. Inventory is not reserved during estimate or customer waiting; it is reserved at Ready to Print, retained through Printing and QC, consumed at QC pass, and any unused reservation is released. Cancellation releases live reservations.

Identifiers remain exact six-digit `Q-######` and `OP-######` values. Public acceptance calls `respond_to_quote_public` once and uses only the Order number returned by Supabase. Clients must never infer an Order number from a Quote number.

## Major modules included

- **Hub:** authenticated navigation, attention, business pulse, and remote activity read models.
- **Production Control:** authoritative manufacturing plan and workflow.
- **Quote:** one retail/business Quote system, customer terms, totals snapshots, and public response.
- **Orders Admin:** accepted-order fulfillment, communication, tracking, and payment state.
- **Inventory Control:** materials, rolls, reservations, consumption, adjustments, and reorder information.
- **Finance Pro:** invoices, receipts, payments, expenses, tax, and profitability records.
- **Customer 360:** remote customer and project read model.
- **Product Recipes:** revisioned templates that may seed estimates but cannot create Orders or reservations.
- **Job Files / Assets:** private, revisioned assets linked to stable business records.

## Supabase authority rules

Supabase remains authoritative for durable records, identity allocation, acceptance, synchronized workflow state, inventory transactions, Finance entries, project events, and Job Asset metadata. Browser storage is limited to explicit drafts, recovery, cache, and preferences; it must not silently override newer remote data. Public tracking is read-only and cannot advance manufacturing.

The release assumes reviewed migrations `202607160001` through `202607160007` are already applied and recorded in filename order. Release finalization does not apply migrations, alter RLS, or change private Storage policies. A deployment must stop if migration history, constraints, triggers, RPCs, RLS, or bucket policies differ from the reviewed contract.

## Job Files / Assets behavior

Job Asset metadata and revisions are stored in the Job Assets tables and linked by stable UUID/key to recipes, Quotes, Orders, production jobs, or customers. Files remain in the private Storage bucket. Authenticated interfaces request authorized access; public pages receive neither private paths nor broad bucket access. Revisions preserve their record links, and archived revisions remain auditable.

## Known limitations

- The legacy manufacturing-status editor in Orders Admin remains an operational risk; operators must make manufacturing changes in Production Control and use Orders Admin for fulfillment.
- Browser, RLS, private Storage, payment, email, concurrency, and multi-device behavior depend on the deployed Supabase environment and cannot be proven by the repository-only Node suite.
- Explicit local draft/recovery compatibility remains until production-data inventory confirms safe removal.
- Automated browser accessibility, mobile visual regression, and ephemeral Supabase integration coverage are not yet part of CI.

## Deferred post-1.0 improvements

Post-1.0 work is deliberately separate: remove verified legacy local compatibility inputs; make the Orders Admin manufacturing status presentation strictly read-only after operational confirmation; add an ephemeral Supabase integration environment; add automated browser/mobile accessibility and visual-regression coverage; and extract remaining large inline scripts only where doing so removes duplication. These are not release requirements and no speculative implementation is included here.

## Deployment and rollback summary

1. Back up database and Storage metadata and export migration history plus RLS/policy definitions.
2. In staging, verify migrations `202607160001`–`202607160007` in filename order; do not apply them as part of this release PR.
3. Run the existing SQL verification queries for constraints, triggers, RPCs, RLS, private bucket policies, duplicate Q/OP relationships, and orphan Asset links.
4. Deploy static application files to staging and complete the documented customer-to-closeout, PO/tax-exempt, cancellation, shortage, mounted-roll, concurrency, RLS, private Asset, desktop, mobile, and two-device checks.
5. Confirm `respond_to_quote_public` is atomic/idempotent and returns `order_number`, then promote static files during a low-traffic window and run controlled smoke checks.
6. Monitor RPC failures, duplicate keys, RLS denials, event duplication, reservation discrepancies, and Finance import errors through the rollback window.

This is an application-only release finalization. Roll back by redeploying the previous static build. Do not reverse migrations, weaken RLS, expose private Storage, delete acceptance-created Orders, or rewrite Q/OP identities. Preserve incident records and use an audited database reconciliation if authoritative acceptance data requires correction.
