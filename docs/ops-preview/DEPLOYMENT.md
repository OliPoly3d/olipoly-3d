# Private test workspace publication

Published November 4, 2026 with Rob's authorization.

- URL: https://olipoly-ops-test.siwicki05.chatgpt.site
- Site project: `appgprj_6aeb3558bd9081919ef7993f1c3a6924`
- Saved version: `appgprj_6aeb3558bd9081919ef7993f1c3a6924~appgver_772d09b56c088191acadc546d9043b65`
- Deployment: `appgdep_6aeb3607fc3c8191b9f5cecf7d607f3d`
- Deployment status: **succeeded**
- Site source commit: `919e0cb598030cdf1bc442c4ebd010bed8761bfa`
- Source snapshot: OliPoly3d/olipoly-3d draft PR #298 at `8734e7920646a098e2e1790573b96c6654281615`.
- Audience: owner-private; no external visitors.

The standalone static Site packages only the three preview entry pages and their browser JS/CSS dependencies. Its root redirects to `ops-preview.html?database=test`. It does not deploy the customer website, production login configuration, SQL migrations, business records or private keys. The browser publishable key is public configuration. The production GitHub PR remains draft and unmerged.

The database connection accepts only `llscjdyiiatmuqhilube` (OliPoly ERP Test). Applied migrations and advisor findings are recorded in [APPLIED.md](APPLIED.md).

## Verification

- Static JS syntax checks passed before packaging.
- All packaged HTML asset/link paths resolve to included files.
- Native publication returned succeeded with the URL above.
- Browser navigation to the deployed root showed the expected **Continue with ChatGPT** private access gate. No authenticated hosted UI walkthrough is claimed.
- Supabase public Auth settings returned HTTP 200: email login enabled, signup enabled, email confirmation required. No signup email was sent and no password or Auth user was created by the agent.
- Existing schema/REST checks and the 31-check local workflow rehearsal remain documented separately.

## Rob's login setup

1. Open the URL on the iPad in Safari.
2. If prompted, choose **Continue with ChatGPT** using the ChatGPT account that owns this Site.
3. On the OliPoly test sign-in screen, choose **Create test account** with your chosen email and a new password of at least 12 characters. Enter the password yourself; do not send it in chat. This test account is separate from the production OliPoly login.
4. Confirm the email, then return to the original test URL and sign in. The UI does not consume a confirmation callback session automatically.
5. Use the same test credentials on the PC and iPad to share the fictional workspace.

The confirmation redirect destination has not been verified or changed through Supabase Management settings; return to the original test URL after confirming. If the email confirmation step fails, inspect the actual response before sending another signup request. Do not bypass confirmation or fabricate an Auth user.

The signed-in connected journey, cross-device conflicts/reload and actual iPad Safari print/share remain pending Rob's account setup. Use fictional data only. Current Finance reconciliation and tax-sourcing limits are unchanged.

## Request-to-order update — November 4, 2026

The same owner-private Site was updated successfully to expose New request, Quote builder, Customer quote and the complete All work stage queue. No database migrations or existing-record resets were performed.

- Site source commit: `d2699ac0e017529e2d7f420d471beb29c7cb7591`
- Saved version: `appgprj_6aeb3558bd9081919ef7993f1c3a6924~appgver_83683f695ea48191b8ed268334d6d28f`
- Deployment: `appgdep_6aeb40ddc1488191b1675ffea810c8e9`
- Native publication status: **succeeded** at the unchanged URL above.
- Validation: 36 focused checks passed, plus local browser intake → draft quote → customer preview → Mark quote sent → Awaiting approval queue walkthrough. 390px/820px responsive frames showed no document-width overflow.

Use **New request** on All work to try the beginning of the process. See [REQUEST_TO_ORDER.md](REQUEST_TO_ORDER.md) for the updated walkthrough. Browser print-to-PDF and the full signed-in hosted journey remain device checks. The screenshot in that guide's change set uses local fictional data and does not represent additional records inserted into Rob's test account.


## Shared production queue and permanent OP numbering — November 4, 2026

Published with Rob's explicit approval at the unchanged owner-private URL: https://olipoly-ops-test.siwicki05.chatgpt.site

- Source: `5d94d471502fa131649c4415a4b2c14858f2a828`.
- Saved version: `appgprj_6aeb3558bd9081919ef7993f1c3a6924~appgver_0d9bc761b58081918b8c910a6206b22c` (version 3).
- Deployment: `appgdep_6aebd4080c58819183c172b7023a69a0`; native status **succeeded**.
- Access was verified owner-only, with no external visitors; unchanged by publication.
- Packaged model/controller matched the reviewed source. JS syntax and diff checks passed. Prior local browser QA confirmed approved work in the shared queue and separate release control; hosted signed-in/iPad verification remains pending.
- Only preview model/controller changed in the private Site. The live ERP, public customer website and personal Money were not changed.
- Approved test migration application, record-preservation digests and access checks are recorded in APPLIED.md.

Retest by refreshing All work, looking up an existing legacy reference under Everything, then saving a fictional New request and following the same OP reference through approval and release. Closed/fulfilled projects intentionally leave the active production list. Do not share the internal Customer view preview with real customers.
