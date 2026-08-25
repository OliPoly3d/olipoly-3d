# Player Data Center hardening audit

Date: 2026-08-25
Basis: `d46fa43` / Player Data Center implementation `533798e` (the supplied `e086c75` object is not present in this checkout). No remote or default-branch ref is configured; `d46fa43` is the newest merged commit available locally.

## Inspection and smallest safe scope

The merged implementation does provide the reported global route, ten-source manifest, source-directed browser uploads, semantic CSV headers, PDF.js text extraction, inert DOM/JSON HTML adapters, canonical reconciliation, field provenance, local snapshot composition, IndexedDB v8 additive stores, atomic snapshot/pointer activation, rollback, optional draft-session pinning, league status consumers, direct official links, and generated Vite artifacts. Existing authenticated Supabase player/ranking reads remain legacy fallbacks; global composite snapshots remain device-local. No secure attributed live-news backend exists.

Important gaps found rather than assumed from the earlier summary:

- Fixtures were tiny inline strings and did not reproduce the observed row volumes or source shapes.
- Preview omitted duplicate/skipped/malformed counts and had no privacy-safe diagnostic export.
- The disabled NFL card said only “awaiting sample,” not the required state text.
- News freshness lacked `RECENT`; disabled status and state explanations were incomplete.
- Missing values sometimes used an em dash.
- The exact historic “upstream request timeout” cannot be reconstructed. Repository upload code uses `File.text()` or PDF.js on a selected local `File`; official links are direct `target=_blank` publisher URLs. No Player Data Center proxy, fetch, serverless request, blind retry, or application timeout string exists. Existing Supabase requests occur elsewhere during authenticated league loading, not local source parsing.

This hardening change is intentionally limited to faithful sanitized fixtures, parser diagnostics, freshness/disabled-state corrections, clearer local-file and timeout diagnostics, and privacy-conscious validation reports. It does not change leagues, scoring, players, keepers, ownership, draft chronology, recommendations, philosophies, cloud contracts, schema, or production data.

## Timeout reproduction evidence to capture

If the message returns, open DevTools Network before reproducing, select the failed request, and capture Request URL, method, status, Initiator stack, and the corresponding Console error. A publisher URL indicates an external-page failure; a Supabase hostname indicates an existing cloud read; the deployment hostname indicates a static asset. Confirm whether the event was clicking **Official Source** or selecting a local file. Do not include uploaded file contents.

## Fixture and manual-validation boundary

Sanitized fixtures reproduce the documented PPR (517), Half-PPR (882), IDP (192), ADP, dynamic bye-section, ESPN extracted-text, and Draft Sharks inert-HTML shapes. They contain no original copyrighted source content. ESPN injury and Mike Clay structures are exercised with sanitized test strings because binary originals are unavailable. **Original user files were not available to this Codex session.** Final validation must use the nine real files through the in-app checklist and export a privacy-safe report for any failure.
