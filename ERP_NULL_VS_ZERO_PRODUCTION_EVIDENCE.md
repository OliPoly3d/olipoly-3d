# Production evidence: NULL versus zero

## Root cause and prevention

The historical Production Control serializer normalized optional numeric actuals with the page-wide `num()` helper. Because `num(null)`, `num(undefined)`, and `num('')` all return `0`, an older broad cloud payload stored four fake zeros on pre-production rows. Browser recovery and `job_payload` hydration could preserve and resend that contaminated snapshot. The later RLS reliability work stopped direct actual-column writes, but existing rows remained blocked by the intentionally strict pre-acceptance RPC.

The canonical rule is now: `NULL` is unrecorded; numeric `0` is explicitly recorded evidence. `OliPolyProductionEvidence` parses blank numeric/string/JSON values as null, preserves finite zero, rejects malformed/non-finite numeric input, builds presence-sensitive patches, and removes actual evidence from unrelated persistence payloads. Estimate edits never clear authoritative actual columns; they simply omit them. JSON export, local storage, and hydration use native JSON semantics, which preserve both `null` and `0`.

The repository audit found the contaminating direct serializer only in Production Control's superseded broad payload. Quote, Orders, Inventory, Finance, Hub, Campaign Manager, Track, and Pay read actual production data but do not create `production_jobs` actuals. The controlled Complete Print RPC is the only current writer of actual evidence. Its explicit scrap default is intentional inside that authorized completion command. No public-page mutation path was found.

## Schema and repair

Migration `202607280005_repair_preproduction_zero_actual_contamination.sql` removes any column defaults so omitted optional evidence remains NULL. It does not change RLS, grants, or RPCs. Its candidate report must be retained with deployment records.

A row is repaired only if it is `estimate` or `waiting_customer`; has no order, start/completion timestamp, machine, filament evidence, attempt, roll use, capture marker, or inventory deduction; and all four contaminated numerics exactly match the legacy all-zero signature. Positive, negative, partially populated, advanced, linked, started, completed, or otherwise evidenced rows are untouched. The known row `27be9786-47bb-4e20-a4b5-5ad05c407f08` is repaired if—and only if—its payload also passes these checks. After repair, the existing RPC can promote it normally. Explicit zeros in produced work remain evidence and still block pre-acceptance commands.

No database credentials are available in this checkout, so candidate count and IDs cannot be reported here. Run the commented candidate query before applying the migration and archive its output. Rollback of an individual repair requires the archived report and an explicit administrator update restoring its four zero values; never infer a rollback for an unreported row.

## Manual browser and Supabase verification

1. Create an Estimate, then query all actual/completion columns in Supabase; each must be NULL.
2. Edit title/notes, save, refresh, and repeat the query; no actual column may change.
3. Inspect Network: ordinary POST/PATCH bodies must omit actual fields, and refresh must issue no write.
4. Copy the browser recovery JSON out and back through the supported recovery flow; verify null remains null and no warning is produced.
5. Promote the clean Estimate to Waiting for Customer/Quote and confirm the controlled RPC succeeds.
6. Through Complete Print on an accepted printing job, explicitly enter zero where permitted; confirm Supabase stores numeric zero.
7. Attempt a pre-acceptance command against a test row containing explicit-zero evidence; confirm the authoritative rejection and unchanged local status.
8. Run and archive the migration's candidate report. Confirm every eligible row meets every predicate, then apply the migration.
9. Confirm the known affected ID is repaired only if eligible, and then promote it. Confirm advanced or ambiguous rows remain unchanged.
10. Smoke-test Orders Admin, Quote, Inventory Control, Finance Pro, Hub, Campaign Manager, Track, and Pay; no pricing, accounting, numbering, URL, or visual behavior should differ.
