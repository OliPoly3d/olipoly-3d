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
  const jobOperations = new Map();

  function operationState(jobId){
    if(!jobOperations.has(jobId)) jobOperations.set(jobId, {savePromise:null, handoff:false});
    return jobOperations.get(jobId);
  }
  async function beginHandoff(jobId){
    const operation = operationState(jobId);
    if(operation.handoff) throw Object.assign(new Error('Quote handoff is already in progress.'), {code:'QUOTE_HANDOFF_IN_PROGRESS'});
    operation.handoff = true;
    try{
      if(operation.savePromise) await operation.savePromise;
    }catch(error){
      operation.handoff = false;
      throw error;
    }
    let released = false;
    return () => {
      if(released) return;
      released = true;
      operation.handoff = false;
      if(!operation.savePromise) jobOperations.delete(jobId);
    };
  }
  function trackSave(jobId, save){
    const operation = operationState(jobId);
    if(operation.handoff){
      return Promise.reject(Object.assign(new Error('This Production job cannot be saved while Quote handoff is pending.'), {code:'QUOTE_HANDOFF_SAVE_BLOCKED'}));
    }
    const promise = operation.savePromise
      ? operation.savePromise.catch(()=>{}).then(save)
      : Promise.resolve().then(save);
    operation.savePromise = promise;
    return promise.finally(() => {
      if(operation.savePromise === promise) operation.savePromise = null;
      if(!operation.handoff && !operation.savePromise) jobOperations.delete(jobId);
    });
  }
  const operationCoordinator = Object.freeze({beginHandoff, trackSave});

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
    if(error?.handoffOutcome === 'job_lock') return 'Another Quote handoff is already using this Production job. Refresh before retrying.';
    if(error?.handoffOutcome === 'command_lock') return 'This Quote handoff command is already being processed. Refresh before retrying.';
    if(error?.handoffOutcome === 'row_lock_timeout') return 'The Production record is busy in another operation. Refresh before retrying.';
    if(error?.handoffOutcome === 'production_row_busy') return 'The estimate is currently being saved or changed elsewhere. Refresh before retrying.';
    if(error?.handoffOutcome === 'database_lock_timeout') return 'The Production database operation is busy. Refresh before retrying.';
    if(error?.handoffOutcome === 'in_progress') return 'Another Quote handoff is already in progress. Refresh the estimate before retrying.';
    if(error?.handoffOutcome === 'stale') return 'This estimate changed since it was loaded. Refresh before retrying.';
    if(error?.handoffOutcome === 'eligibility') return 'The estimate is not eligible to move to Quote. Refresh and review its Production details.';
    if(error?.handoffOutcome === 'identity_conflict') return 'This Quote handoff command conflicts with an existing command. Refresh before retrying.';
    if(error?.handoffOutcome === 'client_timeout') return 'The server did not confirm the Quote handoff in time. Refresh the record before retrying.';
    if(error?.handoffOutcome === 'network') return 'The Quote handoff could not reach the server. Check your connection and refresh before retrying.';
    if(error?.handoffOutcome === 'explicit_abort') return 'The Quote handoff was canceled. Refresh the record before retrying.';
    if(error?.handoffOutcome === 'server_error') return 'The server rejected the Quote handoff. Refresh the estimate before retrying.';
    if(error?.handoffOutcome === 'ambiguous') return 'Quote handoff could not be confirmed. Refresh the record before retrying.';
    if(error?.handoffOutcome === 'auth') return 'Your session is not authorized for this Production job. Sign in again and refresh.';
    if(error?.handoffOutcome === 'validation') return 'Quote handoff was rejected. Refresh the estimate and review the record.';
    return error?.message || 'Quote handoff failed. The recovery draft was retained.';
  }

  function transportError(error, {timedOut = false} = {}){
    const aborted = error?.name === 'AbortError';
    const transportCode = aborted
      ? (timedOut ? 'QUOTE_HANDOFF_CLIENT_TIMEOUT' : 'QUOTE_HANDOFF_EXPLICIT_ABORT')
      : 'NETWORK_ERROR';
    const message = transportCode === 'QUOTE_HANDOFF_CLIENT_TIMEOUT'
      ? 'The Quote handoff request exceeded its client transport timeout.'
      : transportCode === 'NETWORK_ERROR'
        ? 'The Quote handoff request could not reach the server.'
        : 'The Quote handoff request was explicitly aborted.';
    const classified = new Error(message, {cause:error});
    classified.name = 'QuoteHandoffTransportError';
    classified.transportCode = transportCode;
    classified.stage = 'fetch';
    return classified;
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
      const originalLabel = button.textContent;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Opening Quote draft…';
      notify('Opening Quote draft…');
      let releaseHandoff = null;
      let correlationId;
      try{
        releaseHandoff = await operationCoordinator.beginHandoff(jobId);
        if(typeof root?.crypto?.randomUUID !== 'function') throw new Error('Secure command identity generation is unavailable.');
        correlationId = `production-quote:${jobId}:${root.crypto.randomUUID()}`;
      }catch(error){
        notify(error.message);
      }
      try{
        if(correlationId) await push(jobId, {correlationId, causationId:`operator-click:${correlationId}`});
      }catch(error){
        if(['ambiguous','in_progress','job_lock','command_lock','row_lock_timeout','production_row_busy','database_lock_timeout','stale'].includes(error?.handoffOutcome)) ambiguousJobs.add(jobId);
        notify(outcomeMessage(error));
      }finally{
        releaseHandoff?.();
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

  return Object.freeze({install, neutralizeLegacyRecovery, nonExecutableRecovery, outcomeMessage, transportError, operationCoordinator, LEGACY_RECOVERY_KEY});
});
