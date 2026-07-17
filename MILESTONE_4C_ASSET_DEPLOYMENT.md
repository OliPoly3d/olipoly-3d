# Milestone 4C asset deployment

## Model

`asset_records` stores immutable file-revision metadata. `revision_group_id` groups revisions, while each revision has its own ID and private Storage path. `asset_links` links that exact revision to any number of Recipe, Quote, Order, Production job, or Customer records. Existing records require no asset.

The `job-assets` bucket is private. Authenticated owner-only RLS protects both metadata and bytes; downloads use five-minute signed URLs. Customer-supplied assets use the same private controls and carry the explicit `customer_supplied` designation. Browser storage is not used for assets.

## Deployment order

1. In the Supabase SQL editor, run `supabase/migrations/202607160007_job_asset_management.sql` once. It idempotently creates/updates the private bucket, tables, indexes, grants, and policies.
2. Run the three verification queries at the bottom of the migration.
3. Deploy the static application files.
4. Perform the manual browser and multi-device checks from the Pull Request. Do not make the bucket public.

No existing table, RPC, pricing calculation, workflow status, inventory lifecycle, or Finance query is changed. New application queries target only `asset_records`, `asset_links`, and the `job-assets` Storage bucket.
