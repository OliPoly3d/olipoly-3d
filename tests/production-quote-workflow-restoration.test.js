const assert = require('node:assert/strict');
const fs = require('node:fs');
const handoff = require('../js/quote-production-handoff.js');

function storage(initial = {}){
  const values = new Map(Object.entries(initial));
  return {getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key), values};
}

(async () => {
  const production = fs.readFileSync('production-control.html', 'utf8');
  const quote = fs.readFileSync('quote.js', 'utf8');
  const quoteHtml = fs.readFileSync('quote.html', 'utf8');
  const openFlow = production.slice(production.indexOf('async function pushProductionJobToQuote'), production.indexOf('function classifyHandoffError'));

  assert.match(openFlow, /OliPolyProductionQuoteResolver\?\.resolve\(id\)/, 'rendered/cloud/recovery resolver is used');
  assert.match(openFlow, /\['estimate','waiting_customer'\]\.includes\(status\)/, 'estimate and waiting_customer are eligible');
  assert.match(openFlow, /job\.order_number/, 'accepted/order-linked jobs are rejected');
  assert.ok(openFlow.indexOf('writeJson(QUOTE_DRAFT_KEY') < openFlow.indexOf('window.location.href'), 'draft is durable before navigation');
  assert.ok(openFlow.indexOf('writeJson(QUOTE_INTENT_KEY') < openFlow.indexOf('window.location.href'), 'non-executable intent is durable before navigation');
  assert.doesNotMatch(openFlow, /preacceptance_production_command|syncPreAcceptance|patchProductionJobHandoff|sendBeacon|fetch\(/, 'opening cannot issue a lifecycle mutation');
  assert.match(openFlow, /quote\.html\?fromProduction=1&production_job_id=\$\{encodeURIComponent\(job\.id\)\}/, 'linked URL is preserved for legacy and UUID string ids');
  assert.match(openFlow, /Opening Quote draft…/, 'operator receives immediate truthful feedback');

  assert.match(production, /state\.jobs\.find\(job => String\(job\.id\) === id\)/, 'rendered in-memory state is first recovery candidate');
  assert.match(production, /production_jobs\?select=\*&id=eq\.\$\{encodeURIComponent\(id\)\}&user_id=eq\./, 'cloud refresh is owner scoped');
  assert.match(production, /source:'local-recovery'/, 'local storage remains last-resort recovery only');
  assert.match(production, /source_updated_at: job\.updated_at \|\| null/, 'optimistic concurrency source is captured');

  assert.match(quote, /String\(draft\.production_job_id \?\? ''\)/, 'legacy numeric and UUID ids normalize to strings');
  assert.match(quote, /!cameFromProduction \|\| !urlJobId \|\| !draftJobId \|\| urlJobId !== draftJobId/, 'missing or mismatched URL identity fails safely');
  for(const field of ['quoteNumber','invoiceNumber','customerName','customerEmail','quoteTitle','qty','manualPiecePriceOverride','machineHours','machineRate','designHours','designRate','postHours','postRate','customerNotes','turnaround','productionJobId','productionQuoteSource']){
    assert.ok(quote.includes(`'${field}'`) || quote.includes(`"${field}"`), `${field} participates in final Quote composition`);
  }
  assert.match(quote, /Production estimate loaded\. Save this Quote to update Production status\./, 'pre-save banner is truthful');
  assert.ok(quoteHtml.indexOf('quote-production-handoff.js') < quoteHtml.indexOf('src="quote.js'), 'handoff authority loads before final quote runtime');

  const intent = {version:2, production_job_id:'550e8400-e29b-41d4-a716-446655440000', quote_number:'Q-000123', source_updated_at:'2026-07-30T00:00:00Z', source:'production-control', intended_transition:'waiting_customer', status:'draft_opened'};
  const cache = [{id:intent.production_job_id, production_status:'estimate'}, {id:'legacy-7', production_status:'estimate'}];
  const local = storage({[handoff.INTENT_KEY]:JSON.stringify(intent), [handoff.JOBS_KEY]:JSON.stringify(cache)});
  const calls = [];
  const durableQuote = {id:'durable-quote-id', quote_number:intent.quote_number, updated_at:'2026-07-30T01:00:00Z', quote_data:{production_estimate:{production_job_id:intent.production_job_id}}};
  const authoritative = {id:intent.production_job_id, production_status:'waiting_customer', updated_at:'2026-07-30T01:00:01Z'};
  const api = async (path, options) => {
    calls.push({path, options});
    if(path.startsWith('/rest/v1/production_jobs')) return {ok:true, data:[{...cache[0], updated_at:intent.source_updated_at}]};
    return {ok:true, data:[authoritative]};
  };
  const confirmed = await handoff.confirm({jobId:intent.production_job_id, quoteNumber:intent.quote_number, durableQuote, expectedUpdatedAt:intent.source_updated_at, api, storage:local});
  assert.equal(confirmed.production_status, 'waiting_customer');
  assert.equal(calls.filter(call=>call.path.includes('preacceptance_production_command')).length, 1, 'one saved linked Quote causes one controlled RPC');
  assert.equal(calls[1].options.method, 'POST');
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.p_job_id, intent.production_job_id);
  assert.equal(body.p_command, 'mark_waiting_customer');
  assert.equal(body.p_expected_updated_at, intent.source_updated_at);
  assert.equal(body.p_payload.quote_number, intent.quote_number);
  assert.equal(body.p_payload.durable_quote_id, durableQuote.id);
  assert.match(body.p_correlation_id, /^quote-save:.*:[0-9a-f-]{36}$/i);
  assert.equal(handoff.readIntent(local).status, 'handoff_confirmed');
  assert.equal(JSON.parse(local.getItem(handoff.JOBS_KEY))[0].production_status, 'waiting_customer', 'cache changes only from authoritative response');

  const alreadyCalls = [];
  const alreadyApi = async (path) => { alreadyCalls.push(path); return {ok:true, data:[authoritative]}; };
  await handoff.confirm({jobId:intent.production_job_id, quoteNumber:intent.quote_number, durableQuote, expectedUpdatedAt:intent.source_updated_at, api:alreadyApi, storage:local});
  assert.equal(alreadyCalls.length, 1, 'explicit reconciliation reads current authority once');
  assert.equal(alreadyCalls.some(path=>path.includes('/rpc/')), false, 'already-confirmed state is success without a duplicate command');

  handoff.writeIntent({status:'draft_opened'}, local);
  handoff.markUnconfirmed(durableQuote, local);
  assert.equal(handoff.readIntent(local).status, 'quote_saved_handoff_unconfirmed');
  assert.match(quote, /Retry Production Status Link/, 'failure exposes an explicit reconciliation action');
  assert.doesNotMatch(quote, /(?:DOMContentLoaded|setTimeout|online|visibilitychange)[\s\S]{0,180}preacceptance_production_command/, 'page load and browser lifecycle never replay the command');
  assert.ok(quote.indexOf('const durableRows = await saveCloudQuote()') < quote.indexOf('await handoffSavedProductionQuote(durableRows)'), 'handoff is sequenced after durable save');
  assert.match(quote, /Quote saved, but Production status needs reconciliation\./, 'durable-save/handoff-failure warning is visible');

  console.log('Production-to-Quote workflow restoration assertions passed (30 focused contracts).');
})();
