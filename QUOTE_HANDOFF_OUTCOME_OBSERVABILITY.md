# Production Quote handoff outcome observability

## Exact abort-source audit

The authoritative page has one AbortController in the Quote handoff path. It is
created by `syncPreAcceptanceProductionStatus`; its timer is 30,000 ms and calls
that controller's `abort()` without a reason. The signal is passed directly to
the single `sbApi` fetch. No `AbortSignal.any`, combined signal, second
controller, visibility handler, rerender hook, form submit, modal close, auth
refresh, reliability observer, or navigation handler aborts this request.

`js/erp-reliability.js` wraps fetch once to classify health. It returns the same
response or rethrows the same rejection and never constructs an AbortError.
`sbApi` likewise did not convert PostgREST errors to AbortError: it parsed a
completed HTTP response and threw an ordinary Error. Before this change,
however, the 30-second timer remained armed while `response.text()` consumed the
body. If it fired after headers but before body completion, body parsing could
reject with the controller's generic DOMException and obscure that response.

Therefore the checked-in generic `AbortError: signal is aborted without reason`
had one source: the Quote handoff controller timer. Repository evidence alone
cannot determine whether a particular prior live occurrence happened before
response headers or while reading a response body; that distinction requires
the captured Network timing/response. The new path removes the ambiguity.

## Outcome-preserving request lifecycle

1. Authentication/session refresh completes before the lifecycle transport
   timer starts; it cannot replay or consume the handoff request timeout.
2. The timer begins immediately before controlled `sbApi`, which skips the
   already-completed auth preflight and strips control-only options before fetch.
3. As soon as native fetch resolves with HTTP response headers,
   `onResponseReceived` clears the timer **before** `response.text()` runs.
4. `sbApi` parses JSON and retains `status`, `code`, `message`, `details`, `hint`,
   request URL, and stage on a structured server Error.
5. Structured server errors pass through unchanged.
6. A rejection without an HTTP response is classified once as:
   `QUOTE_HANDOFF_CLIENT_TIMEOUT`, `QUOTE_HANDOFF_EXPLICIT_ABORT`, or
   `NETWORK_ERROR`.
7. `finally` clears any timer still armed. No outcome schedules a retry.
8. Confirmed success advances only from the parsed authoritative row.

The 30-second client guard remains a last-resort transport bound. The server job
try-lock is nonblocking, while unrelated lock waits are bounded by the RPC's
transaction-local two-second `lock_timeout`, so controlled PostgreSQL errors
should arrive before the client guard.

## Structured console diagnostic

One failed operator command logs one object with only:

- stage;
- job ID;
- correlation ID;
- HTTP status;
- PostgreSQL code;
- server message/details/hint;
- error name;
- elapsed milliseconds;
- RPC URL.

It does not log tokens, Authorization headers, cookies, session data, or the
handoff payload. Visible messages are fixed by outcome and do not expose raw SQL
details.

## Live verification

1. Apply migrations through `202607280007_job_scoped_preacceptance_lock.sql`.
2. Deploy the frontend containing
   `js/production-quote-handoff.js?v=20260728-outcome-v4`.
3. Close old Production tabs and hard-refresh with cache bypass.
4. Clear Console and Network.
5. Click **Push to Quote** once.
6. Confirm exactly one `preacceptance_production_command` Network request.
7. Capture its HTTP status and Response JSON.
8. Confirm the single console diagnostic has matching `httpStatus`,
   `postgresCode`, `message`, `details`, and `hint`.
9. Confirm a controlled server error does not appear as `AbortError`.
10. Confirm no second request or automatic retry occurs.
11. Confirm Production remains unchanged after failure and recovery remains
    data-only.
12. For a forced transport timeout, confirm
    `transportCode = QUOTE_HANDOFF_CLIENT_TIMEOUT` and the timeout-specific UI.
13. For an offline request, confirm `transportCode = NETWORK_ERROR`.
14. On success, confirm the response contains the authoritative Production row,
    the local card advances only from that row, and Quote navigation follows.

The live issue is not reported resolved until this procedure captures either the
exact controlled server outcome or a confirmed successful authoritative row.
