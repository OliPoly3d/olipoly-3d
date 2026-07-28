(function(root, factory){
  const moduleKey = typeof Symbol === 'function' ? Symbol.for('olipoly.productionQuoteHandoff') : '__olipolyProductionQuoteHandoffModule';
  const api = root?.[moduleKey] || factory(root);
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root){ root[moduleKey] = api; root.OliPolyProductionQuoteHandoff = api; }
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  'use strict';

  const LEGACY_RECOVERY_KEY = 'olipoly_production_to_quote_recovery_draft_v1';
  const EXECUTABLE_MARKERS = new Set([
    'pending', 'retry', 'retry_at', 'retry_count', 'next_retry_at', 'queued',
    'command_id', 'idempotency_key', 'quote_handoff_status'
  ]);
  const installedContainers = new WeakMap();
  const pendingJobs = new Set();
  const ambiguousJobs = new Set();

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
    if(error?.handoffOutcome === 'in_progress') return 'Another Quote handoff is already in progress. Refresh the estimate before retrying.';
    if(error?.handoffOutcome === 'stale') return 'This estimate changed since it was loaded. Refresh before retrying.';
    if(error?.handoffOutcome === 'ambiguous') return 'Quote handoff could not be confirmed. Refresh the record before retrying.';
    if(error?.handoffOutcome === 'auth') return 'Quote handoff was not authorized. Refresh or sign in before retrying.';
    if(error?.handoffOutcome === 'validation') return 'Quote handoff was rejected. Refresh the estimate and review the record.';
    return error?.message || 'Quote handoff failed. The recovery draft was retained.';
  }

  function install({container, push, notify}){
    if(!container || typeof container.addEventListener !== 'function') throw new Error('A stable Production container is required.');
    if(typeof push !== 'function') throw new Error('The Production quote handoff command is unavailable.');
    if(installedContainers.has(container)) return installedContainers.get(container);

    async function handleClick(event){
      const button = event.target?.closest?.('.quote-action[' + 'data-push-quote]');
      if(!button || !container.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const jobId = String(button.dataset.pushQuote || '').trim();
      if(!jobId){ notify('Could not identify that production job.'); return; }
      if(pendingJobs.has(jobId)){ notify('Quote handoff is already in progress.'); return; }
      if(ambiguousJobs.has(jobId)){ notify('Quote handoff could not be confirmed. Refresh the record before retrying.'); return; }
      pendingJobs.add(jobId);
      let correlationId;
      try{
        if(typeof root?.crypto?.randomUUID !== 'function') throw new Error('Secure command identity generation is unavailable.');
        correlationId = `production-quote:${jobId}:${root.crypto.randomUUID()}`;
      }catch(error){
        pendingJobs.delete(jobId);
        notify(error.message);
        return;
      }
      const originalLabel = button.textContent;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Sending to Quote…';
      notify('Sending to Quote…');
      try{
        await push(jobId, {correlationId, causationId:`operator-click:${correlationId}`});
      }catch(error){
        if(['ambiguous','in_progress','stale'].includes(error?.handoffOutcome)) ambiguousJobs.add(jobId);
        notify(outcomeMessage(error));
      }finally{
        pendingJobs.delete(jobId);
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = originalLabel;
      }
    }

    container.addEventListener('click', handleClick);
    const controller = Object.freeze({pendingJobs, ambiguousJobs, handleClick});
    installedContainers.set(container, controller);
    return controller;
  }

  return Object.freeze({install, neutralizeLegacyRecovery, nonExecutableRecovery, outcomeMessage, LEGACY_RECOVERY_KEY});
});
