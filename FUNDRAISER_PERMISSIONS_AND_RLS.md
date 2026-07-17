# Fundraiser Permissions and RLS

## Phase-one roles

| Capability | Anonymous public | Authenticated owner | Future organizer |
|---|---:|---:|---:|
| Read published catalog | Sanitized projection only | Yes | Not implemented |
| Submit order | Narrow RPC only | Optional owner-assisted path through same service | Not implemented |
| Read own submitted details | Minimum one-time confirmation/token contract, if approved | Yes | Not implemented |
| Manage fundraiser/catalog | No | Own rows only | Not implemented |
| View customers/personalization/reports | No | Own rows only | Not implemented |
| Confirm organizer collection | No | Yes, audited | Not implemented |
| Approve/post settlement | No | Yes, subject to Finance contract | Not implemented |

“Owner” initially means `auth.uid() = owner_id`, consistent with owner-scoped Recipe and Asset records. A staff/organization role model must not be guessed into phase one.

## RLS design

- Enable RLS on every proposed table.
- Authenticated policies require both direct row ownership and ownership of every referenced parent. An attacker cannot link their row to another owner's fundraiser, Order, Recipe, Asset, or Finance record.
- Anonymous roles receive no direct table grants for fundraiser Orders, lines, personalizations, confirmations, or settlements.
- Public catalog access uses a minimal view or security-definer read RPC returning allowlisted fields only for publishable statuses and windows.
- Public submission uses one `SECURITY DEFINER` function owned by a non-login role, with fixed `search_path`, fully qualified objects, explicit grants, input/size limits, server-derived terms, and transaction-level idempotency. It returns only a safe receipt.
- Service role is never shipped to browsers. Authenticated browser code uses the anon key plus user JWT.
- Asset access remains owner-only and signed/private. A public item image requires a separately reviewed public derivative contract; never expose `job-assets` paths.

## Sensitive field policy

Private fields include organizer contacts, customer identity, personalization, production/internal notes, submission keys, payment evidence, Finance IDs, settlement details, audit actors, and asset paths. Public catalog allowlist is limited to public slug/event presentation, safe organization display, order window, item display fields, price/personalization prompt, and allowed fulfillment/payment choices.

All output encodes untrusted text. Logs redact contact and personalization. CSV export mitigates spreadsheet formula injection for values beginning with `=`, `+`, `-`, or `@`.

## Command authorization

Status transitions, term changes after launch, inclusion changes, payment confirmation, Finance allocation, settlement approval/post/void, and reopen actions use owner-authenticated commands that re-check current state and ownership. Direct broad `UPDATE` policies should be avoided where transition guards or immutable fields are required.

## Future organizer portal (documentation only)

A future portal would require invitation/membership tables, scoped claims or membership checks, MFA/session policy, per-fundraiser permissions, revocation, audit events, and field-level response design. It must not reuse public submission tokens as organizer credentials. No organizer policy, login, or write path is part of this specification.

## Verification requirements

Test as anonymous, Owner A, Owner B, expired session, and service/backend role. Attempt horizontal ID substitution on every FK/RPC, enumeration by slug/id, closed-window submission, replay, oversized input, malicious HTML/CSV, direct table access, and private asset access. Inspect grants and function ownership in staging before deployment.
