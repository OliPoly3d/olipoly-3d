(function(root, factory){
  const api = factory(root);
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyQuoteProductionHandoff = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  'use strict';

  const INTENT_KEY = 'olipoly_production_quote_intent_v2';
  const JOBS_KEY = 'olipoly_production_jobs_v3';

  function readIntent(storage = root?.localStorage){
    try { return JSON.parse(storage?.getItem(INTENT_KEY) || 'null'); } catch(_error) { return null; }
  }
  function writeIntent(patch, storage = root?.localStorage){
    const current = readIntent(storage);
    if(!current) return null;
    const next = {...current, ...patch};
    storage.setItem(INTENT_KEY, JSON.stringify(next));
    return next;
  }
  function matchingIntent(jobId, quoteNumber, storage = root?.localStorage){
    const intent = readIntent(storage);
    return intent && String(intent.production_job_id) === String(jobId) && String(intent.quote_number) === String(quoteNumber) ? intent : null;
  }
  function updateCachedJob(authoritative, storage = root?.localStorage){
    if(!authoritative?.id) return;
    let jobs = [];
    try { jobs = JSON.parse(storage.getItem(JOBS_KEY) || '[]'); } catch(_error) {}
    storage.setItem(JOBS_KEY, JSON.stringify(jobs.map(job => String(job.id) === String(authoritative.id) ? {...job, ...authoritative} : job)));
  }
  function unwrap(result){
    if(!result?.ok || result.error) throw new Error(result?.error?.message || 'Production status link failed.');
    return Array.isArray(result.data) ? result.data[0] : result.data;
  }
  function commandBody({jobId, expectedUpdatedAt, quoteNumber, durableQuote, correlationId}){
    return {
      p_job_id:String(jobId), p_command:'mark_waiting_customer', p_expected_updated_at:expectedUpdatedAt,
      p_payload:{quote_number:quoteNumber, durable_quote_id:durableQuote?.id || null, quote_snapshot:durableQuote?.quote_data || null},
      p_correlation_id:correlationId, p_causation_id:`quote-save:${durableQuote?.id || quoteNumber}`
    };
  }
  async function confirm({jobId, quoteNumber, durableQuote, expectedUpdatedAt, api = root?.sbApi, storage = root?.localStorage}){
    if(!jobId || !quoteNumber || !durableQuote?.id) throw new Error('A durable Production-linked Quote is required.');
    if(typeof api !== 'function') throw new Error('Supabase authority is unavailable.');
    const currentResult = await api(`/rest/v1/production_jobs?select=*&id=eq.${encodeURIComponent(String(jobId))}&limit=1`, {method:'GET'});
    const rows = unwrap(currentResult);
    const current = Array.isArray(rows) ? rows[0] : rows;
    if(!current) throw new Error('The linked Production job was not found for this owner.');
    if(current.order_number || !['estimate','waiting_customer'].includes(String(current.production_status || 'estimate'))) throw new Error('The linked Production job is no longer eligible for pre-acceptance handoff.');
    if(String(current.production_status) === 'waiting_customer'){
      updateCachedJob(current, storage);
      writeIntent({status:'handoff_confirmed', quote_saved_at:durableQuote.updated_at || new Date().toISOString(), handoff_confirmed_at:new Date().toISOString(), durable_quote_id:durableQuote.id}, storage);
      return current;
    }
    const correlationId = `quote-save:${String(jobId)}:${root.crypto.randomUUID()}`;
    const rpc = await api('/rest/v1/rpc/preacceptance_production_command', {
      method:'POST', headers:{Prefer:'return=representation'},
      body:JSON.stringify(commandBody({jobId, expectedUpdatedAt:current.updated_at || expectedUpdatedAt, quoteNumber, durableQuote, correlationId}))
    });
    const authoritative = unwrap(rpc);
    if(!authoritative) throw new Error('Production status link returned no authoritative row.');
    updateCachedJob(authoritative, storage);
    writeIntent({status:'handoff_confirmed', quote_saved_at:durableQuote.updated_at || new Date().toISOString(), handoff_confirmed_at:new Date().toISOString(), durable_quote_id:durableQuote.id}, storage);
    return authoritative;
  }
  function markUnconfirmed(durableQuote, storage = root?.localStorage){
    return writeIntent({status:'quote_saved_handoff_unconfirmed', quote_saved_at:durableQuote?.updated_at || new Date().toISOString(), durable_quote_id:durableQuote?.id || null, handoff_confirmed_at:null}, storage);
  }

  return Object.freeze({INTENT_KEY, JOBS_KEY, readIntent, writeIntent, matchingIntent, updateCachedJob, commandBody, confirm, markUnconfirmed});
});
