const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('production-control.html','utf8');
const helper = fs.readFileSync('js/production-quote-handoff.js','utf8');
const doc = fs.readFileSync('QUOTE_HANDOFF_OUTCOME_OBSERVABILITY.md','utf8');
const diagnostic = html.slice(html.indexOf("console.error('Production Quote handoff failed.'"), html.indexOf('throw classified;', html.indexOf("console.error('Production Quote handoff failed.'")));

for(const field of ['stage','jobId','correlationId','httpStatus','postgresCode','message','details','hint','errorName','elapsedMs','requestUrl']){
  assert.match(diagnostic, new RegExp(`\\b${field}\\b`), `structured diagnostic contains ${field}`);
}
assert.doesNotMatch(diagnostic, /Authorization|access_token|refresh_token|cookie|headers|payload|body/, 'structured diagnostic excludes credentials and request payload');
for(const code of ['QUOTE_HANDOFF_CLIENT_TIMEOUT','QUOTE_HANDOFF_EXPLICIT_ABORT','NETWORK_ERROR']) assert.ok(helper.includes(code), `${code} is an explicit transport outcome`);
assert.match(html, /onResponseReceived:\(\) => \{ if\(timeout\)\{ clearTimeout\(timeout\); timeout = null; \} \}/, 'HTTP response arrival disarms timeout before body parsing');
assert.match(html, /error\.details = result\.data\?\.details \|\| null[\s\S]*error\.postgresCode = appCode \|\| result\.data\?\.code \|\| null[\s\S]*error\.hint = result\.data\?\.hint \|\| null/, 'the shared API boundary preserves structured PostgREST diagnostics');
assert.match(diagnostic, /postgresCode:classified\.postgresCode[\s\S]*details:classified\.details[\s\S]*hint:classified\.hint/, 'handoff logging consumes the structured fields without flattening them');
assert.match(doc, /one source: the Quote handoff controller timer/, 'abort-source conclusion is documented');
assert.match(doc, /live issue is not reported resolved/, 'live acceptance remains explicit');

console.log('Quote handoff outcome observability assertions passed.');
