(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyProductionQuoteHandoff = api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  'use strict';

  const LEGACY_RECOVERY_KEY = 'olipoly_production_to_quote_recovery_draft_v1';
  const EXECUTABLE_MARKERS = new Set([
    'pending', 'retry', 'retry_at', 'retry_count', 'next_retry_at', 'queued',
    'command_id', 'idempotency_key', 'quote_handoff_status'
  ]);

  function nonExecutableRecovery(value){
    if(Array.isArray(value)) return value.map(nonExecutableRecovery);
    if(!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !EXECUTABLE_MARKERS.has(key.toLowerCase()))
      .map(([key, child]) => [key, nonExecutableRecovery(child)]));
  }

  function neutralizeLegacyRecovery(storage){
    if(!storage) return null;
    const raw = storage.getItem(LEGACY_RECOVERY_KEY);
    if(!raw) return null;
    try{
      const clean = nonExecutableRecovery(JSON.parse(raw));
      storage.setItem(LEGACY_RECOVERY_KEY, JSON.stringify({...clean, recovery_draft_only:true}));
      return clean;
    }catch(_error){
      storage.removeItem(LEGACY_RECOVERY_KEY);
      return null;
    }
  }

  function outcomeMessage(error){
    if(error?.handoffOutcome === 'ambiguous') return 'Quote handoff could not be confirmed. Refresh the record before retrying.';
    if(error?.handoffOutcome === 'auth') return 'Quote handoff was not authorized. Refresh or sign in before retrying.';
    if(error?.handoffOutcome === 'validation') return error.message || 'Quote handoff was rejected. Refresh the record before retrying.';
    return error?.message || 'Quote handoff failed. The recovery draft was retained.';
  }

  function install({container, push, notify}){
    if(!container || typeof container.addEventListener !== 'function') throw new Error('A stable Production container is required.');
    if(typeof push !== 'function') throw new Error('The Production quote handoff command is unavailable.');
    if(container.__olipolyQuoteHandoffInstalled) return container.__olipolyQuoteHandoffInstalled;
    const pendingJobs = new Set();

    async function handleClick(event){
      const button = event.target?.closest?.('.quote-action[' + 'data-push-quote]');
      if(!button || !container.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const jobId = String(button.dataset.pushQuote || '').trim();
      if(!jobId){ notify('Could not identify that production job.'); return; }
      if(pendingJobs.has(jobId)){ notify('Quote handoff is already in progress.'); return; }
      pendingJobs.add(jobId);
      const originalLabel = button.textContent;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Pushing to Quote…';
      notify('Pushing quote handoff…');
      try{
        await push(jobId);
      }catch(error){
        notify(outcomeMessage(error));
      }finally{
        pendingJobs.delete(jobId);
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = originalLabel;
      }
    }

    container.addEventListener('click', handleClick);
    const controller = Object.freeze({pendingJobs, handleClick});
    container.__olipolyQuoteHandoffInstalled = controller;
    return controller;
  }

  return Object.freeze({install, neutralizeLegacyRecovery, nonExecutableRecovery, outcomeMessage, LEGACY_RECOVERY_KEY});
});
