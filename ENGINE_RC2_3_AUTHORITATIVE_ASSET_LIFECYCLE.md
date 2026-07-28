# OliPoly Engine RC2.3 — Authoritative Asset Lifecycle

## Authority hierarchy

Supabase Storage private bucket `job-assets` owns bytes. `asset_records` owns exact revision identity, object path, digest, MIME/size, category, designation, description, revision, and active/archive state. `asset_links` owns explicit relationships from an exact revision ID to an exact ERP database ID. The shared `js/job-assets-ui.js` is only an authenticated command/read client; DOM and browser state are not durable authority.

## Runtime and entity map

`js/job-asset-model.js`, `js/job-assets-ui.js`, and `css/job-assets.css` are the one shared implementation mounted by Quote, Orders Admin, Production Control, Product Recipes, and Customer 360. A record query uses an inner `asset_links` filter for the page's explicit context. The owner-wide, 200-row capped view exists only when no record context is supplied and is labeled maintenance. No bucket listing is used.

| Page | Link authority |
| --- | --- |
| Quote | `quote` plus loaded/query Quote database ID |
| Orders Admin | `order` plus loaded/query Order database ID |
| Production Control | `production_job` plus loaded/query job database ID |
| Product Recipes | `recipe` plus loaded/query recipe database ID |
| Customer 360 | `customer` only where the existing exact customer context exists |

Pages must set `data-asset-type` and `data-asset-key` when an in-page selection changes without navigation. A URL value is not authorization: table and Storage RLS still require the authenticated owner.

## Upload transaction and recovery

1. Validate nonempty file, repository MIME/extension allowlist, and 100 MiB limit.
2. Require a recovered authenticated user and explicit link.
3. Hash bytes, allocate a new UUID, and create an owner-first, revision-specific path.
4. Reject an exact duplicate active logical revision and lock the submit handler.
5. Upload with overwrite disabled.
6. Insert `asset_records`.
7. Insert idempotent `asset_links`.
8. Report success only after all required authority exists.

If Storage succeeds and metadata fails, only the exact newly allocated path is eligible for automatic removal. A failed exact cleanup becomes an operator-visible cleanup-required item; no prefix scan occurs. If metadata succeeds and linking fails, the revision remains visible as uploaded-but-unlinked and the retry only creates the exact missing links. A Storage failure creates no metadata. Session, network, and authorization failures remain visible. Retrying never deletes or rewrites an older revision. The ordinary UI has no permanent-delete control.

## Revision, archive, and cleanup

A new revision receives a new UUID/path/metadata row and points to the prior revision with `supersedes_asset_id`; the revision group remains stable. Prior rows and bytes remain. Archive changes metadata status only. Permanent cleanup is deliberately absent: any future operator tool must prove owner, exact path, inactive/noncurrent status, links/history, and explicit confirmation before one-object removal.

## Quote-to-Order handoff

Migration `202607280001_authoritative_asset_lifecycle.sql` adds an after-insert Order trigger in the same acceptance transaction. It resolves the exact Quote by the authoritative `source_quote_number` and matching owner, selects Quote links whose `record_key` is the Quote database UUID, and inserts an Order link whose `record_key` is the new Order database UUID. It reuses the exact revision and leaves Quote links/bytes untouched. The existing unique link constraint plus `ON CONFLICT DO NOTHING` makes retries idempotent.

Only active `customer_supplied` Quote revisions transfer automatically. The deployed designation vocabulary cannot safely distinguish an approved production reference from temporary/internal work, so internal files do not auto-transfer. Expanding that policy requires an owner-approved designation contract; it must not be inferred from filenames.

## Recipe manifests

`asset_links.link_type` expresses `manifest:<role>:current|historical` for source design, export mesh, slicer project, reference image, setup document, quality reference, or packaging reference. Membership pins an exact `asset_revision_id`; it never follows a filename or newest revision. The shared view reports complete, incomplete, archived-reference, inaccessible, or review-required. Replacing a selection changes the old link to historical and creates a current link to the new exact revision; asset history remains intact. Required roles may be supplied with `data-required-asset-roles` by recipe policy.

## Security boundary and deployment

The existing Engine authentication gate remains the session authority. Browser requests use the user token and anon API key only. Metadata and object RLS remain owner-scoped; the bucket remains private; reads use five-minute signed URLs. The handoff function checks Quote, Order, link, and asset owner equality and is not executable by browser roles. No token, URL, filename, or record content is logged.

The migration is repository evidence only. Review and deploy it through the normal Supabase migration process; this milestone does not mutate production data. Existing links receive `attachment`. No backfill or automatic cleanup is performed.

## Manual verification (synthetic data only)

1. User A uploads and explicitly links an approved small fixture to a recipe; opens it; creates a revision; verifies the old revision; archives the intended revision; and reviews readiness/history.
2. User B sees no User A metadata, cannot sign User A's path, and cannot use User A record IDs to list/link/revise/archive. User B manages a separate fixture.
3. A mocked/safe Quote acceptance fixture links a customer-supplied exact revision by Quote UUID, accepts it, proves the same revision has Quote and Order UUID links, and repeats acceptance without another equivalent link.
4. Exercise Storage failure, metadata failure, link failure, network interruption, expired session, double click, MIME/size rejection, and exact-cleanup failure with mocked boundaries.
5. Confirm public RC5 pages, printable/customer documents, financial snapshots, workflow statuses, emails, and payment paths are unchanged.

## Unresolved owner decision

Define whether a new designation should represent an approved production reference. Until approved and deployed, only `customer_supplied` assets transfer automatically; internal assets require an explicit operator Order link.
