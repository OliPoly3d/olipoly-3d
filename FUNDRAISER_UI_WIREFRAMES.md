# Fundraiser Manager UI Wireframes (Future; Non-Production)

These text wireframes define information architecture only. They do not redesign ERP 1.0, prescribe final styling, or authorize implementation. Future screens reuse existing navigation, typography, spacing, controls, responsive patterns, and deep links.

## Owner list

```text
┌ Fundraiser Manager ─────────────────────────────── [New fundraiser] ┐
│ Search [________] Status [All]  Date [____ to ____]                 │
│ Niles Primary HSA | Open | ends Jul 31 | 42 orders | $___ | [Open] │
│ Community Club    | Draft| not public  |  0 orders | $0   | [Open] │
└─────────────────────────────────────────────────────────────────────┘
```

## Setup / catalog

```text
┌ Niles Primary HSA                                      [Save draft] ┐
│ Tabs: Overview | Products | Orders | Production | Finance | Reports │
│ Organization [linked Customer/Org ▾]  Contact [private fields]      │
│ Event/date [ ]  Ordering start/end/timezone [ ]  Public slug [ ]   │
│ Status [Draft]  Collection [Organizer collects]  Notes [private]    │
│ Validation: ● dates  ● slug  ● catalog  ○ finance policy            │
├ Products ───────────────────────────────────────────── [Add recipe] ┤
│ ≡ Item  Recipe/revision  Personalize  Price  Surcharge  Payout      │
│   KEY   School Keychain  Yes          $10    $5         $6 / $8.50  │
└─────────────────────────────────────────────────────────────────────┘
```

Terms display explicit standard and personalized payout. Editing after orders warns that existing line snapshots will not change.

## Public page

```text
┌ Organization / event ── ordering closes <localized date> ┐
│ [public description; no private organizer data]           │
│ Product card: image/name | $10 | personalized $15         │
│ Quantity [- 1 +]  Personalized? [ ]  Text [________]       │
│ Customer/contact [fields required by approved Order API]   │
│ Payment: ( ) Cash to organizer ( ) Online to organizer     │
│ Fulfillment: ( ) Pickup ( ) Delivery                       │
│ Order summary $___                           [Submit once]  │
└─────────────────────────────────────────────────────────────┘
```

Lost-response retry retains the opaque submission key and changes the button to “Checking order…”; it never creates a local Order number.

## Orders tab

```text
│ Search [ ] Method [All] Confirmation [All] Fulfillment [All]       │
│ OP-000123  Customer  2 std / 1 pers  $35  Cash  Unconfirmed [Open] │
│ Exceptions: 2 missing confirmations | 1 fulfillment issue          │
```

“Open” deep-links to Orders Admin/Customer 360. Canonical status is read-only here.

## Production dashboard

```text
│ Group by [Design ▾]  Included [Yes]  [Export production CSV]       │
│ Design / Recipe rev | Std | Pers | Programmed | Printed | Complete │
│ Tiger / KEY r3      |  30 |  12  | 35/42 partial| 20/42 | 0/42    │
│   ▾ customer/unit rows with escaped personalization and job links   │
│ [Open Production Control]  Blockers: shortage 1, reprint 2          │
```

Legacy Y/N appears only in export or compact view; counts and partial/blocker states are primary.

## Finance / settlement dashboard

```text
│ Gross $___ | Personalization $___ | Organizer $___ | OliPoly $___ │
│ Finance posted $___ | Outstanding $___ | Variance $___             │
│ By Order: confirmation | Finance evidence | amount | exception     │
│ Settlement v1 [Draft] [Review snapshot] [Open Finance Pro]         │
│ After approval: [Post/reference Finance evidence]                   │
```

No “paid” badge conflates organizer confirmation with Finance posting.

## Reports tab

```text
│ Organizer summary [Preview] [CSV]                                  │
│ Production summary [Preview] [CSV]                                 │
│ Design totals | Personalization totals | Customer detail           │
│ Settlement report v1 [PDF/print] [CSV]                              │
│ Include personalization in organizer export? [ ] (sensitive)       │
```

## Responsive/accessibility notes

- On narrow screens, tabs become an existing-pattern selector and tables become labeled cards; totals retain labels and currency.
- All actions have text labels, visible focus, error summaries, field-level errors, and keyboard support.
- Status never relies on color alone. Dates show timezone. Destructive/cutoff/settlement actions require confirmation with consequences.
- Loading, empty, stale, conflict, authorization, and partial-data states are designed explicitly.
