# OliPoly Engine RC2.2 — Deployed Storage Verification

**Verification timestamp:** 2026-07-27 UTC
**Starting revision:** `2f3c932`
**Result:** **Blocked — RC2.3 must not begin.**

## 1. Executive summary

RC2 and RC2.1 are present. Repository evidence defines a coherent private Job Assets contract, but this environment has no authorized read-only Supabase session, database connection, management integration, or operator-supplied catalog results. A minimal anonymous probe using only existing public-client configuration failed before receiving an HTTP response. No deployed bucket, schema, policy, grant, object aggregate, owner-isolation, or signed-read fact can therefore be claimed as verified.

This meets the RC2.2 stop condition that live access is unavailable. Repository expectations below are not a substitute for deployed evidence. An authorized operator must return the sanitized evidence in section 8 before RC2.3 proceeds.

## 2. Repository-expected state

`supabase/migrations/202607160007_job_asset_management.sql` expects:

- a private `job-assets` bucket, 100 MiB limit, and explicit MIME allowlist;
- `asset_records` immutable revision metadata and `asset_links` exact revision relationships;
- UUID primary keys, owner references, an asset-revision foreign key, uniqueness/check constraints, owner/context indexes, timestamps, and defaults;
- supported links `recipe`, `quote`, `order`, `production_job`, and `customer`, excluding campaign and campaign product;
- RLS on both tables with authenticated owner-scoped access;
- owner-first object select, insert, and delete policies;
- authenticated table grants subject to RLS; and
- five-minute signed reads in the Job Assets runtime.

The migration defines no Job Assets RPC, trigger, or object update policy.

## 3. Deployed verified state

| Area | Verified result |
|---|---|
| Bucket existence, privacy, size, MIME configuration | Blocked: no authorized metadata connection |
| Aggregate object count, path conformance, unexpected prefixes, orphan candidates | Blocked: no aggregate query channel |
| Tables, columns, types, keys, constraints, indexes, defaults, triggers | Blocked: no catalog access |
| Grants, RLS, policies, functions, RPC grants | Blocked: no catalog access |
| Anonymous table/object access | Not verified: probe received no HTTP response |
| Authenticated, cross-owner, and object-path isolation | Blocked: no authorized synthetic identities |
| Signed URL behavior | Blocked: no authenticated session or synthetic object |
| Insert, update, archive, and delete behavior | Blocked: no approved rollback-isolated policy harness |
| Campaign-type exclusion | Repository SQL only; deployed constraint unverified |

No response body, filename, private path, signed URL, customer data, or credential was collected or recorded.

## 4. Exact drift

Exact drift is **unknown**. There is no evidence that the repository migration was deployed completely or remains unchanged. Unknown state must not be represented as matching state.

## 5. Security impact

Privacy, RLS, grants, anonymous denial, owner isolation, and path isolation are security controls, not documentation assumptions. Continuing without proof could expose operational files across owners or anonymously. No unauthorized access was attempted and no live object or business record was read, created, modified, archived, or deleted.

## 6. Functional impact

The application expects private signed reads and owner-scoped metadata. Drift in bucket settings, schema, policies, or MIME coverage could break uploads, links, revisions, archive/restore, or future immutable handoffs. Unknown aggregate paths and orphan candidates also prevent safe lifecycle planning.

## 7. MIME and size review

| Need | Repository coverage | Required follow-up |
|---|---|---|
| STL | Explicit STL MIME variants | Verify deployed list |
| 3MF | Explicit model MIME; binary fallback | Confirm producer values |
| STEP/STP | Explicit model MIME; binary fallback | Confirm `.stp` producer values |
| OBJ | Generic binary only | Decide explicit support |
| G-code | Plain text or generic binary only | Confirm intentional support |
| Images | PNG, JPEG, WebP, SVG | Verify deployed list |
| PDFs | Explicit PDF MIME | Verify deployed list |
| Spreadsheets | No explicit spreadsheet MIME | Decide if operationally required |
| Text instructions | Plain text and Markdown | Verify deployed list |
| ZIP | Explicit ZIP MIME | Verify deployed list |
| Bambu Studio projects | No explicit project MIME | Confirm producer MIME and intent |

The repository ceiling is 100 MiB. Because deployed configuration is unavailable, none of these formats is verified as operationally supported. Do not expand the allowlist in RC2.2.

## 8. Required correction and continuation gate

Provide approved read-only deployed access, or have an authorized operator run section 10 and return sanitized evidence containing:

1. bucket privacy, limit, allowlist, and aggregate-only object/path/orphan results;
2. complete table/catalog, policy, grant, relevant function, and RPC-grant results;
3. proof of RLS and anonymous metadata/object denial;
4. separately authorized rollback-isolated same-owner and cross-owner policy results; and
5. actual application MIME samples or an approved required-format inventory.

RC2.3 may proceed only after this proves the private bucket, both tables, required RLS, owner/path isolation, anonymous denial, no material schema drift, and adequate MIME coverage. Security drift must be corrected and re-verified first.

## 9. Blocked verification

The exact blocker is that live access is unavailable: no deployment credentials, authenticated read-only session, database settings, synthetic identities, management channel, or operator evidence exists in this environment. Network execution also failed before the anonymous boundary probe received a status. This blocks every deployed-authority claim required by RC2.2.

## 10. Sanitized queries used

Local repository inspection did not print client configuration. The anonymous probe requested at most one metadata row/object, discarded bodies, and received no HTTP response.

Prepared read-only catalog queries for an authorized operator follow. Object inspection remains aggregate-only.

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'job-assets';

select table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('asset_records', 'asset_links')
order by table_name, ordinal_position;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('asset_records', 'asset_links'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('asset_records', 'asset_links');

select c.conrelid::regclass as table_name, c.conname, c.contype,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid in ('public.asset_records'::regclass, 'public.asset_links'::regclass)
order by table_name, c.conname;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('asset_records', 'asset_links')
order by tablename, indexname;

select event_object_schema, event_object_table, trigger_name,
       event_manipulation, action_timing, action_statement
from information_schema.triggers
where event_object_schema = 'public' and event_object_table in ('asset_records', 'asset_links')
order by event_object_table, trigger_name;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('asset_records', 'asset_links')
order by table_name, grantee, privilege_type;

select routine_schema, routine_name, routine_type, data_type
from information_schema.routines
where routine_schema in ('public', 'storage')
  and (routine_name ilike '%asset%' or routine_name ilike '%storage%')
order by routine_schema, routine_name;

select bucket_id, count(*) as object_count,
       count(*) filter (where cardinality(storage.foldername(name)) < 2) as unexpected_path_count
from storage.objects where bucket_id = 'job-assets' group by bucket_id;

select count(*) as orphan_candidate_count
from storage.objects o
where o.bucket_id = 'job-assets'
  and not exists (select 1 from public.asset_records a where a.storage_path = o.name);
```

The authorized review must also inspect function execute privileges using the deployed PostgreSQL catalog. Catalog text does not prove policy behavior; isolation tests need separately approved synthetic identities.

## 11. Environment limitations

- No Git remote is configured, so latest-main fetch verification and branch publication are unavailable.
- The local starting commit is the RC2.1 merge and contains all required starting artifacts.
- No authorized live Supabase or authenticated policy-test facility is configured.
- The anonymous network probe received no HTTP response.
- No browser behavior was exercised because runtime and public pages are unchanged.

## 12. Actions not performed

No migration was added or applied. No SQL mutation was executed. No Storage, database, runtime, public page, Niles page, URL, payment presentation, customer document, file, business record, campaign, Order, Production work, inventory, Finance entry, email, or payment was changed or submitted. No synthetic live record was created.

## 13. Evidence and documentation links

- [RC2 verified architecture](ENGINE_RC2_ARCHITECTURE.md)
- [RC2.1 authority investigation](ENGINE_RC2_1_STORAGE_CAMPAIGN_AUTHORITY.md)
- [Repository Job Assets migration](supabase/migrations/202607160007_job_asset_management.sql)
- [Job Assets model test](tests/job-asset-model.test.js)
- [RC2.2 verification test](tests/engine-rc2-2-deployed-storage-verification.test.js)

## RC2.3 forward deployment note

The verified RC2.2 private bucket and owner-RLS baseline remains unchanged. RC2.3 depends on reviewed deployment of `202607280001_authoritative_asset_lifecycle.sql` for `asset_links.link_type` and the acceptance-time link trigger. Runtime UI deployment must follow or accompany that migration. RC2.3 performs no production migration or data mutation itself; repeat the two-user denial checks after deployment.
