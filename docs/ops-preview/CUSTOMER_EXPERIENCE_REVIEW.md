# Customer experience review — November 4, 2026

This milestone adds an **owner-only connected review** of the planned customer quotation, pickup tracking and payment presentation. It remains inside the existing private test Site. It is not an anonymous customer portal and must not be shared with customers.

## Entry and data

Open a project in the existing test workspace and choose **Customer preview**. The link carries the selected project ID. The page reuses the same test login/session and loads the central workspace; it does not use browser-only business records or a separately entered price. Unsent drafts show an explicit not-ready message. Shared quotes consume their saved offer; accepted quotes consume the frozen accepted totals. No pricing engine is added.

The dedicated page has its own branded header and three views, with no sidebar, production links or return-to-workspace button. The older milestone-only tracking preview also has its internal navigation removed. The owner-review strip identifies the test boundary and offers Reload test record.

The presentation projector explicitly whitelists customer name, project description, public material/color labels, reference/revision, offered terms/notes, commercial totals, overall pickup milestones and confirmed payment amounts/methods. It excludes manufacturing time, grams, scrap, inventory, private intake notes, costs, margin, payment fees and processor/internal references. **This projection is presentation hygiene, not the future public authorization boundary**: the current route is owner-authenticated and its browser still loads the owner's test workspace. A real customer route must instead receive only token-scoped server projections.

## Views and supported actions

- **Your quote:** OP reference, actual legacy Q alias when present, revision, item quantities/unit prices/amounts, separate design charge, offered material/color, tax-inclusive labeling when applicable, before-tax/tax/total, shipping/discount/rounding disclosures, timing/terms/notes, print/save PDF. Approval requires a name and unchecked confirmation of the specific revision/scope/price/timing/terms. In this private review, accepting uses the existing authenticated test approval command, its expected workspace revision and retry receipt. It records owner-test evidence, preserves the OP reference, and leaves production release separate. No public acceptance endpoint is introduced.
- **Order progress:** overall milestones from approval through scheduling, printing/finishing/QC, ready for pickup and picked up. Only states actually supported by the connected pickup pilot are presented. Payment is separate from fulfillment. No printer assignment, queue position or internal run details are exposed in the presentation.
- **Payment:** agreed total, actual confirmed payments and remaining balance. Unapproved projects show no payment choices; paid orders show paid in full; business/PO orders show invoice-term instructions without consumer payment buttons. Unpaid individual orders show Card/Apple Pay, PayPal and Venmo instruction controls. Each repeats the exact balance and OP reference. Copy amount uses two decimal digits; Copy reference retains the actual OP. A user-gesture clipboard fallback was verified. Tax is not added a second time; overpayments are shown as credit to resolve, never automatically treated as a tip.

Payment controls in this review **do not redirect or collect money**, and cannot mark an order paid. The existing confirmed-payment records remain authoritative. A printable order summary is not an issued invoice or immutable receipt. Changes can be requested by replying to the original quote message; this milestone does not claim an automated change-request submission.

## Verification

39 focused checks passed, zero skips, including the actual local PostgreSQL/PGlite workflow/migration rehearsal and six customer-specific checks for frozen totals, unsent drafts, projection privacy/escaping, partial/paid/credit/business/unapproved states, explicit acceptance, payment/fulfillment independence and owner-only/no-browser-storage shell behavior. JavaScript syntax and diff checks passed.

Local browser QA used clearly labelled, temporary synthetic fixtures rather than the owner's hosted account. Verified acceptance interaction and transition to progress, unpaid/paid/business views, exact amount/method instructions and both copy controls. A 390px iframe had 375px content width/scroll width (scrollbar accounted for), with no horizontal page overflow; buttons measured at least 46px tall. Browser copy initially revealed an unavailable Clipboard API on the HTTP preview, so the fallback was added and successfully retested. The fixture files are excluded from source/publication.

No hosted customer approval, real provider payment, customer email or database mutation was performed by the agent for this milestone. Actual signed-in iPad/Safari printing and cross-device customer-preview approval remain user verification. The screenshot is a local rendering fixture, not a customer order.

## Next public/Finance gates

Retain the public `track.html` and `pay.html` addresses when the replacement is released. Before real customer use, prepare and review a new test migration/API contract for unguessable, revocable, expiring, revision-bound links; narrowly scoped quote/tracking/payment projections; stale/double acceptance and PO hold behavior; server-recorded change requests; and no owner workspace access for customer sessions. Hiding navigation or knowing an OP number is not authorization.

Shipping needs separate shipment/delivery records and customer milestones; the current pilot only records complete pickup. Invoice issue timing, immutable issued PDFs/receipts, receipt delivery choices, payment requests, optional quiet tips, reversals, multiple payments/allocation, tax sourcing/exemptions/filing and financial close remain the integrated Finance milestone. Provider URLs/amount-prefill behavior must be verified before enabling redirects. Do not put service-role keys or owner tokens into customer URLs, nor add tax at the provider again.

No schema migration or live site change is part of this review. No additional test account or sample order is created. The full legacy Finance Pro audit remains the preservation checklist; this UI review does not replace it.
