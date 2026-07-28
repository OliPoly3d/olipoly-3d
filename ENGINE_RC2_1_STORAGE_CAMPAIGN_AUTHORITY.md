# OliPoly Engine RC2.1 — Storage and Campaign Authority Investigation

> **RC2.2 continuation:** [`ENGINE_RC2_2_DEPLOYED_STORAGE_VERIFICATION.md`](ENGINE_RC2_2_DEPLOYED_STORAGE_VERIFICATION.md) records that deployed verification is blocked because this environment has no authorized live metadata or authenticated policy-test access. Repository expectations below are not deployed evidence; RC2.3 must not begin until the RC2.2 gate is satisfied.

Status: repository-evidence investigation only. No live Supabase, Storage, customer, payment, or production record was queried or changed. “Verified” below means verified in version-controlled runtime, migration, or test evidence; deployment of a migration is not assumed.

## 1. Executive summary

The repository defines one coherent **Job Assets metadata system**: `asset_records` owns immutable file-revision metadata and `asset_links` links an exact revision to a recipe, quote, order, production job, or customer. The only defined object bucket is the private `job-assets` bucket, with owner-first paths and authenticated, owner-scoped object policies. Four private pages mount the same UI. That UI uploads a new object and metadata row for every revision, creates signed five-minute reads, and archives metadata rather than deleting bytes. It has no physical-delete, copy, move, or automatic relationship-transfer operation.

The contract is incomplete. The shared UI lists every asset owned by the signed-in operator rather than filtering to the current page context. A quote does not mount it. Quote acceptance neither copies nor relinks assets. A manually created quote link can remain reachable through the asset browser, but no persistent order or production link is created. Repository migrations define object delete permission but no application deletion owner, retention job, orphan detection, backup proof, or recovery procedure. Deployment and current bucket state remain unverified.

Campaign authority currently stops at setup and public display. `campaigns` owns campaign configuration; `campaign_products` owns enabled catalog assignments and current public/internal price terms; `get_public_campaign(text)` is the anonymous allowlisted read. `fundraiser.html` displays the returned catalog and can open a configured external intake link, but it submits nothing to OliPoly. No runtime outside Campaign Manager and that public reader references campaign identifiers. Therefore the repository contains **no authoritative campaign order**, campaign-product order snapshot, campaign production handoff, Finance attribution, or Customer 360 relationship.

`niles.html` is separate: a static public page with an embedded external intake and organization-hosted payment links. It does not load the generic campaign RPC or write an ERP order. Its reconciliation, production, and Finance handoffs are manual/unverified. A later implementation must not treat names, titles, notes, or the appearance of the page as campaign authority.

## 2. Investigation scope

The investigation searched active HTML/JavaScript, all `supabase/migrations`, tests, RC2 architecture, ERP documentation, public fundraiser paths, and repository-local assets for Storage REST calls, bucket/object policies, asset metadata, file fields, campaign identifiers, order creation, Production, Finance, Customer 360, and generated downloads. The RC2 starting artifacts were present: `js/engine-shell.js`, `ENGINE_RC2_ARCHITECTURE.md`, `tests/engine-rc2-shell.test.js`, `ERP_1_0_HANDBOOK.md`, `erp-handbook.html`, and `erp-knowledge-library.html`.

No safe authorized database or Storage administration connection was provided or used. Consequently deployed tables, rows, bucket settings, object inventory, and policy drift are unverified. Public pages were read as source only; forms, acceptance, payments, emails, documents, and public RPCs were not invoked.

## 3. Confirmed current architecture

| Concern | Repository-defined authority | Boundary / conflict |
|---|---|---|
| Asset bytes | Supabase Storage bucket `job-assets` | Deployment and current bucket state unverified. |
| Asset metadata | `asset_records` | It is revision metadata, not entity ownership by itself. |
| Asset/entity relationship | `asset_links` for an exact `asset_revision_id` | Supported types exclude campaign and campaign product. Links are operator-entered strings, not foreign keys to business records. |
| Asset runtime | `js/job-assets-ui.js` plus `js/job-asset-model.js` | Shared internal operator path; no customer upload and no context-filtered query. |
| Quote reference file | Direct `referenceFile`/quote-data URL in the active Quote runtime | Separate from Job Assets; source and persistence semantics of that URL are not enforced as Storage metadata. |
| Recipe manufacturing definition | Versioned `product_recipes.manufacturing_snapshot` and `revision_history` | File links are separate Job Asset links; recipe revision history does not snapshot those links. |
| Generated documents | Browser Blob/print/email render paths owned by Quote, Orders, Production, and Finance | Local/generated-document-only; no Storage persistence found. |
| Campaign setup | `campaigns` | Phase 1 explicitly excludes order/batch/settlement authority. |
| Campaign catalog | `campaign_products` | Mutable current configuration; not an historical sale snapshot. |
| Public campaign read | `get_public_campaign(text)` | Returns slug/code and public product SKU, but deliberately excludes table UUIDs, recipe IDs, owner IDs, and share terms. |
| Campaign sale/order | None found | External intake is only a link; no ingestion or ERP writer exists. |

## 4. Storage implementation inventory

| Source / function | Runtime and caller | Entity / bucket / path | Authorities and behavior | Metadata, errors, tests | Classification |
|---|---|---|---|---|---|
| `js/job-assets-ui.js`: `mount`, form submit | Active on Orders Admin, Production Control, Product Recipes, Customer 360 | Link types order, production job, recipe, customer (and manually quote); `job-assets`; path from model | Authenticated operator uploads object with `x-upsert:false`, then inserts metadata and links. This is sequential, not transactional: a metadata failure can orphan the uploaded object. | Full asset metadata plus SHA-256 and exact links. UI catches and displays errors. Model tests cover validation/path/revision; no fetch integration test. | Active authority; internal operator path; requires lifecycle decision. |
| `js/job-assets-ui.js`: `list` | Same four pages | All owner-visible `asset_records` with nested `asset_links` | Owner-scoped RLS is expected; query has no current-record filter and displays all of the operator's assets. | Error shown in shared notice. Static mount/model coverage only. | Active authority; potential application-level over-disclosure within one owner account. |
| `js/job-assets-ui.js`: `signedUrl`, `signed` | Same four pages | `job-assets/<storage_path>` | Authenticated signed URL request, 300-second expiry, new window. No public URL generation and no direct download call found. | Request failures are displayed. No signed-access integration test. | Active private read path. |
| `js/job-assets-ui.js`: archive click | Same four pages | `asset_records` only | PATCH toggles `active`/`archived` and `archived_at`; object and links remain. Restore is allowed. | Error displayed. Model archive behavior tested. | Active soft-delete path; no physical deletion owner. |
| `js/job-assets-ui.js`: revision click/submit | Same four pages | New UUID object path and new metadata/link rows | Copies link form values, category, designation; new row supersedes selected row and increments its revision. Prior row/object remain and are not automatically archived. | Duplicate active SHA is rejected across all owner assets in UI; DB uniqueness is narrower per revision group. | Active revision authority; collision and concurrency require review. |
| `js/job-asset-model.js`: `safeStoragePath` | Active helper | `owner UUID/asset UUID/rN/asset UUID.ext` | Extension allowlist, normalized identifiers, immutable-looking revision path. UUID generated client-side. | 100 MB application limit; model assertion coverage. | Active path/naming authority. |
| `supabase/migrations/202607160007_job_asset_management.sql` | Manually deployable schema evidence | Bucket, `asset_records`, `asset_links`, `storage.objects` | Defines private bucket, limits, owner RLS, object select/insert/delete. It defines no object UPDATE policy. Application does not call delete. | SQL verification comments only; deployment unverified. | Repository-defined database/storage authority; runtime state unverified. |
| Active Quote runtime `quote.js` | Active on `quote.html` | Quote `referenceFile` value/direct URL | Saves and presents a URL field; no Supabase Storage operation or Job Asset metadata operation was found. | Quote tests exercise quote behavior, not URL custody or retention. | Active compatibility path; requires architectural decision. |
| Public intake pages and `niles.html` | Active public/external paths | Externally hosted form/file references | Repository links or embeds an external intake provider. Uploaded bytes and permissions are outside this repository. No ingestion was found. | External failures and retention are not governed here. | Public customer-upload path; external/unverified. |
| Campaign product `image_url`, `reference_url`; campaign JSON configs | Active Campaign Manager/public display | Direct URL/JSON fields; no bucket | Operators store strings. Public RPC returns product URLs/config. No upload, replace, validation, or deletion function exists. | Save/load errors displayed by manager/public reader. Campaign static test covers allowlist. | Active direct-reference path; requires architectural/security decision. |
| Repository `assets/images`, `assets/docs`, `assets/brand` | Active static site paths where referenced | Git/GitHub Pages-style repository assets | Git filenames are the addressing strategy; replacement is a repository change. Not linked through Job Assets. | Normal static-reference tests; public visibility inherent to deployment. | Active public static assets / generated-document reference. |
| Browser Blob / `URL.createObjectURL` paths | Quote, Orders, Production, Finance | Local browser object URLs | Creates downloads such as email HTML, CSV, JSON, and recovery export. URLs are ephemeral; files are not uploaded or metadata-linked. | Page-specific tests vary. | Generated-document-only / local-only handling. |

No active `/storage/v1/` implementation other than Job Assets was found. No `getPublicUrl`, Storage object copy, move, direct download, or physical remove call was found. Text matches for “upload” outside Job Assets were external intake links or local file imports, not Supabase object writes.

## 5. Bucket/path map

### Bucket: `job-assets`

- **Entity:** bytes whose exact revision is described by `asset_records` and linked through `asset_links`.
- **Path pattern:** `<owner_id>/<asset_id>/r<revision>/<asset_id>.<allowlisted-extension>`.
- **Filename strategy:** original filename stays in metadata; stored filename is the client-generated asset UUID plus the validated lowercase extension.
- **Collision handling:** new client UUID per upload; `x-upsert:false`; unique `storage_path`; unique owner/group/revision. No retry around UUID/path conflicts.
- **Revision handling:** new UUID, path, object, metadata row, and links; `revision_group_id` groups history and `supersedes_asset_id` points backward. Prior bytes remain.
- **Metadata table:** `asset_records`; entity join table `asset_links`.
- **Uploader:** shared UI mounted by `orders-admin.html`, `production-control.html`, `product-recipes.html`, and `customer-360.html`.
- **Readers:** those same pages request signed URLs; the list query is owner-wide.
- **Replacement:** revision creation, not overwrite. The underlying selected record is not automatically archived.
- **Deletion owner:** none in application. Migration grants owner-path object DELETE and metadata owner DELETE, but no UI/RPC coordinates them.
- **Visibility:** migration declares bucket private; signed reads require an authenticated token and expire after 300 seconds. Deployed status is unverified.
- **Limits:** migration bucket limit and application limit are 100 MB. Application extension allowlist and migration MIME allowlist are not identical proof: browser MIME values can vary, and the database records a client-supplied MIME.
- **Policy:** first path segment must equal `auth.uid()` for object select/insert/delete. Metadata and links are owner-scoped by RLS.
- **Known risks:** upload/metadata orphan, owner-wide listing, link strings without referential validation, UI/DB duplicate-rule mismatch, no retention/orphan/recovery process, no coordinated physical delete, and no proof of deployed policy state.
- **Authority status:** sole repository-defined Supabase object bucket; deployment unverified.

No second Supabase bucket or path convention was found. Repository-local public assets, direct URL fields, and external uploads are distinct storage paths, not evidence of another Supabase bucket.

## 6. Job Assets authority

`asset_records` is the single active metadata source of truth. Its primary key defaults server-side but the current UI supplies `crypto.randomUUID()`. It stores owner, original filename, unique object path, MIME, category, size, integer revision, revision group, superseded revision, description, uploader label, active/archive status, designation, SHA-256, and timestamps. `asset_links` identifies parents with `record_type`, `record_key`, and exact `asset_revision_id`.

Supported types are exactly `recipe`, `quote`, `order`, `production_job`, and `customer`. Customer, Quote, Order, Production job, and Product Recipe are therefore representable; Campaign and Campaign Product are not. Keys are free text rather than foreign keys. An operator may enter multiple links at initial upload. The UI can infer one link from `?recipe=`, `?job=`, `?order=`, or Customer 360 `?search=`; Quote has no mounted UI even though its type and deep link exist.

A replacement is a new revision record and new object. Previous rows, links, and objects remain. The UI does not automatically archive the superseded row, and its rendering does not collapse to `currentVersions`, so both can remain marked active and visible. “Delete” is metadata archive/restore only. Neither archival nor any active page deletes object bytes. Although SQL policies permit authenticated owner-path object DELETE and metadata DELETE, no coordinated application delete contract exists.

Page capability is currently uniform: all four mounting pages may list, upload, view/download, revise, archive, and restore because they share the same component. This is application availability, not separate role authorization. RLS distinguishes owner accounts, not Orders versus Production versus Customer 360 responsibilities.

Acceptance does not change link ownership. No automatic quote-to-order, order-to-production, recipe-to-job, or campaign link creation was found. Customer 360 mounts the owner-wide browser rather than aggregating exact customer relationships in its customer bundle. Campaigns do not use Job Assets.

## 7. Quote-to-order file handoff

1. **Quote creation/save:** active root `quote.js` collects a `referenceFile` URL in quote data. `quote.html` does not mount Job Assets. An operator could separately create a `quote` link from another mounted asset page, but this is manual and not part of quote save.
2. **Public review:** `quote-response.html` reads the quote response contract. No Job Assets or Storage fetch appears in that page.
3. **Acceptance:** `accept_quote_response` migrations create/find an Order linked by `source_quote_number`, persist accepted commercial snapshot/event data, and create production authority as defined there. They do not query `asset_records`/`asset_links`, copy objects, or create order/production asset links.
4. **Accepted snapshot:** quote data may retain a direct reference URL as part of saved JSON, but no evidence establishes it as an immutable managed asset or guarantees the accepted snapshot consumer exposes it.
5. **Orders / Production:** both mount the shared browser and can see the operator's owner-wide asset list. Visibility on both pages is not a transfer. Only an explicitly existing `asset_links` row supplies an exact relationship, and acceptance creates none.
6. **Customer 360:** it mounts the same owner-wide list. Its customer-history builder has no asset aggregation or quote-to-order asset transformation.

**Finding:** accepted Orders neither reference the same quote asset automatically nor copy metadata/bytes nor create order-specific asset rows. Direct URLs can persist in quote data and manually created Job Asset links can persist unchanged, but the authoritative handoff is absent and an operator step is required to add order/production links. This can lose relationship context even when bytes remain accessible.

## 8. Product Recipe file handling

Product Recipes persist manufacturing data, not file fields, in `manufacturing_snapshot`: material recipe, hardware/supplies, machine preference, quantities, time and cost estimates, fees, and notes derived from a completed job. Recipe rows also store identity, revision label/number, part/category/status, suggested prices, source job/order, customer-safe descriptions/notes, and prior snapshot history.

Model files, slicer/print profiles, images, assembly/supporting documents, and production documents can be attached only through Job Assets with a free-text `recipe` link. The recipe schema has no direct model/image/profile URL columns. Material specifications, machine settings, and production instructions can reside in the manufacturing JSON/notes; this investigation found no typed file-reference snapshot within it.

Creating a recipe revision snapshots the prior `manufacturing_snapshot` into `revision_history`, but it does not snapshot `asset_links`. A link is pinned to the exact asset revision, yet its `record_key` is only a string chosen by the operator. Repeat-job preload carries `recipe_id`, revision label, and manufacturing snapshot; it does not carry asset revision IDs. Therefore changing manufacturing data does not rewrite old recipe snapshots, but relinking/archiving files and ambiguous use of recipe key versus row ID can make historical file reproducibility unprovable. Production does not automatically receive recipe asset links.

## 9. Campaign asset handling

Campaign configuration can contain arbitrary `branding_config` and `public_config` JSON. Campaign products contain `image_url` and `reference_url`; the public RPC returns both plus public configuration. Campaign Manager’s current product form does not expose those two URL fields or the `product_recipe_id`, even though its JavaScript payload allowlist and schema support them. No campaign upload widget or Storage operation exists.

Thus campaign assets are direct URL/config references owned by the current campaign/product row. A URL may point to a public repository asset, a publicly reachable external object, or another site, but the repository does not validate or classify the destination. Campaign and campaign-product Job Asset links are unsupported. External intake attachments remain under the external provider. Replacement is a mutable field/config update; no revision, historical snapshot, deletion, health check, or broken-link recovery exists.

Public visibility follows RPC exposure and the target URL’s own controls. Because a public RPC returns the URL string, private/signed/customer-specific URLs must not be stored there without a separate approved design. Resulting Orders and Production receive none of these references because no campaign order bridge exists.

## 10. Storage security findings

### Verified in repository definitions

- The migration declares `job-assets` private, with a 100 MB limit and MIME allowlist.
- Object SELECT, INSERT, and DELETE require `authenticated` and first-folder equality to `auth.uid()`.
- `asset_records` and `asset_links` have RLS and owner checks; link insertion also checks the referenced asset belongs to the same authenticated owner.
- The runtime requires a bearer session for metadata and object operations and uses short-lived signed URLs. It does not generate public asset URLs or use service-role credentials.
- Campaign tables revoke anonymous table access; the security-definer RPC is the explicit anonymous allowlist and excludes internal shares, UUIDs, recipe IDs, and internal notes.

### Unverified assumptions and potential exposure

- Migration presence is not deployment proof. Bucket privacy, policies, grants, and drift require authorized read-only production verification.
- The shared asset query exposes all assets within one owner account on every mounting page. Page hiding/context is not authorization; there is no per-entity or per-role policy.
- `uploaded_by` stores a client-provided email label, while authorization is actually `owner_id`; consumers must not treat the label as security evidence.
- No object UPDATE policy exists, which supports non-overwrite behavior. DELETE is permitted at Storage level even though the application lacks an audited deletion workflow; another authenticated client could exercise granted capabilities.
- No database constraint proves that an `asset_links.record_key` belongs to the owner or even exists. Cross-customer confusion inside the same owner account is possible through incorrect free-text linking.
- Application extension checks, client MIME, and bucket MIME enforcement are not equivalent. No content scanning, quarantine, malware validation, download disposition, or SVG active-content review is defined.
- Direct campaign URL/config fields returned publicly can expose whatever an operator stores. The manager label “safe links” is application guidance, not database enforcement.
- External customer uploads have no repository-defined access, retention, deletion, or cross-customer isolation evidence.

### Recommended later non-destructive checks

With explicit authorization, compare deployed buckets and policies to the migration; test two isolated authenticated owners and anonymous access against a synthetic non-customer fixture; verify signed URL expiry; validate disallowed MIME/size behavior; inspect SVG/download headers; enumerate orphan counts without reading file contents; and confirm backups/restores using synthetic objects. Do not infer protection from hidden controls.

## 11. Storage lifecycle decision matrix

| Lifecycle topic | Recommended contract | Label |
|---|---|---|
| Creation | Preserve new-object-before-metadata semantics only after making the operation compensating/idempotent; never overwrite bytes. | Recommended future application change |
| Naming | Retain owner/asset/revision/UUID path because it avoids customer data in paths. | Safe documentation clarification |
| Metadata | Keep `asset_records` as canonical metadata and `asset_links` as exact-revision relationships. | Confirmed existing behavior |
| Entity ownership | Define permitted entity types and validate entity existence/owner; decide whether links represent shared custody or business ownership. | Recommended future database migration; Requires owner decision |
| Revision | New immutable object and row; retain predecessor chain and exact links. | Confirmed existing behavior |
| Replacement | Define “current” explicitly and archive/supersede atomically; do not leave two unintended active revisions. | Recommended future application change |
| Read access | Filter UI by exact entity context and authorize server-side; provide a deliberate all-assets library separately if needed. | Recommended future application change; Requires security review |
| Download | Continue short-lived signed access and force risky CAD/SVG types to safe download disposition after review. | Requires security review |
| Public access | Do not make Job Assets public. Use a separately approved public-asset class for campaign marketing. | Requires owner decision; Requires security review |
| Private access | Owner RLS is baseline; decide whether staff roles/entity membership are required before multi-user growth. | Requires security review |
| Soft deletion | Archive metadata first, retain audit fields and links. | Confirmed existing behavior; Safe documentation clarification |
| Physical deletion | Only a designated retention service/owner may delete after link, hold, backup, and audit checks. | Requires owner decision; Recommended future application change |
| Orphan detection | Scheduled read-only reconciliation of object paths versus metadata, with quarantine/report before cleanup. | Recommended future application change |
| Retention | Set periods for customer-supplied, internal production, historical revisions, and legal holds. | Requires owner decision |
| Quote-to-order | Preserve the same asset revision and add explicit order/production links in the acceptance transaction; do not copy bytes by default. | Requires owner decision; Recommended future database migration |
| Recipe-to-production | Snapshot exact recipe row/revision and exact asset revision IDs into the production handoff. | Recommended future database migration |
| Campaign assets | Keep public marketing assets separate from private production/customer files; snapshot exact references on sale. | Requires owner decision; Requires security review |
| Customer protection | Never place names/emails/order titles in object paths; filter and authorize links by entity. | Safe documentation clarification; Requires security review |
| Backup/recovery | Document bucket and metadata backup consistency, restore ordering, recovery point, and synthetic restore test. | Requires owner decision; Requires security review |
| Auditability | Record actor, action, reason, predecessor, link changes, signed-download events where proportionate, and physical deletion result. | Recommended future database migration; Requires security review |

## 12. Campaign data-model inventory

### `campaigns`

- **Primary/business/public identity:** UUID `id`; owner-unique `campaign_code`; globally unique formatted `campaign_slug`.
- **Lifecycle/dates:** `status` is draft/scheduled/active/closed/archived; optional `starts_at`, `ends_at`; `created_at`, `updated_at` with update trigger.
- **Organization/customer:** `organization_name` is descriptive text; there is no customer/organization foreign key.
- **Commercial/fulfillment:** `payment_mode`, `delivery_mode`; no sale price or order snapshot.
- **Assets/config:** `branding_config`, `public_config`, public description; direct JSON without an asset foreign key.
- **Visibility:** owner-authenticated table policy. Anonymous callers use the RPC only for scheduled/active, in-window records. Scheduled campaigns may begin before `starts_at` by the RPC’s explicit condition.
- **Writer/readers:** Campaign Manager creates/updates and lists. Public fundraiser reads only via RPC. No delete grant is declared for authenticated users despite an all-command policy; table grants limit effective application privileges.

### `campaign_products`

- **Primary/business relationship:** UUID `id`; required `campaign_id`; owner `user_id`; campaign-unique `campaign_sku`; optional exact `product_recipe_id` whose deletion sets it null.
- **Catalog/status:** display fields/order and `enabled`; timestamps/update trigger.
- **Prices:** current standard/personalized customer prices and private OliPoly share values. Values are constraints-protected but mutable; no historical line snapshot exists.
- **Personalization:** flag, instructions, JSON limits.
- **Assets:** direct `image_url` and `reference_url`.
- **Visibility:** authenticated owner policy also checks campaign ownership. The public RPC returns enabled products and public price/personalization/URL fields, but not UUID, campaign UUID, recipe UUID, owner, or shares.
- **Writer/readers:** Campaign Manager list/create/update; public fundraiser consumes only the RPC projection. Current HTML form omits recipe and URL inputs, so those schema fields require another client/manual operation to populate.

### Public campaign snapshot

`get_public_campaign(text)` returns a current JSON projection, not a stored immutable snapshot. It includes campaign slug/code, descriptive/lifecycle/payment/delivery/config values, and enabled product SKU/display/current prices/personalization/URLs. There is no insert authority, submission identifier, customer identity, quantity, tax, fulfillment selection, payment state, or order link in this payload.

## 13. Public campaign flow

For `fundraiser.html`, query parameter `campaign` is normalized and passed to `get_public_campaign`. The RPC validates the slug, selects one scheduled/active in-window campaign, and aggregates enabled products. Public identity is preserved only as campaign slug/code and product SKU in the returned display payload. Prices are read from current campaign-product rows. Product table UUID and recipe identity are intentionally absent.

The page renders campaign/product information. If `public_config.intake_url` exists, it opens that external intake in a new tab. The page contains no form controls, order POST, customer capture, product-selection payload, quantity, variant, personalization submission, fulfillment selection, payment confirmation, or Finance post. External intake/payment semantics cannot be verified from the repository. No callback/webhook/importer converts a submission to an ERP record.

Consequently customer identity, selected product, fulfillment, personalization, payment state, and campaign attribution do not persist in OliPoly through this page. Any operator order creation/reconciliation is manual and outside an authoritative stored contract.

Niles is traced separately in section 19 and must not be treated as the generic flow.

## 14. Campaign-to-order findings

Repository-wide runtime searches found no `campaign_id`, `campaign_product_id`, `source_campaign_id`, `source_campaign_product_id`, `campaign_slug`, `campaign_sku`, `fundraiser_id`, campaign snapshot, or external submission identifier writer/reader in Orders. The only operational campaign references are Campaign Manager, the public reader, Hub/shell navigation labels, migration/tests, and documentation.

Orders created by Quote acceptance have the authoritative `source_quote_number` relationship. Campaign tables are not consulted. No campaign-origin order creation RPC exists. No immutable campaign-order snapshot exists. Campaign identity therefore does not survive order creation because it never enters it; free text must not be used as a substitute. Contextual campaign navigation cannot be safely implemented from the present Orders model.

## 15. Campaign-product authority

For setup and current public display, `campaign_products.id` is the internal authority, `campaign_id` is the campaign relationship, `campaign_sku` is the public business identifier, and optional `product_recipe_id` is the reusable production relationship. Current quantity is absent. Variant is absent except that standard/personalized price and personalization rules are displayed. Personalization response, chosen fulfillment, discount, tax treatment, and recipe revision are absent.

Current product prices, image/reference URLs, and rules are authoritative **configuration values**, not historical order values. The public page receives display values and submits none. External forms/payments are unverified. No operator-entered campaign order field was found. Therefore exact selected product, quantity, personalization, historical price, tax, fulfillment, image, recipe revision, and resulting totals are missing from an authoritative campaign sale record.

## 16. Campaign-to-production findings

There is no campaign order writer, so there is no reliable automatic Production handoff. `campaign_products.product_recipe_id` could identify a current recipe row when populated, but the public RPC excludes it, Campaign Manager HTML does not edit it, no sale snapshots it, and no production runtime reads campaigns.

| Capability | Classification | Evidence-based reason |
|---|---|---|
| One campaign order per customer | Unsupported | No campaign order/submission model. |
| Multiple products in one submission | Unsupported | Public page displays only; no line collection. |
| Personalized and standard products together | Unsupported | No submitted lines/personalization values. |
| Batch production across campaign orders | Unsupported | No campaign order link or batch entity/query. |
| Campaign-specific fulfillment | Partially supported / manual | Campaign has a current delivery mode, but no customer selection/order persistence. |
| Event pickup | Partially supported / manual | Enum can configure it; no order handoff. |
| Campaign reporting | Unsupported | Setup/catalog can be listed, but sales are unattributed. |

Required production fields—order identity, exact recipe revision/snapshot, quantity, personalization, material/color, production status, asset revisions, and batch group—are not assembled from a campaign. Manual transcription may occur operationally but is not repository authority.

## 17. Campaign-to-Finance findings

Finance runtime and invoice authority contain no campaign identifier or campaign-product reader. Campaign revenue cannot be distinguished authoritatively, external payment references do not persist, and no stored contract separates fundraiser proceeds from OliPoly revenue. Campaign product rows hold current OliPoly share configuration, but no sale/settlement snapshot consumes it. Tax treatment is absent from the campaign model. Present data can report configured campaigns/catalog values only, not trustworthy historical campaign sales, proceeds, taxes, or profitability.

## 18. Campaign-to-Customer-360 findings

Customer 360 builds exact customer history from its existing customer/quote/order/project/Finance sources. It contains no campaign query or field. It cannot authoritatively show campaign, campaign product, campaign personalization, campaign fulfillment, or campaign payment. It can show ordinary order production/payment state only if an order exists through another workflow, but that order has no persisted campaign attribution. Similar names or email matching must not bridge this gap.

## 19. Niles classification

`niles.html` is a standalone static public campaign page. It embeds an external intake form and links to organization-hosted external payment paths for two displayed standard/personalized product choices. Payment information is explicitly handled outside OliPoly’s page.

It does not reference `campaigns`, `campaign_products`, `get_public_campaign`, generic campaign slug/code/SKU, Orders, Production, Customer 360, or Finance. No order-creation callback, webhook, import, or production recipe identifier was found. Product identifiers are presentation labels/options, not persisted ERP keys. Campaign and Finance attribution, payment reconciliation, order creation, and production handoff are therefore manual/unverified. It is a Tally/external-payment workflow and only partially integrated with the ERP at the level of human operations; it is not proven to be connected to the generic Campaign Manager.

Public form and payment URLs were intentionally not copied into this report.

## 20. Campaign authority decision matrix

| Future contract | Recommendation | Label |
|---|---|---|
| Campaign identity on Order | Persist immutable `campaign_id`/source relationship, never infer from text. | Requires database migration; Requires owner decision |
| Campaign-product identity | Persist exact internal campaign-product ID for every sale line plus public SKU snapshot. | Requires database migration |
| Immutable campaign-order snapshot | Snapshot campaign code/slug, organization terms, selected lines, and version/time at ingestion. | Requires database migration; Requires RPC change |
| Historical price | Store unit price/share/tax inputs on line at acceptance/import; never reread mutable catalog for history. | Requires database migration; Requires owner decision |
| Personalization | Store validated per-line structured response and printable instruction snapshot. | Requires public-form change; Requires database migration |
| Quantity | Required positive per-line integer in submitted/accepted snapshot. | Requires public-form change; Requires database migration |
| Fulfillment | Snapshot campaign mode and selected fulfillment/pickup event; Orders owns execution. | Requires public-form change; Requires owner decision |
| External payment reference | Store provider-safe opaque submission/payment reference and state; never credentials or payment details. | Requires payment integration change; Requires security review |
| Recipe linkage | Snapshot exact active recipe row/revision per campaign line and preserve it into Production. | Requires database migration; Requires owner decision |
| Production batching | Add explicit batch entity/association only after per-order authority exists. | Requires database migration; Out of scope |
| Customer 360 | Read exact campaign/order/line foreign keys; no fuzzy reconciliation. | Safe application-only enhancement after persistence |
| Finance attribution | Post/reference campaign, line snapshot, collected-by party, and payment reference through Finance authority. | Requires database migration; Requires owner decision |
| Campaign reporting | Derive from accepted/order/Finance relationships, not current campaign prices. | Safe application-only enhancement after persistence |
| Contextual navigation | Use stable IDs on internal pages and slug only on public view. | Safe application-only enhancement after persistence |

## 21. Required owner decisions

### Decision 1 — What classes of file may use the canonical private bucket?

- **Question:** Should `job-assets` remain the canonical private bucket for customer/quote/order/job/recipe files, while public campaign marketing assets use a separate public delivery contract?
- **Current behavior:** `job-assets` is the sole defined private bucket; campaigns use direct public URL/config fields.
- **Options:** mix all assets in one private bucket with signed public delivery; keep private operational files there and define a separate public class; keep uncontrolled direct URLs.
- **Recommended option:** retain `job-assets` for private operational files and approve a separately secured public marketing class—not customer uploads—for campaigns.
- **Impact:** clear custody and safer public rendering. **Migration:** likely bucket/policy and campaign-reference work later. **Security:** separates public content from customer/manufacturing files. **Compatibility:** direct campaign URLs need staged support. **No action:** URL provenance and public/private boundaries remain unverified.

### Decision 2 — Who may archive and physically delete, and how long are revisions retained?

- **Question:** Which role owns archive, restore, retention holds, and eventual byte deletion?
- **Current behavior:** every mounting page can archive/restore metadata; no UI deletes bytes; owner-path SQL permits object deletion.
- **Options:** indefinite retention; timed retention after archive; reviewed deletion with legal/customer holds.
- **Recommended option:** reviewed soft deletion, retain historical revisions for an owner-approved period, then audited physical deletion only when unlinked and backed up.
- **Impact:** storage cost versus reproducibility. **Migration:** audit/hold fields may be needed. **Security:** reduces excessive retention without enabling casual deletion. **Compatibility:** archives remain readable during transition. **No action:** bytes accumulate and any alternate authenticated client may use broad delete capability without a business contract.

### Decision 3 — Should acceptance share asset revisions or copy them?

- **Question:** On Quote acceptance, should the Order/Production job receive links to the exact same revision or copies?
- **Current behavior:** acceptance creates no asset links or copies.
- **Options:** shared exact-revision links; metadata/object copy; manual linking.
- **Recommended option:** atomically add Order and initial Production links to the same immutable revision; never copy bytes unless a legal isolation case requires it.
- **Impact:** reliable handoff with minimal duplication. **Migration:** acceptance RPC/link validation likely required. **Security:** requires owner/entity checks. **Compatibility:** existing quote-only assets need a reviewed backfill, not text matching. **No action:** operators can miss production files.

### Decision 4 — Must recipe revisions freeze exact file revisions?

- **Question:** Must a recipe revision and resulting Production job snapshot exact Job Asset revision IDs?
- **Current behavior:** manufacturing JSON is versioned, while file links are separate and repeat preload omits them.
- **Options:** current loose links; exact file manifest per recipe revision; embed URLs.
- **Recommended option:** exact immutable file manifest using asset revision IDs, copied by reference into the production snapshot.
- **Impact:** historical reproducibility. **Migration:** recipe/production manifest relationship required. **Security:** private signed access remains. **Compatibility:** old recipes remain “file manifest unverified.” **No action:** historical files cannot be proven reproducible.

### Decision 5 — What is the authoritative campaign-sale ingestion path?

- **Question:** Will external form/payment submissions be imported automatically/idempotently, or will an operator create a reviewed campaign Order?
- **Current behavior:** no campaign submission becomes an ERP order.
- **Options:** provider webhook/import; reviewed staging queue; permanent manual ordinary Orders.
- **Recommended option:** reviewed, idempotent staging-to-Order flow first; automate only after external contracts and failure handling are proven.
- **Impact:** campaign identity survives without prematurely trusting external events. **Migration:** submission, lines, order link/idempotency required. **Security:** webhook verification/PII minimization required. **Compatibility:** manual historical sales remain unattributed unless explicitly reconciled. **No action:** campaign sales stay outside ERP authority.

### Decision 6 — Which campaign terms must be frozen on each sale?

- **Question:** Must exact campaign product, recipe revision, price/share, tax, quantity, personalization, fulfillment, and external reference be immutable at order creation?
- **Current behavior:** only mutable current catalog terms exist; no sale snapshot exists.
- **Options:** minimal campaign ID only; complete immutable line snapshot; reread current catalog.
- **Recommended option:** complete immutable line snapshot plus stable foreign keys; Orders owns fulfillment, Production owns execution, Finance owns posting.
- **Impact:** auditable production and reporting. **Migration:** required. **Security:** minimize customer/personalization exposure. **Compatibility:** old manual orders cannot be safely reconstructed from names. **No action:** historical totals and selected products remain unknowable.

### Decision 7 — Is Niles transitional or the template for generic campaigns?

- **Question:** Should the existing Niles external intake/payment workflow remain explicitly manual, or be onboarded to the future generic ingestion contract?
- **Current behavior:** standalone static page; no generic RPC or ERP handoff.
- **Options:** retain manual and label it transitional; onboard without changing public presentation; retire after campaign close.
- **Recommended option:** keep it explicitly manual until the generic reviewed ingestion exists, then decide onboarding with the organization; do not retrofit by name matching.
- **Impact:** avoids disrupting a live public path. **Migration:** none now; future campaign/order records if onboarded. **Security:** external provider review required. **Compatibility:** public URLs and payment remain untouched. **No action:** continued manual reconciliation and no attribution.

## 22. Recommended implementation sequence

1. Obtain the owner decisions above and authorize read-only deployed-state verification.
2. Verify bucket/table/RLS/grant drift with synthetic identities; document backup, retention, and external-provider constraints.
3. Tighten the application asset browser to exact entity context and establish an explicit all-assets administration view; add compensating orphan handling.
4. Design and review asset-link integrity, audit/retention fields, recipe file manifests, and acceptance handoff migration/RPC changes as one storage lifecycle milestone.
5. Define the immutable campaign submission/order-line contract, external idempotency/security boundary, and ownership split among Campaign, Orders, Production, and Finance.
6. Implement a reviewed campaign staging/import path with exact campaign/product/recipe snapshots before adding batching, reporting, Customer 360, or contextual navigation.
7. Validate Finance posting and Customer 360 reads from persisted keys, then separately decide whether Niles is onboarded. Preserve public behavior until explicitly authorized.

## 23. Explicitly deferred work

No schema, migration, RPC, trigger, policy, bucket, object, runtime logic, public page, campaign record, Order, Quote, Production job, customer record, Finance entry, email, or generated customer document was created or changed. Also deferred: live policy tests, provider/webhook inspection, backfill, fuzzy reconciliation, asset cleanup, public campaign redesign, payment integration, campaign batching/reporting, and Handbook changes.

## 24. Source references

All paths below existed at investigation time.

- RC2 baseline: `js/engine-shell.js`, `ENGINE_RC2_ARCHITECTURE.md`, `tests/engine-rc2-shell.test.js`, `ERP_1_0_HANDBOOK.md`, `erp-handbook.html`, `erp-knowledge-library.html`.
- Job Assets: `js/job-asset-model.js`, `js/job-assets-ui.js`, `css/job-assets.css`, `supabase/migrations/202607160007_job_asset_management.sql`, `tests/job-asset-model.test.js`, `MILESTONE_4C_ASSET_DEPLOYMENT.md`.
- Private mounting pages: `orders-admin.html`, `production-control.html`, `product-recipes.html`, `customer-360.html`.
- Quote and acceptance: `quote.html`, `quote.js`, `quote-response.html`, `supabase/migrations/202607200002_quote_acceptance_authority.sql`, `supabase/migrations/202607200003_quote_accepted_snapshot_security.sql`, `supabase/migrations/202607200004_quote_acceptance_runtime_correctness.sql`, `supabase/migrations/202607200005_quote_acceptance_runtime_safety.sql`.
- Recipes: `js/product-recipe-model.js`, `supabase/migrations/202607160005_product_recipe_library.sql`, `supabase/migrations/202607160006_product_recipe_revision_history.sql`, `tests/product-recipe-model.test.js`.
- Campaigns: `campaign-manager.html`, `js/campaign-manager.js`, `fundraiser.html`, `niles.html`, `supabase/migrations/202607210008_campaign_manager_phase1.sql`, `tests/campaign-manager-phase1.test.js`, `FUNDRAISER_CAMPAIGN_MANAGER_PHASE1.md`.
- Downstream authority: `js/customer-360.js`, `finance-pro.js`, `js/invoice-authority.js`, `supabase/migrations/202607210009_invoice_authority_contract.sql`, `js/production-status-persistence.js`, `supabase/migrations/202607200006_workflow_command_authority.sql`.
- Local/public assets and generated downloads: `assets/images`, `assets/docs`, `assets/brand`, `js/erp-reliability.js`.

## 25. Validation performed

- Repository-wide literal/reference searches classified Storage API, metadata, campaign, order, Production, Finance, Customer 360, external intake, and local download paths.
- All cited paths were statically checked for existence by the focused RC2.1 test.
- Git-diff boundary assertions verify that only this report, RC2 architecture, Knowledge Library, and the focused test changed; public/runtime/SQL paths remain unchanged.
- Credential/PII/payment-link guards scan this report. Publishable client configuration present in runtime was neither reproduced nor treated as a secret in this report.
- Node test suite, JavaScript syntax, inline-script parsing, local references, duplicate IDs, whitespace, and Git state were validated as reported in the delivery summary. No manual browser or live Supabase behavior is claimed.

## RC2.3 implementation update

RC2.3 closes the investigated operational asset gaps without entering Campaign authority. One entity-filtered shared browser now covers Quote, Order, Production Job, Recipe, and supported Customer contexts. Upload/retry behavior distinguishes Storage, metadata, link, and cleanup outcomes. The RC2.3 migration adds recipe manifest semantics and exact customer-supplied Quote-to-Order link handoff; it does not change campaign submission/conversion behavior. See `ENGINE_RC2_3_AUTHORITATIVE_ASSET_LIFECYCLE.md`.
