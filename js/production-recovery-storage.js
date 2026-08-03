/* Production Control's non-authoritative browser recovery storage boundary. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyProductionRecoveryStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  function inspect(key, storage = globalThis.localStorage){
    let raw;
    try{
      raw = storage.getItem(key);
    }catch(error){
      return {status:'unavailable', error};
    }
    if(raw === null) return {status:'missing'};
    try{
      return {status:'valid', value:JSON.parse(raw)};
    }catch(error){
      return {status:'malformed', error};
    }
  }

  function read(key, fallback, storage = globalThis.localStorage){
    const result = inspect(key, storage);
    if(result.status === 'valid') return result.value;
    if(result.status === 'missing') return fallback;
    const error = new Error(result.status === 'malformed'
      ? 'Stored Production recovery data is malformed.'
      : 'Production recovery storage is unavailable.');
    error.name = 'ProductionRecoveryReadError';
    error.storageKey = key;
    error.recoveryStatus = result.status;
    error.cause = result.error;
    throw error;
  }

  function write(key, value, storage = globalThis.localStorage){
    storage.setItem(key, JSON.stringify(value));
  }

  return Object.freeze({inspect, read, write});
});
