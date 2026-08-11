# P1 Auth and Status Runtime Simplification

## 1. Auth implementation inventory

| File / function | Pages | Role and current behavior | Duplicate / legacy | Candidate / risk |
|---|---|---|---|---|
| `olipoly-auth.js` / `OliPolyAuth` | All private ERP pages, Finance, Campaign and Product Recipes | Reads, verifies, refreshes and clears the shared session; publishes auth state; clears operational cache on logout or confirmed user change | Canonical | **Chosen canonical owner**; auth loss is command-authority loss |
| former `js/olipoly-auth.js` | Customer 360, Campaign Manager, Fundraiser, shell fallback | Older independent copy of the bridge | Removed; all consumers now use root module | High drift risk eliminated |
| former Production inline bridge | Production Control | Local read/write/refresh/get-user implementation | Removed | High risk: could shadow the stronger canonical bridge |
| `js/engine-shell.js` / `mountAuthentication` | Private `op-engine` pages | Shared account UI and private-page gate; consumes `OliPolyAuth` | UI consumer, justified | It does not own session storage or refresh |
| Orders `getCurrentUser`, `login`, `logout` | Orders Admin | Page commands and legacy form buttons consume canonical auth | Thin wrappers retained | Medium; legacy form UI remains, but no independent listener/client |
| Production `signIn`, `signOut` | Production Control | Existing page controls consume canonical storage/API | Thin UI integration retained | Medium; no longer owns boot/session implementation |
| Inventory `getUser` / REST retry | Inventory Control | Consumes canonical ensure/getUser/refresh | Defensive fallback retained | Low; fallback is only for bridge load failure |
| Quote `currentUser` / `ensureAuthReady` | Quote | Consumes canonical user/session | Duplicate functions exist in legacy quote bundle sections | Medium; deferred because moving quote application code is out of scope |
| Finance `resolveCurrentUser`, Supabase listener | Finance Pro | Adopts and mirrors canonical session into the Supabase SDK; SDK listener is needed for token refresh | Intentional adapter listener | Medium; Finance SDK compatibility, not a second ERP session authority |
| Hub/Handbook/Knowledge pages | Shell | Shell loads canonical bridge and renders account state | No page-local auth | Low |

No login/session code was added to public response, payment, or tracking pages. Fundraiser remains public and loads the bridge only for its existing data-access behavior; it is not placed behind the private shell gate.

## 2. Canonical auth contract

`window.OliPolyAuth` is the sole ERP runtime session owner. Its small contract is:

- `getSession()` / `recover()` for verified initial hydration;
- `getCurrentSession()` and `getCurrentUser()` for synchronous consumption of the last canonical state;
- `getUser()` and `requireAuthenticatedUser()` for verified identity;
- `onAuthState(listener)` for UI and command consumers;
- `login()`, `signup()`, and `logout()` for lifecycle actions;
- `registerUserChangeHandler()` for page-specific non-storage cleanup;
- `hasCommandAuthority()` for a fail-closed command gate;
- `clearOperationalCaches()` on logout, missing/expired session, and confirmed user switch.

The module emits `olipoly-auth-changed` for existing integrations. Session expiry/refresh rejection clears session, user identity, operational cache, and command authority. It does not redirect. The shared shell renders signed-in/signed-out UI and preserves the existing private/reference access intent.

## 3. Duplicate auth paths removed

- Deleted the second full implementation at `js/olipoly-auth.js`.
- Removed Production Control's inline session implementation and duplicate second script include.
- Updated Customer 360, Campaign Manager, Fundraiser, and shell fallback to the canonical root bridge.
- Retained only page UI wrappers and Finance's SDK synchronization listener, with reasons above.

## 4. Page auth mapping

| Page | Module / boot / session | Login UI / logout | User change / failure | Page-local duplication |
|---|---|---|---|---|
| `hub.html` | Canonical bridge loaded by shell; `recover()` | Shared shell | Canonical cache clear; shell signed-out gate | None |
| `production-control.html` | Direct canonical bridge then page hydration | Shared shell plus existing form controls; canonical clear | Canonical event/cache behavior; commands already fail when user/authority absent | Inline bridge removed; UI wrappers remain |
| `orders-admin.html` | Direct canonical bridge; waits on `getSession()` | Shared shell plus existing form controls; canonical login/clear | Canonical cache clear and fail-closed current user checks | UI wrappers only; no Supabase auth listener |
| `quote.html` | Direct canonical bridge; `ensure()` / `getUser()` | Shared shell | Canonical failure state | Legacy duplicate `currentUser` wrappers deferred |
| `inventory-control.html` | Direct canonical bridge; `ensure()` | Shared shell | Canonical refresh/clear; existing REST retry | Defensive fetch fallback retained |
| `customer-360.html` | Direct canonical bridge; `ensure()` | Shared shell | Canonical gate/cache handling | None |
| `product-recipes.html` | Direct canonical bridge; verified `getUser()` | Shared shell | Throws signed-in requirement before data commands | Page identity variable is a consumer |
| `campaign-manager.html` | Direct canonical bridge; shared shell boot | Shared shell | Canonical state | None |
| `erp-handbook.html` | Shell loads canonical bridge | Shared shell | Existing private reference gate retained | None |
| `erp-knowledge.html` | File is not present | N/A | N/A | N/A |
| `erp-knowledge-library.html` | Shell loads canonical bridge | Shared shell | Existing private reference gate retained | None |
| file/document pages | Job asset UI runs inside owning private pages | Owning shared shell | Owning page auth | No separate document auth runtime found |
| `finance-pro.html` | Direct canonical bridge, adopted by Finance Supabase SDK | Existing Finance UI unchanged; logout clears canonical and SDK session | Canonical event refreshes Finance; SDK event mirrors refreshed session | SDK listener intentionally retained |

## 5. Status normalizer inventory

| File / function | Domain | Inputs / outputs | Display / command / write | Duplicate / risk |
|---|---|---|---|---|
| `js/erp-status.js` | Production | Modern status and accepted legacy aliases to canonical Production values | Display/normalization only | Canonical |
| `js/erp-status.js` | Orders | `orders.status` aliases to canonical Order runtime values and labels | Display/normalization only | Canonical |
| `js/erp-status.js` | Quotes | `quote_status`, `customer_response`, and conversion identity to a separated state object | Display/normalization only | Canonical |
| `js/workflow-status.js` | Orders/workflow commands | Delegates order normalization/labels to canonical adapter; still builds server command requests | Commands remain here, not in adapter | Intentional boundary |
| Production `mapLegacyStatus` / `normalizeJob` | Production | Thin wrapper and record selector to canonical adapter | Hydration/display | Reduced; modern field wins |
| Orders `normalizeOrderStatusForDb` | Orders | Thin compatibility wrapper used by existing forms and command eligibility | Existing write/command behavior unchanged | Deferred naming cleanup; wrapper delegates shared normalizer |
| Quote follow-up filtering | Quotes | Uses separated canonical quote state | Display/filter only | Local raw normalizer removed |
| `track.html` public helpers | Orders/public | Canonical internal status followed by dedicated customer copy | Public display only | Intentional public adapter layer |
| Customer 360 / Hub pulse / recipe summaries | Cross-domain summaries | Small domain-specific summary classifications | Display only | Remaining duplication; deferred |

## 6. Production authority contract

`production_jobs.production_status` is the primary modern lifecycle authority. `productionStatusFromRecord()` consults `job_status`, `project_status`, and payload status only when `production_status` is absent. Accepted aliases normalize for runtime rendering only. The adapter never fetches, writes, saves, patches, or dispatches commands.

Canonical runtime values are `estimate`, `waiting_customer`, `ready_to_print`, `printing`, `qc`, `ready_for_fulfillment`, `closed`, and `canceled`. Existing server RPCs remain the only lifecycle mutation authority.

## 7. Order authority contract

`orders.status` is authoritative. The Order adapter normalizes QC, fulfillment-ready, spelling, and terminal aliases for a consistent list/header/lifecycle/badge vocabulary. It does not mutate the row or database. Existing command eligibility and RPC request construction remain in Orders/`workflow-status.js`.

## 8. Quote authority contract

Quote state remains intentionally multi-field. `quote_status` describes quote lifecycle, `customer_response` preserves acceptance/decline, and `converted_to_order` / `converted_order_number` preserve conversion identity. `quoteStateFromRecord()` returns these separately and derives display precedence without writing or inferring identity from browser cache.

## 9. Canonical adapters

`js/erp-status.js` is a small UMD module usable by browser pages and Node assertion tests. It contains immutable alias/label maps and pure functions only. Production, Orders, and Quotes consume it directly or through the compatibility wrapper in `workflow-status.js`; public tracking deliberately remains on that stable facade.

## 10. Legacy compatibility behavior

Legacy aliases remain readable. `cancelled` renders as `canceled`; `qc_finishing` as `qc`; pickup/shipment aliases as `ready_for_fulfillment`; old Production pre-acceptance aliases retain estimate/waiting display. Legacy values are not automatically rewritten. Modern authority always wins when present.

## 11. Tracking/public mapping

Track Order retains the existing `OliPolyWorkflow` compatibility facade as a dedicated public-display adapter, then applies its customer-language layer for headlines, helpers, progress, and next-step copy. This preserves `orders.status` authority without exposing avoidable ERP jargon or making the public page private.

## 12. Files changed

- Canonical auth runtime and shell/page references.
- New `js/erp-status.js`, integrations in Production, Orders, and Quote, plus the Track Order public-adapter decision.
- Focused runtime contract tests and this audit document.
- No SQL or schema files.

## 13. Behavior intentionally unchanged

No UI styling/layout, database schema, RPC contract, lifecycle transition, numbering, Finance posting, Inventory consumption, Quote conversion, Order closeout, or public access policy changed.

## 14. Tests

The focused tests cover canonical module loading, duplicate removal, auth loss, command authority, user-switch cache isolation, Finance integration, public access, Production authority precedence, aliases/terminal states, consistent Order labels, separated Quote acceptance/conversion, and adapter purity.

Manual browser checks remain required for session expiry, two-account switching, shared shell account copy, Finance sign-in/sign-out, Production/Orders lifecycle consistency, Quote accepted/converted refresh, and public Track Order language.

## 15. Remaining duplication

- Quote's large legacy application bundle contains two thin `currentUser` wrappers.
- Orders and Production retain page-local login controls for compatibility with their existing forms, but they call the canonical bridge.
- Finance retains one Supabase SDK auth listener to synchronize SDK refreshes with the canonical bridge.
- Customer 360, Hub pulse, and recipe summaries retain purpose-specific status grouping that does not own lifecycle mutation.

## 16. Deferred work

Removing legacy form-level auth UI or splitting the large Quote/Orders page applications would exceed this focused runtime initiative and increase regression risk. These can be retired in separate, browser-verified milestones after usage telemetry confirms the shared shell fully replaces them.
