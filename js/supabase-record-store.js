(function(root){
  'use strict';
  function create(options){
    const base=options.url.replace(/\/$/,''), table=options.table;
    const headers=()=>({apikey:options.key,Authorization:`Bearer ${options.token()}`,'Content-Type':'application/json'});
    async function request(query, init={}){
      if(!options.token()) throw new Error('Sign in is required for durable records.');
      const response=await fetch(`${base}/rest/v1/${table}${query}`,{...init,headers:{...headers(),...(init.headers||{})}});
      if(!response.ok) throw new Error((await response.text()) || `Supabase request failed (${response.status})`);
      return response.status===204 ? null : response.json();
    }
    return Object.freeze({
      list:()=>request('?select=*&order=updated_at.desc'),
      insert:row=>request('',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)}).then(rows=>rows[0]),
      update:(id,row)=>request(`?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(row)}).then(rows=>rows[0]),
      async importRecovery(local, remoteRows){
        const candidates=root.OliPolyPersistence.importableRecovery(remoteRows,local).filter(x=>!remoteRows.some(r=>String(root.OliPolyPersistence.stableId(r))===x.id));
        const imported=[];
        for(const item of candidates) imported.push(await this.insert(item.row));
        return imported;
      }
    });
  }
  root.OliPolySupabaseStore=Object.freeze({create});
})(typeof globalThis !== 'undefined' ? globalThis : this);
