# All inventory controls and migration review

Prepared for owner review. The schema migration has not been applied, and this build has not been published.

## Scope and behavior

All inventory provides filament groups by material/color, physical roll identities, brand and location search, on-hand/reserved/available grams, per-color warning exclusions, roll creation and detail corrections, manual net counts and gross-minus-tare weigh-ins, and reusable spool management. It includes editable choices for PLA Basic, PLA Matte, PLA Silk, custom materials, brands, colors and measurement units.

Supplies support quantity/unit tracking, purchase cost per unit, supplier/reorder links, opening stock, receiving, consumption, counted corrections and warning exclusion. All work displays filament and supply warnings. A count of empty spools is recorded independently of the filament currently on spools and unopened refills. A missing physical count is displayed as needing a count, rather than inferred as zero.

Every inventory command requires a reason and saves shared audit history with before/after values. Quantities and supply units cannot be silently changed by editing descriptive details. A supply's unit can change only at zero stock. A roll's quantity cannot fall below reservations. Material/color renaming is blocked while open work references that material. Existing identities, original quotes and accepted prices are retained.

New stock on its own spool brings its physical spool with it. Mounting an unmounted refill removes one recorded empty spool. Freeing a reusable spool requires physical removal/transfer of its remaining filament and adds one empty spool. Filament remains tracked as an unmounted refill. A second mount or unmount is rejected. Production does not automatically free empty spools.

Production reservations distribute across individual rolls of the same material/color, preferring mounted rolls. Actual usage can specify the physical rolls and grams used. If left blank, it draws from mounted rolls, preferring the job's own reservations, then older rolls. Explicit allocations must match the material total, belong to the owner, and match the material/color. If stock on mounted spools is insufficient, the inspection save is rejected atomically and asks the owner to mount sufficient filament. Per-roll canonical consumption records retain actual cost. The job's material usage stores the weighted cost of the physical rolls consumed. Availability and quote cost previews use aggregated stock. Labels and IDs are visible to the owner so the physical roll labels should match the records before consumption is recorded.

Stock counts and costs update inventory valuation and job estimates. They do not generate a sale or automatically post another purchase expense to Finance.

## Exact migration and target

- File `supabase/ops-preview/migrations/20261107041010_ops_test_inventory_management.sql`.
- Target **OliPoly ERP Test**, project `llscjdyiiatmuqhilube`.
- No schema application is authorized by the general build request. Apply only after approval of this migration and target.

The migration changes the `ops_preview_rolls` primary key from `(user_id, material_key)` to `(user_id, raw_material_id)`, retains every existing mapping, and adds mappings for existing identifiable rolls belonging to initialized test workspaces. It adds `tare_grams`, `last_gross_grams` and `last_weighed_at` to `raw_material_inventory`. It creates owner-readable `ops_preview_inventory_events`; authenticated owners cannot modify or delete that audit table directly.

New authenticated RPCs are `ops_preview_inventory_load` and `ops_preview_inventory_commit`. Internal helpers perform numeric validation and aggregated stock queries. Existing `ops_preview_load`, `ops_preview_commit`, `reserve_remaining` and `ensure_actual_reservation` are updated for multiple rolls. The accepted-scope, numbering, payment, tax, fulfillment and Finance commands retain their existing behavior.

Mutations write only the authenticated owner's existing raw material, supply, spool pool, settings, workspace revision and command receipt records. Quantity changes also write the existing `inventory_transactions` ledger with `raw_adjustment`, its existing permitted category, and explicit inventory kind/unit metadata. Production continues using its canonical reservation/consumption functions. No constraint is relaxed to accommodate a new transaction type.

The single transaction includes stock, spool counts, audit event, movement entry, workspace revision and command receipt. Repeating an uncertain command uses the same identity and returns its completed state. Stale device writes are rejected. Anonymous access to the new RPCs is revoked. Cloud mode remains restricted to the existing test project.

## Risks, preservation and recovery

1. Before application, record counts, material identities, stock, reservations, spool counts, workspace revisions, accepted commercial snapshots and Finance totals in ERP Test. Verify they match after application. Read the applied migration list before applying.
2. Migration backfills only roll mappings for initialized test accounts. It does not import production inventory, replace counts or reconcile Rob's actual stock. Existing tare values start unknown.
3. Existing legacy adjustment history that was stored only in browser storage still requires a source-device export before live migration. This update cannot reconstruct that missing server history. Historical cloud ledger records remain intact.
4. The completed OP-0000002 walkthrough remains an acceptance case. Include a fresh mixed-item order with stock spanning multiple physical rolls and a reprint. Verify its price, tax, payment and canonical production records remain consistent.
5. An old preview build assumes one mapping per material. After new multi-roll stock is entered, rolling the frontend back requires restoring the matching database state or leaving inventory controls read-only. Do not restore the old primary key over multi-roll records. Keep the pre-change database export/backup and prior Site version before release. Preserve all new events and commands before any recovery. Roll forward with a corrected migration when feasible.
6. Physical spool counts, tare estimates and gram readings need validation with Rob's actual scale. Spool counts and mounting are manual. No scale integration or provider purchase action is introduced.
7. Legacy ERP and public website remain the operational fallback through the formal migration gate. Full legacy import/export, historical ledger recovery, additional reorder policy controls and finished-goods decisions stay on the preservation register.

## Checks and iPad rehearsal

Run the ERP Preview suite with `OPS_PGLITE_MODULE` pointing to installed `@electric-sql/pglite@0.5.15/dist/index.js` and `OPS_JSDOM_MODULE` pointing to installed `jsdom/lib/api.js`, then `node --test --test-concurrency=1 tests/ops-preview*.test.*`. Neither dependency is shipped to the browser.

1. Open ERP Test, then All inventory. Verify OP-0000002 remains accessible from All work.
2. Give three fictional PETG Black rolls distinct labels: one spool with 400 g and two 1 kg unmounted refills. Confirm 2,400 g total, 400 g on a spool and 2,000 g unmounted.
3. Record a physical test pool count of two empty spools. Mount one refill, then reload on another device. Check one empty spool remains and two rolls are on spools. Free one unreserved reusable spool only after confirming the physical transfer/removal. Check the pool increases once.
4. Weigh a mounted spool at 650 g gross / 200 g tare. Check the displayed calculation is 450 g and the saved net amount and audit before/after values agree. Use fictitious values only for this test.
5. Add a non-filament item using `sq.ft.`, receive stock, record usage and set a counted correction. Edit its low-stock level or exclusion and verify All work.
6. Edit dropdown choices, return to a roll form, type a custom brand/color, save and reload. Verify history remains readable.
7. Reserve an order across multiple rolls. Attempt a correction below reserved grams and confirm rejection. Finish a run using mounted stock from multiple rolls. Verify cost and actual usage are recorded once, then reprint and finish the existing fulfillment/payment/receipt path.
8. On iPad inspect the table scroll, form keyboard, navigation and retained checkbox settings. Reopen the same account on another device and confirm shared quantities/history. A local Chrome fixture walkthrough verified the overview, navigation to weigh-in and the visible 650 g gross minus 200 g tare calculation of 450 g. No authenticated hosted iPad check is claimed by the local DOM or fixture tests.

## Read-only preservation baseline

Captured from ERP Test before applying this migration. Re-run `supabase/ops-preview/verification/inventory_management_preservation.sql` immediately before application, then compare after application before making new test entries.

| Table | Rows | Record fingerprint |
| --- | ---: | --- |
| accepted_snapshots | 2 | 9ad4ef9492592692ad822a6fa9187220 |
| customers | 0 | d41d8cd98f00b204e9800998ecf8427e |
| document_counters | 1 | 062dcf2d0c73464b77b3c37930fe6305 |
| financial_entries | 2 | 5d9f530d43ee91c5d07b2c5435d39731 |
| inventory_spool_pool | 0 | d41d8cd98f00b204e9800998ecf8427e |
| inventory_transactions | 8 | c243f237c0a7cf098162d476cd3acddb |
| non_filament_materials | 0 | d41d8cd98f00b204e9800998ecf8427e |
| ops_preview_workspaces | 1 | ae90b597af3c0aab0c0b57c7e816ccef |
| orders | 2 | a534e224c4b855966e5b6e06c2ec5371 |
| production_jobs | 2 | 48a32758cd434f82848913edbdb6c84a |
| production_material_reservations | 12 | 56c984779850280a9580ea641232a909 |
| quotes | 2 | 84fda6a9aa3f576bb2167f63434f44f3 |
| raw_material_inventory | 3 | e0b8837131c5998c69962f9b24ef3a4b |
