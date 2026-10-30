# Money everyday workflow

The signed-in page has three views. Today shows current recorded spending and watched balances even if a future month is selected elsewhere. This month holds the monthly summary, targets, timing, bills, income and activity. Plan ahead holds affordability, scenarios, debt, year summaries and maintenance editors. Existing detailed-section links route to the relevant view.

## Everyday safeguards

- The everyday remainder offsets category overages against unused allowances. YOY and one-time earmarks stay separate. Neither remainder is a promise of free cash: future spending and account timing still matter.
- Move budget changes two everyday category targets by equal and opposite amounts. It does not create an actual or bank transfer. It protects recorded purchases (including future-dated actuals), unmatched known category expenses, ownership, funding and closed months. An explicit month range applies the same move to each included month. Other timing patterns can change daily cash lows even when combined targets stay constant.
- Transaction entry previews use the same form parser as Record. Purchases affect categories and the charged account. Card payments affect the two accounts and add no category spending. Split corrections and refunds show net category effects.
- Save receipts describe the entire saved revision, including any existing preview. Undo last save restores that entire preceding plan as a new revision. It requires the same owner/session and exact revision, and no open entry or unsaved preview. Refresh, sign-out, another save, or a concurrency conflict invalidates it. Opening resets, dated-principal resets and month closure/recovery changes use their existing correction workflows instead.
- Weekly review is a four-step check of entries, watched balances, targets and near-term cash. Following an editor link does not mark an account verified. Leaving an obligation unresolved requires acknowledgement and saves a review with followups; it never pays a transaction or verifies a balance automatically.
- Watched-account and savings-purpose choices store IDs only in owner-scoped browser preferences. Financial plan data stays in the existing authenticated store. Debt privacy covers new account values and debt entry/receipt details. Sign out is under More actions.
- Saved review and budget-move history are bounded metadata inside the existing plan body. There is no database migration or seeded financial-data update.

## Validation

Run the Money suite with the installed JSDOM and PGlite dependencies:

```sh
MONEY_JSDOM_MODULE=/absolute/path/to/jsdom/lib/api.js \
MONEY_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js \
node --test tests/money-*.test.mjs
```

Browser checks use isolated synthetic data and stubbed persistence, with no production login or database writes. Check a desktop viewport and a 390-pixel iframe viewport:

1. Open Today; confirm category offsets and the combined everyday remainder, separate earmarks, watched balances and real savings-purpose balance.
2. Record a purchase on a card. Confirm debt and category change, checking unchanged; Undo should restore the whole save in a new revision. Cancel a second entry without posting.
3. Enter a checking-to-card payment. Confirm two account effects and zero category spending. Toggle debt privacy and inspect the receipt and watchlist.
4. Move part of an unused everyday allowance. Confirm a preview, unchanged combined target, protected known costs and explicit scope. Reset; the move result must clear. Save a different move; inspect its receipt.
5. Complete weekly review with unresolved entries and balances. Confirm acknowledgements are required and the saved receipt still reports followups. Open Check balance and use the existing posted/pending reconciliation workflow.
6. Switch to This month and Plan ahead. Use targets/timing, existing section links, year lows, detailed forecasts and scenario editors. Return to Today after selecting a future month; today's totals must remain current.
7. On mobile, confirm no document-level horizontal overflow, accessible quick actions, readable category chart and budget form, and headings below sticky navigation/status. Existing wide tables retain their own horizontal scrollers.
8. Verify failed saves and stale revisions retain the entry/preview. Refresh and sign out must clear Undo and financial DOM.

Transaction-file imports and automated sensitivity ranking remain outside this release.

## Cash chart and mobile layout

Before next paycheck ends on the day before the next recurring deposit. If payday is tomorrow, that window contains today alone: the chart shows visible, centered balance points and one date, with an exact closing-value label. Select Next 14 days or Next 30 days for a longer outlook. Daily amounts provides exact values; assumptions/review notes remain expandable and provisional estimates stay identified. Changing the display window never edits the plan, verification status or cash-floor rule.

Phones keep Purchase, Card payment, Income and More actions at the bottom, with space for device safe areas. Saved status scrolls away; unsaved changes or an available Undo keep the status/save bar visible. Account summaries and activity use labeled cards below 700 pixels; activity filters start collapsed. Tablet and desktop tables retain their established format. Touch targets and full-width transaction account selectors support phone/tablet entry. Browser viewport QA is not a substitute for checking actual iPhone/iPad Safari, the on-screen keyboard and home-screen installation on the user's device.

## Refined Today and entry flow

Today emphasizes the combined everyday spending allowance, cash headroom after the entered floor/buffers, and the selected actual savings purpose. These remain distinct amounts; an incomplete cash estimate stays marked Needs review. Category tiles show actual net spending against the existing target, with consistent category colors. YOY/event earmarks and the full offset chart remain accessible separately.

Coming up combines the next 14 days of expected income, bills and transfers with future-dated or pending-today actuals. Managed credit payment amounts use the shared planning snapshot from recorded balances; unrecorded overdue payments are not assumed paid. Record opens the existing editable transaction form. Zero or unknown amounts cannot be recorded by a quick action. Matched actuals replace their expectation once.

The expandable Needs review area consolidates unresolved entries and balance/input checks. A possible cash-floor shortfall remains a separate visible warning. Detailed reconciliation stays under Plan ahead, with direct links from the home checklist and watched-account buttons.

The cash chart labels major real scheduled/recorded events, annotates its lowest daily balance, shades the portion of a segment below the floor, and supports tapping, keyboard arrow keys or the Inspect a day field. The date inspector distinguishes category planning reserves and interest estimates from recordable expectations; reserves cannot be recorded as purchases. Selecting a chart date never edits financial data.

Entry starts with the amount. Account/category choice buttons update the original form fields and preserve their full dropdown alternatives. Date, status, split/refund allocation, savings, funding and notes remain editable. Record and Cancel stay outside the scrolling entry surface and use native form association. At widths of 900 pixels or more, a read-only recent-account-activity pane sits beside the editor; narrower screens use the full entry width. Closing and sign-out clear the appropriate financial display state.

### Appearance polish (October 2026)

More actions → Appearance offers Graphite (default), Light, or Use device setting.
The choice is local to the browser and does not edit the financial plan. Inter is
self-hosted with its SIL Open Font License; no font service receives page requests.
Category tiles, entry choices and budget comparisons share one category palette.
Balances and editors retain cents; chart axes use rounded dollars. Forecast lines
are dashed and labeled projected; past recorded cash uses a solid closing line.
Existing collapsed section previews retain their financial summaries.

Validation: full 143-test Money suite passed; appearance preference tests cover
restoration, device changes and blocked browser storage. Final UI regression checks
cover charts and entry after the display changes. Chromium preview used synthetic
data at 320/390px phone and 820/1024px iPad widths, checking light/dark switching,
no horizontal page overflow, Cancel, and visible fixed editor actions. Physical
iOS Safari / its on-screen keyboard still require device testing.
