# OliPoly Engine RC2.5 — Campaign Order Conversion authority gate

## Executive summary

RC2.5 implementation is intentionally **stopped before schema or runtime changes**. The repository does not contain an authoritative allocator for an Order number that is not derived from a Quote number. The only atomic Order creation authority, `respond_to_quote_public`, maps an accepted `Q-…` identifier to the matching `OP-…` identifier. A campaign submission has no Quote identifier, and inventing one would falsify Quote authority. The RC2.5 stop condition explicitly forbids guessing this contract.

Baseline: `ce77f0f` (`Merge pull request #85 … campaign-submission-authority-rc2.4`). The checkout has no configured Git remote; its clean starting HEAD contains the RC2 shell, RC2.1–RC2.4 documentation, and migrations `202607280001_authoritative_asset_lifecycle.sql` and `202607280002_campaign_submission_authority.sql`.

No migration was created or executed, no public page was changed, no Niles data/path was touched, and no conversion UI was enabled.

## Active authority map

| Stage | Repository authority | RC2.5 finding |
|---|---|---|
| Campaign submission | `campaign_submissions` and `campaign_submission_items` | Owner-readable immutable staged envelope/items; review is owner-only; conversion is reserved but absent. |
| Review | `review_campaign_submission(uuid,text,text)` | Only the established transition from `under_review` can approve for conversion. `converted` is deliberately unavailable. |
| Commercial total | RC2.4 stored `subtotal`, `personalization_total`, nullable shipping/tax, and `accepted_total` | These stored numeric values and immutable item rows can be validated without current-product repricing. |
| Order creation | `respond_to_quote_public(text,text,text,text)` | Sole atomic creation path found; it requires a Quote and derives `OP-…` from `Q-…`. It is not valid for campaign conversion. |
| Order number | Accepted Quote number with prefix replacement | No campaign/non-Quote allocator, sequence, or allocation RPC exists. **Blocking contract.** |
| Initial Order state | Accepted Orders use `ready_to_print` | Established for accepted Quote Orders. Applying it to a reviewed campaign Order is otherwise consistent, but implementation remains blocked by number allocation. |
| Order financial summary | `orders.order_total`, `deposit_amount`, `balance_amount`, `payment_status` | Conservative mapping is possible: accepted total, zero deposit/paid amount, full balance, `unpaid`; no payment evidence proves payment. |
| Line items | No general authoritative editable Order-line model was found | A dedicated immutable campaign conversion snapshot would be required; aggregate Order fields alone must not collapse distinct items. |
| Customer identity | Customer 360 exact lookup over existing customer/quote/order records | RC2.4 has no trusted customer UUID. A conversion must preserve the customer snapshot and leave linkage unresolved; it must not merge by name/email. |
| Production | Existing Quote acceptance links an already-existing Quote production job | Campaign submissions have no Production job. Conversion must not create one directly; the owner must confirm the existing post-Order entry action for an Order without a Quote job. |
| Assets | RC2.3 `asset_records` / exact-revision `asset_links` | RC2.4 defines no submission asset link, so conversion must invent or copy nothing. |
| Finance | Existing payment/Order posting commands | Conversion must preserve attribution on the Order/snapshot and create no financial entry. |
| Invoice/tracking | Existing Order/invoice snapshot and tracking authorities | Must remain downstream. Campaign conversion must not synthesize invoice/payment state or invoke customer communication. |

## Established conversion preconditions

A future conversion RPC can safely require authentication, exact owner UUID, a locked `approved_for_conversion` submission, at least one immutable item, internally consistent stored line/envelope totals, and an absent-or-exact unique Order relationship. It can preserve source/campaign/submission UUIDs, the public reference, snapshots, converter/time, fulfillment selection, and unverified payment evidence.

The conversion cannot yet allocate the required unique `orders.order_number` through an established authority. Neither a random suffix, timestamp, `max()+1`, fabricated Quote, nor browser-provided number is acceptable.

## Exact proposed transaction sequence (blocked at step 5)

1. Require `auth.uid()` and lock the submission `FOR UPDATE`.
2. Enforce exact submission owner and `approved_for_conversion`; on an exact converted retry, verify and return the linked Order.
3. Lock/read immutable items in `line_sequence`; require at least one and validate stored line sums, item count, currency, and accepted envelope total without reading current campaign-product prices.
4. Build immutable source/customer/commercial/item snapshots and conservative unpaid financial values.
5. **Call the owner-approved, concurrency-safe authoritative non-Quote Order-number allocator. This contract is missing.**
6. Insert one Order plus one immutable conversion snapshot under unique submission/source constraints.
7. Record Order UUID/number, converter, timestamp, and `converted` state on the submission in the same transaction.
8. Return only conversion outcome, Order UUID/number, and status. Do not create Production, Inventory, Finance, tracking, invoice, email, payment, or asset records.

Row locking plus unique `campaign_submission_id` relationships would make double clicks, concurrent operators, and network retries converge on the same Order. A replay whose stored relationship does not exactly match must fail rather than repair itself.

## Required owner decisions / missing contracts

1. **Order-number allocation (implementation blocker):** approve a database-owned allocator and namespace for Orders without Quotes. It must be unique across existing `OP-…` values, transaction/concurrency safe, and compatible with tracking/invoice expectations. Clarify whether gaps are acceptable and whether allocation is global or owner-scoped.
2. **Production handoff:** identify the authoritative command that creates or links Production work for a valid Order that has no pre-acceptance Quote production job. Conversion itself should not create a competing job path.
3. **Customer linkage:** confirm that `NULL`/unresolved customer linkage plus immutable contact snapshot is the intended reviewed resolution state, because RC2.4 stores no trusted Customer 360 identity.

Until decision 1 is supplied, the migration, conversion RPC, Campaign Manager action, Orders display, Customer 360 attribution, and RC2.5 tests must not be implemented speculatively.

## Deployment and verification status

There is nothing to deploy for RC2.5 from this authority-gate change. The environment had no configured remote and no authorized live Supabase metadata session, so it could not independently re-run deployed RC2.4 verification. Repository inspection confirms the RC2.4 migration declares RLS, owner SELECT policies, anonymous table revocation, narrow RPC grants, fixed function search paths, source-event uniqueness/fingerprinting, and immutable snapshot triggers. Deployment evidence remains an operator-owned prerequisite rather than a claimed test result.

After owner decisions, deployment must be: read-only preflight; reviewed additive migration; sanitized grants/RLS/function verification; application deployment; synthetic cross-owner/concurrency/manual validation. Rollback should first revoke conversion EXECUTE and disable UI, preserve converted audit records, and use a reviewed forward fix rather than deleting Orders or snapshots.

## RC2.6 boundary

Historical Niles migration remains excluded. A future evaluation must supply a stable source key, approved campaign/product UUID mappings, immutable customer/order snapshots, payment evidence (not payment inference), review approval, duplicate detection, and personalization details. It must not derive these from names, current labels, Square link clicks, or approximate matches.
