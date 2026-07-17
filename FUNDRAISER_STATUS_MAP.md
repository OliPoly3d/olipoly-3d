# Fundraiser Status Map

## Fundraiser lifecycle

| Status | Meaning | Entry guard | Exit / effects |
|---|---|---|---|
| `draft` | Private setup | Owner created record | May schedule/cancel; no public catalog |
| `scheduled` | Validated, future opening | Dates/catalog/terms valid | Open at boundary by reviewed command; owner may return to draft before orders |
| `open` | Public submissions accepted | Current time within window | Close ordering/cancel; new Orders allowed only through submission contract |
| `ordering_closed` | No new submissions | End boundary or owner close | Production aggregation may be frozen/reviewed |
| `in_production` | Included demand linked to active Production | Ordering closed and production links validated | Settlement review after dispositions |
| `settlement_review` | Production/financial exceptions reviewed | Ordering closed; settlement draft exists | Settle only after reconciliation |
| `settled` | Posted settlement referenced | Approved snapshot + Finance evidence | Close after fulfillment/other guards |
| `closed` | Read-only business closeout | All closeout guards | Audited reopen only under future policy |
| `canceled` | Fundraiser stopped | Owner reason required | Terminal; linked authorities handled individually |

Status does not derive solely from dates because owner review is required. Public ordering requires both `status = open` and an inclusive/exclusive server time rule: `starts_at <= now < ends_at`.

## Cross-module mapping

| Fundraiser concept | Canonical source | Display mapping |
|---|---|---|
| Customer status | Orders/Finance/fulfillment | Derived label only; no fundraiser status field |
| Programmed Y/N | Production evidence | Yes only when all included required work has programming readiness evidence |
| Printed Y/N | Production attempts/status | Yes only when all required units are print-complete and none requires reprint |
| Completed Y/N | Canonical Order/Production status | Yes at `ready_for_fulfillment` or `closed` after QC/finishing |
| Paid/confirmed | Organizer confirmation | Organizer assertion only |
| Reconciled | Finance Pro | Sum of posted linked Finance records |
| Inventory ready | Inventory ledger + Production | Read projection; Fundraiser cannot mutate it |

Canonical accepted Order/Production flow remains:

`ready_to_print → printing → qc → ready_for_fulfillment → closed`

Needs Reprint returns `qc → ready_to_print`, preserving actual usage. Fundraiser `Completed` must then return to No/incomplete until the required reprint passes QC.

## Rollup states

Dashboards should prefer counts over ambiguous booleans: `not_started`, `partial`, `complete`, `blocked`, `not_required`. The Niles Y/N export maps only `complete` to `Y`; all others map to `N` and include an exception/reason column.

## Forbidden transitions

- Public clients cannot set fundraiser, Order, production, payment, or settlement status.
- Marking Programmed/Printed/Completed cannot move an Order or job.
- Settlement cannot close an Order or consume Inventory.
- Closing/canceling a fundraiser cannot bulk-rewrite canonical module state without explicit per-record owner actions.
