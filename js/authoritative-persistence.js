(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.OliPolyPersistence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const time = row => {
    const parsed = Date.parse(row?.updated_at || '');
    return Number.isFinite(parsed) ? parsed : null;
  };
  const stableId = row => row?.id || row?.recipe_key || row?.quote_number || row?.order_number || null;

  function choose(remote, local){
    if(!remote) return local ? {row:local, source:'local-recovery'} : null;
    if(!local) return {row:remote, source:'remote'};
    const remoteTime=time(remote), localTime=time(local);
    if(localTime !== null && remoteTime !== null && localTime > remoteTime) return {row:local, source:'local-recovery'};
    return {row:remote, source:'remote'};
  }

  function reconcile(remoteRows, localRows){
    const remote=new Map(), local=new Map();
    for(const row of remoteRows || []){ const id=stableId(row); if(id) remote.set(String(id),row); }
    for(const row of localRows || []){ const id=stableId(row); if(id && !local.has(String(id))) local.set(String(id),row); }
    const ids=new Set([...remote.keys(),...local.keys()]);
    return [...ids].map(id=>({...choose(remote.get(id),local.get(id)),id}));
  }

  function importableRecovery(remoteRows, localRows){
    return reconcile(remoteRows,localRows).filter(item=>item.source==='local-recovery');
  }

  return Object.freeze({time,stableId,choose,reconcile,importableRecovery});
});
