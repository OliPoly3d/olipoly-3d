# Fundraiser / Campaign Manager Phase 1

## Current deployed-contract findings

- `niles.html` is a live standalone Niles Dragons bag tag fundraiser page and remains the production compatibility page for the Niles Primary HSA flow.
- The Niles page links to the external Tally intake flow, so HSA/customer payment collection remains outside OliPoly ERP in this phase.
- Public payment (`pay.html`) and tracking (`track.html`) are separate customer-safe helpers and were not changed.
- Existing fundraiser documents describe future Orders, Production, Finance, settlement, reporting, and permission work, but prior Phase 1 discovery stopped before deploying a schema or manager UI.
- Product Recipes already exist as the closest catalog/manufacturing reference; Campaign Product can optionally reference `product_recipes.id` without owning recipe/manufacturing calculations.

## Phase 1 contract created

### Campaign authority

`campaigns` is the owner-scoped authority for campaign setup:

- `id` stable UUID.
- `user_id` owner scope.
- `campaign_slug` public deep-link key.
- `campaign_code` internal/display code.
- `name`, `organization_name`, `public_description`.
- `status`: `draft`, `scheduled`, `active`, `closed`, `archived`.
- `starts_at`, `ends_at`.
- `payment_mode`: `external_org_collects`, `olipoly_collects`.
- `delivery_mode`: `organization_pickup`, `event_pickup`, `customer_pickup`, `shipping`, `mixed`.
- `branding_config`, `public_config`, `internal_notes`.
- `created_at`, `updated_at`.

Campaign owns fundraiser/campaign setup only. Orders own fulfillment, Finance owns accounting/payment records, Production owns manufacturing, and Inventory owns inventory.

### Campaign Product authority

`campaign_products` is the owner-scoped authority for campaign product assignments:

- `id` stable UUID.
- `campaign_id`, `user_id`.
- optional `product_recipe_id` reference.
- `campaign_sku`, `display_name`, `public_description`, `display_order`, `enabled`.
- `standard_customer_price`, `personalized_customer_price`.
- `olipoly_standard_share`, `olipoly_personalized_share`.
- `personalization_enabled`, `personalization_instructions`, `personalization_limits`.
- optional `image_url`, `reference_url`.
- `created_at`, `updated_at`.

Public campaign lookup intentionally excludes owner IDs, database IDs, internal notes, settlement data, and OliPoly share fields.

## Payment mode semantics

- `external_org_collects`: the organization collects customer payment externally. OliPoly may receive a later settlement, but Phase 1 does not post Finance entries or settlement allocations.
- `olipoly_collects`: OliPoly collection is configured for a later phase that can safely connect to the existing `pay.html` / Finance flow. Phase 1 does not add checkout or processor integration.

## Niles legacy compatibility

Niles is not migrated in Phase 1. A future migration record would need:

- campaign slug/code for Niles HSA.
- organization name: Niles Primary HSA.
- payment mode: `external_org_collects`.
- delivery mode matching HSA pickup/distribution rules.
- products NIL-001 through NIL-012.
- standard customer price `$10`, personalized customer price `$15`.
- OliPoly share `$6` standard and `$8.50` personalized.
- public Tally intake URL in `public_config.intake_url` if approved.

## Included in Phase 1

- One undeployed forward-only migration for campaign tables, constraints, RLS, owner-scoped authenticated policies, and safe public lookup RPC.
- Internal `campaign-manager.html` administration page using allowlisted payloads.
- Public `fundraiser.html?campaign=<slug>` foundation using only the safe RPC.
- Hub navigation link.
- Static/structural tests.

## Deferred to Phase 2+

- Campaign customer orders.
- Production batch generation.
- Fundraiser-specific Orders Admin workflow.
- Settlement accounting and lump-sum organization payments.
- Unit aggregation and analytics dashboard.
- Personalization production tracking.
- Refunds and tax automation.
- Customer payment processor checkout.
- Historical Niles import.

## Migration deployment warning

Codex did not deploy this SQL or alter Supabase state. The SQL migration in `supabase/migrations/202607210008_campaign_manager_phase1.sql` remains undeployed until manually reviewed and run. After deployment, run the verification SQL at the bottom of the migration and test the authenticated manager and anonymous RPC in staging before enabling public links.

## Live verification checklist

1. Apply the migration in staging only.
2. Confirm RLS is enabled for `campaigns` and `campaign_products`.
3. Confirm anon has no direct table privileges.
4. Confirm authenticated users can manage only their own campaigns/products.
5. Create a draft campaign in Campaign Manager.
6. Add campaign products and verify failed saves show failure, not durable success.
7. Set the campaign to `scheduled` or `active` and verify `fundraiser.html?campaign=<slug>` reads through `get_public_campaign`.
8. Confirm public RPC response excludes `user_id`, table UUIDs, `internal_notes`, and OliPoly share fields.
9. Confirm `niles.html`, Tally links, `pay.html`, and `track.html` still load unchanged.
