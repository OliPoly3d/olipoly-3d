(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyBrowserRecoveryAuthority = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const CACHE_VERSION = 1;
  const COMMAND_OWNED_FIELDS = Object.freeze(new Set([
    'production_status', 'job_status', 'status', 'payment_status', 'finance_pushed',
    'customer_response', 'quote_status', 'converted_to_order', 'converted_order_number',
    'production_job_id', 'remaining_grams', 'reserved_grams', 'consumed_at',
    'reservation_status', 'correction_state'
  ]));

  function diagnostic(event, detail = {}){
    if(typeof console !== 'undefined') console.info(`[OliPolyERP] ${event}`, detail);
    return {event, detail};
  }

  function envelope(data, {ownerId, source = 'authoritative-cloud', capturedAt = new Date().toISOString()} = {}){
    if(!ownerId) throw new Error('Operational browser caches require an ownerId.');
    return {cacheVersion:CACHE_VERSION, capturedAt, source, ownerId:String(ownerId), data};
  }

  function inspect(value, {ownerId, ttlMs, now = Date.now()} = {}){
    if(!value || value.cacheVersion !== CACHE_VERSION){
      diagnostic('STALE_CACHE_VERSION_IGNORED');
      return {usable:false, reason:'cache-version'};
    }
    if(!ownerId || String(value.ownerId) !== String(ownerId)) return {usable:false, reason:'owner-mismatch'};
    const captured = Date.parse(value.capturedAt || '');
    if(!Number.isFinite(captured)) return {usable:false, reason:'captured-at'};
    if(Number.isFinite(ttlMs) && ttlMs >= 0 && now - captured > ttlMs) return {usable:false, reason:'expired'};
    return {usable:true, data:value.data, capturedAt:value.capturedAt, source:value.source};
  }

  function hydrate({cloudSucceeded, cloudData, cacheValue, ownerId, ttlMs, now} = {}){
    if(cloudSucceeded){
      if(cacheValue) diagnostic('CACHE_DISCARDED_AFTER_CLOUD_SUCCESS');
      return {mode:'authoritative', data:cloudData, commandsEnabled:true, replaceCache:true};
    }
    const cached = inspect(cacheValue, {ownerId, ttlMs, now});
    if(cached.usable){
      diagnostic('CACHE_USED_BECAUSE_CLOUD_FAILED', {capturedAt:cached.capturedAt});
      return {mode:'recovery', data:cached.data, commandsEnabled:false, replaceCache:false, capturedAt:cached.capturedAt};
    }
    return {mode:'unavailable', data:null, commandsEnabled:false, replaceCache:false, reason:cached.reason};
  }

  function stripCommandOwnedFields(value, extraFields = []){
    const denied = new Set([...COMMAND_OWNED_FIELDS, ...extraFields]);
    return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !denied.has(key)));
  }

  return Object.freeze({CACHE_VERSION, COMMAND_OWNED_FIELDS, envelope, inspect, hydrate, stripCommandOwnedFields});
});
