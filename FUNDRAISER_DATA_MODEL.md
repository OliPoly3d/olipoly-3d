# Fundraiser Manager Data Model

## Modeling rules

The model extends authoritative records rather than cloning them. UUIDs are internal keys; public slugs and item codes are separately unique human identifiers. Every owner-scoped row includes `owner_id`, timestamps, and an audit-compatible actor where applicable. Currency values use one database fixed-point convention selected during migration review.

Names below are proposals, not deployed schema.

## Entity relationships

```text
auth.users (owner)
  └─ fundraisers ──< fundraiser_items >── product_recipes
         │                    │
         │                    └── asset_links (record_type + stable key)
         ├──< fundraiser_order_links >── orders ── production_jobs
         │              └──< fundraiser_order_lines ──< fundraiser_personalizations
         ├──< fundraiser_payment_confirmations ── Finance reference
         └──< fundraiser_settlements ──< fundraiser_settlement_lines
```

Existing `orders`, `production_jobs`, Product Recipes, Inventory, Finance, customer source, `asset_records`, and `asset_links` remain authoritative.

## Proposed tables

### `fundraisers`

| Field | Purpose / rule |
|---|---|
| `id` UUID | Primary fundraiser ID |
| `owner_id` UUID | Auth owner; required and immutable |
| `organization_id` UUID/key nullable | FK only after deployed Customer 360 organization authority is confirmed |
| `organization_name_snapshot` text | Historical fundraiser display, not a parallel customer master |
| `contact_person`, `contact_email`, `contact_phone` | Fundraiser-specific organizer contact; private |
| `public_slug` text | Case-normalized public page key; globally unique or owner-qualified by decided URL scheme |
| `event_name`, `event_at` | Event details |
| `ordering_starts_at`, `ordering_ends_at`, `timezone` | Explicit ordering boundaries |
| `status` | `draft`, `scheduled`, `open`, `ordering_closed`, `in_production`, `settlement_review`, `settled`, `closed`, `canceled` |
| `collection_model` | Initially `organizer_collects`; extensible by reviewed values |
| `currency_code` | ISO currency, initially USD |
| `public_summary`, `internal_notes` | Strictly separated public/private content |
| audit fields | `created_at`, `updated_at`, `created_by`, `updated_by` |

Constraints: end after start; event/timezone validity; supported currency; allowed status; nonblank normalized slug. Status is advanced by reviewed command/RPC, not arbitrary public writes.

### `fundraiser_items`

| Field | Purpose / rule |
|---|---|
| `id`, `fundraiser_id`, `owner_id` | Item identity and scope |
| `item_code` | Unique within fundraiser, stable after first order |
| `product_recipe_id` | FK to authoritative Recipe |
| `recipe_revision_snapshot` | Revision identifier/hash confirmed against Recipe contract |
| `display_name`, `public_description`, `display_order`, `active` | Catalog presentation |
| `personalization_allowed` | Gates child personalization rows |
| `personalization_prompt`, `max_characters` | Public validation; server repeats validation |
| `standard_price`, `personalization_surcharge` | Customer commercial terms |
| `standard_payout`, `personalized_payout` | OliPoly per-unit entitlement |
| audit fields | Owner change history |

Constraints: nonnegative money; unique `(fundraiser_id, item_code)`; unique display order is optional; personalized payout must be explicitly set even if derived at setup. Ordered item terms become immutable snapshots on lines.

### `fundraiser_order_links`

One-to-one attribution between a fundraiser and authoritative Order.

| Field | Purpose / rule |
|---|---|
| `id`, `owner_id`, `fundraiser_id`, `order_id` | Stable relationship; `order_id` uses actual Orders PK |
| `submission_key_hash` | Unique idempotency key scoped to fundraiser; never expose raw secret |
| `payment_method` | Selected method such as `cash_to_organizer` or `online_to_organizer` |
| `fulfillment_method` | Validated pickup/delivery value |
| `production_notes` | Fundraiser-level authorized production note |
| `submitted_at` | Accepted submission time |

Constraints: unique `order_id`; unique `(fundraiser_id, submission_key_hash)`; linked Order and fundraiser must share owner. Do not duplicate customer status, order total, customer identity, or canonical fulfillment status.

### `fundraiser_order_lines`

| Field | Purpose / rule |
|---|---|
| `id`, `order_link_id`, `fundraiser_item_id`, `owner_id` | Line identity |
| `quantity`, `personalized_quantity` | Positive total and bounded personalized count |
| recipe/design snapshots | Item/recipe revision, display name, design grouping key |
| price snapshots | Standard price, surcharge, standard payout, personalized payout, currency |
| `production_notes` | Line-specific authorized note |
| `inclusion_status` | `included`, `canceled`, `refunded`, with reason/audit metadata |

Constraints: one consolidated line per `(order_link_id, fundraiser_item_id)` unless variant keys require otherwise; `0 <= personalized_quantity <= quantity`; immutable commercial snapshots after creation. Cancellation never deletes history.

### `fundraiser_personalizations`

One row per personalized unit, allowing distinct names in a quantity line.

| Field | Purpose / rule |
|---|---|
| `id`, `order_line_id`, `owner_id` | Unit identity |
| `sequence_number` | Stable within line |
| `personalization_text` | Trimmed text validated to item rule; preserve intended case |
| `production_note` | Private exception/instruction |

Constraints: unique `(order_line_id, sequence_number)`; count equals `personalized_quantity`; no row if personalization is disallowed. Treat text as untrusted content in HTML/CSV.

### `fundraiser_payment_confirmations`

Organizer assertion/audit trail, not a Finance posting.

| Field | Purpose / rule |
|---|---|
| `id`, `fundraiser_id`, `order_id`, `owner_id` | Scope |
| `confirmation_status` | `unconfirmed`, `confirmed`, `disputed`, `waived` |
| `amount_confirmed`, `method`, `confirmed_at`, `confirmed_by`, `note` | Evidence |
| `finance_reference_type`, `finance_reference_id` | Nullable validated pointer to authoritative Finance evidence |

Use append-only confirmation events or revision history; a unique active/latest rule prevents contradictory current confirmations. Do not call organizer confirmation “paid to OliPoly.”

### `fundraiser_settlements`

| Field | Purpose / rule |
|---|---|
| `id`, `fundraiser_id`, `owner_id`, `version` | Settlement snapshot identity |
| `status` | `draft`, `approved`, `posted`, `voided` |
| order cutoff/count and computed totals | Reproducibility inputs and aggregate snapshots |
| `finance_reference_type`, `finance_reference_id` | Authoritative Finance posting/allocation |
| approval/posting/void audit fields | Separation and traceability |

Only one non-voided posted settlement is allowed unless the future policy supports adjustments. Posted rows are immutable.

### `fundraiser_settlement_lines`

Immutable per-Order contribution to a settlement: settlement/order IDs, gross, personalization revenue, payout, organizer proceeds, refunds/adjustments, reconciled amount, outstanding, and source snapshot/version. Unique `(settlement_id, order_id)` prevents double inclusion.

## Existing-record links

- **Customer 360:** Prefer an existing customer/organization UUID. If no master exists, the authoritative Order customer fields remain the customer identity and Customer 360 reads the Order. Do not invent a `fundraiser_customers` table.
- **Orders:** FK using actual deployed Orders primary key, while reports may display exact `OP-######`.
- **Production:** Link through the existing Order↔Production relationship. A fundraiser batch may be a read grouping; adding a batch table is deferred until Production Control owns its model.
- **Inventory:** No fundraiser inventory table. Recipe/job references lead to normal reservation and consumption ledgers.
- **Finance:** Exact FK target is deliberately unresolved pending schema audit. Never use an unenforced polymorphic reference if a concrete Finance FK can be used.
- **Assets:** Extend the allowed `asset_links.record_type` contract for fundraiser/fundraiser item only after migration review; keep bytes private.

## Derived read models (views/RPC responses, not authorities)

- `fundraiser_catalog_public`: published/open-safe fields only.
- `fundraiser_order_rollup`: quantities and commercial snapshots by Order.
- `fundraiser_production_rollup`: included quantity by design/recipe/item/customer with canonical production milestones.
- `fundraiser_finance_rollup`: commercial obligation plus Finance allocation/reconciliation.

Whether these are database views, security-definer RPC responses, or application queries is an implementation decision after performance and RLS testing.

## Duplicate prevention and concurrency

1. A public client creates an opaque submission key before its first attempt and reuses it on retry.
2. One server transaction validates the window/catalog, locks or uniquely inserts the key, allocates the authoritative Order through the approved Orders contract, inserts lines/personalizations, validates totals, and returns the existing result on duplicate.
3. Unique constraints cover slug, fundraiser item code, submission key, Order attribution, line item, personalization sequence, and settlement inclusion.
4. Updates use `updated_at` or version preconditions; stale clients reload rather than overwrite.

## Retention and privacy

Canceled fundraisers/orders remain auditable. Contact and personalization data follow the business retention policy, which must be decided before launch. Public results never include customer lists or personalization. CSV export is owner-only, escaped against formula injection, time-limited in browser memory, and not stored in a public bucket.
