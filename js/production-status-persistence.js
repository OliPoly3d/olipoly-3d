(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyProductionPersistence = api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  'use strict';

  function timestamp(row){
    const value = Date.parse(row?.updated_at || row?.saved_at || row?.created_at || '');
    return Number.isFinite(value) ? value : 0;
  }

  function identity(row){
    if(row?.id) return `id:${row.id}`;
    if(row?.quote_number) return `quote:${String(row.quote_number).trim().toUpperCase()}`;
    return `legacy:${row?.job_title || ''}|${row?.created_at || ''}|${row?.customer_name || ''}`;
  }

  function chooseFreshest(existing, candidate){
    if(!existing) return candidate;
    const timeDifference = timestamp(candidate.row) - timestamp(existing.row);
    if(timeDifference > 0) return candidate;
    if(timeDifference < 0) return existing;
    if(candidate.source === 'remote' && existing.source !== 'remote') return candidate;
    return existing;
  }

  function mergeJobs(remoteRows, localRows, normalize = value => value){
    const records = new Map();
    const quoteKeys = new Map();
    const add = (raw, source) => {
      if(!raw) return;
      const row = normalize(raw);
      const rowIdentity = identity(row);
      const quoteKey = row?.quote_number ? String(row.quote_number).trim().toUpperCase() : '';
      const key = quoteKey && quoteKeys.has(quoteKey) ? quoteKeys.get(quoteKey) : rowIdentity;
      records.set(key, chooseFreshest(records.get(key), {row, source}));
      if(quoteKey) quoteKeys.set(quoteKey, key);
    };
    (remoteRows || []).forEach(row => add(row, 'remote'));
    (localRows || []).forEach(row => add(row, 'local'));
    return [...records.values()]
      .map(record => record.row)
      .sort((a, b) => timestamp(b) - timestamp(a) || identity(a).localeCompare(identity(b)));
  }

  function transition(row, status, details = {}, now = new Date().toISOString()){
    return {...row, ...details, production_status:status, updated_at:now};
  }

  return Object.freeze({identity, timestamp, mergeJobs, transition});
});
