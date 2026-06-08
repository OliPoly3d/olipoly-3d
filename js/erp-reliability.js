/* OliPoly ERP Reliability & Recovery Layer
   Safe additive layer: does not replace page logic, CSS, auth, or existing buttons. */
(function(){
  'use strict';
  if(window.OliPolyReliabilityInstalled) return;
  window.OliPolyReliabilityInstalled = true;

  var PAGE = (location.pathname.split('/').pop() || 'hub.html').toLowerCase();
  var PAGE_KEY = (PAGE.replace(/\.html?$/,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'') || 'erp');
  var LS_PREFIX = 'olipoly_recovery_';
  var HEALTH_KEY = 'olipoly_erp_health_v1';
  var SNAP_KEY = LS_PREFIX + PAGE_KEY + '_snapshot_v1';
  var DISMISS_KEY = LS_PREFIX + PAGE_KEY + '_dismissed_snapshot_v1';
  var lastGoodSync = 0;
  var lastFailure = '';
  var pendingChanges = false;
  var bootedAt = Date.now();
  var statusEl, bannerEl, detailEl;

  function nowIso(){ return new Date().toISOString(); }
  function fmt(ts){
    if(!ts) return 'Not recorded';
    var d = new Date(ts);
    if(isNaN(d)) return 'Not recorded';
    return d.toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
  }
  function safeJsonGet(k, fallback){ try{ var raw=localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; } }
  function safeJsonSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
  function readHealth(){ return safeJsonGet(HEALTH_KEY, {}); }
  function writeHealth(patch){
    var h = readHealth();
    h[PAGE_KEY] = Object.assign({}, h[PAGE_KEY] || {}, patch, { updatedAt: nowIso(), page: PAGE });
    safeJsonSet(HEALTH_KEY, h);
    try{ window.dispatchEvent(new CustomEvent('olipoly:health-updated', {detail:h[PAGE_KEY]})); }catch(e){}
    return h[PAGE_KEY];
  }
  function tokenPresent(){
    try{
      return !!(window.OliPolyAuth && window.OliPolyAuth.getToken && window.OliPolyAuth.getToken()) ||
             !!localStorage.getItem('sb_token') ||
             !!localStorage.getItem('sb_access_token') ||
             !!localStorage.getItem('supabase.auth.token');
    }catch(e){ return false; }
  }
  function arraysInLocalStorage(){
    var out = [];
    for(var i=0;i<localStorage.length;i++){
      var k = localStorage.key(i);
      if(!k || k.indexOf('olipoly_recovery_') === 0 || k.indexOf('olipoly_erp_health') === 0) continue;
      try{
        var v = JSON.parse(localStorage.getItem(k));
        if(Array.isArray(v)) out.push({key:k, count:v.length});
      }catch(e){}
    }
    return out.sort(function(a,b){return b.count-a.count;}).slice(0,10);
  }
  function pageRecordEstimate(){
    var arr = arraysInLocalStorage();
    var hints = {
      hub:['production','inventory','orders','quote','finance','customer'],
      production_control:['production','job','print'],
      inventory_control:['inventory','material','filament','spool','ledger','transaction'],
      orders_admin:['order','quote','tracking'],
      finance_pro:['finance','financial','transaction','entry']
    }[PAGE_KEY] || [];
    var best = arr.find(function(x){ return hints.some(function(h){return x.key.toLowerCase().indexOf(h) >= 0;}); });
    return best ? (best.count + ' cached rows') : (arr[0] ? arr[0].count + ' cached rows' : 'No cache rows');
  }
  function fieldSnapshot(){
    var fields = Array.from(document.querySelectorAll('input, select, textarea')).filter(function(el){
      if(!el.id && !el.name) return false;
      if(el.type === 'password') return false;
      if(el.closest && el.closest('.erp-reliability-panel')) return false;
      return !el.disabled && el.type !== 'file';
    }).slice(0,160);
    var data = {};
    fields.forEach(function(el){
      var key = el.id || el.name;
      if(!key) return;
      if(el.type === 'checkbox' || el.type === 'radio') data[key] = !!el.checked;
      else data[key] = el.value;
    });
    return { page: PAGE, pageKey: PAGE_KEY, capturedAt: nowIso(), url: location.href, data: data };
  }
  function meaningfulSnapshot(s){
    if(!s || !s.data) return false;
    return Object.keys(s.data).some(function(k){
      var v = s.data[k];
      return typeof v === 'boolean' ? v : String(v || '').trim().length > 0;
    });
  }
  function saveSnapshot(reason){
    var s = fieldSnapshot();
    if(meaningfulSnapshot(s)){
      s.reason = reason || 'autosave';
      safeJsonSet(SNAP_KEY, s);
      writeHealth({ lastSnapshotAt:s.capturedAt, pendingChanges:pendingChanges, recordEstimate:pageRecordEstimate() });
    }
  }
  function restoreSnapshot(){
    var s = safeJsonGet(SNAP_KEY, null);
    if(!s || !s.data) return;
    Object.keys(s.data).forEach(function(k){
      var el = document.getElementById(k) || document.querySelector('[name="'+CSS.escape(k)+'"]');
      if(!el || el.type === 'password') return;
      if(el.type === 'checkbox' || el.type === 'radio') el.checked = !!s.data[k];
      else el.value = s.data[k];
      try{ el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }catch(e){}
    });
    pendingChanges = true;
    writeHealth({ pendingChanges:true, restoredAt:nowIso() });
    toast('Recovered the last local form snapshot for this page. Review before saving.', 'warn');
    renderStatus();
  }
  function clearSnapshot(){ localStorage.removeItem(SNAP_KEY); pendingChanges=false; writeHealth({pendingChanges:false,lastSnapshotClearedAt:nowIso()}); renderStatus(); }
  function toast(msg, tone){
    var box = document.getElementById('erpReliabilityToasts');
    if(!box){ box=document.createElement('div'); box.id='erpReliabilityToasts'; box.className='erp-reliability-toasts'; document.body.appendChild(box); }
    var item=document.createElement('div'); item.className='erp-reliability-toast '+(tone||''); item.textContent=msg; box.appendChild(item);
    setTimeout(function(){ item.classList.add('hide'); setTimeout(function(){ item.remove(); }, 250); }, 4200);
  }
  function classifyFetch(url, ok, method, error){
    var text = String(url || '');
    if(text.indexOf('/rest/v1/') < 0 && text.indexOf('/auth/v1/') < 0) return;
    var isWrite = /POST|PATCH|PUT|DELETE/i.test(method || 'GET');
    if(ok){
      lastGoodSync = Date.now(); lastFailure = '';
      pendingChanges = false;
      writeHealth({ connected:true, lastGoodSync:nowIso(), lastFailure:'', pendingChanges:false, recordEstimate:pageRecordEstimate() });
      if(isWrite) { clearSnapshot(); toast('Saved to cloud.', 'ok'); }
    }else{
      lastFailure = error || 'Cloud request failed';
      writeHealth({ connected:false, lastFailure:lastFailure, lastFailureAt:nowIso(), pendingChanges:pendingChanges, recordEstimate:pageRecordEstimate() });
      if(isWrite) toast('Cloud save may have failed. A local recovery snapshot was kept.', 'bad');
    }
    renderStatus();
  }
  var nativeFetch = window.fetch;
  if(nativeFetch && !nativeFetch.__olipolyReliabilityWrapped){
    var wrapped = function(input, init){
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      return nativeFetch.apply(this, arguments).then(function(res){
        classifyFetch(url, res && res.ok, method, res && !res.ok ? ('HTTP ' + res.status) : '');
        return res;
      }).catch(function(err){
        classifyFetch(url, false, method, err && err.message ? err.message : 'Network error');
        throw err;
      });
    };
    wrapped.__olipolyReliabilityWrapped = true;
    window.fetch = wrapped;
  }
  function moduleLabel(){
    if(PAGE_KEY.indexOf('production')>=0) return 'Production';
    if(PAGE_KEY.indexOf('inventory')>=0) return 'Inventory';
    if(PAGE_KEY.indexOf('orders')>=0) return 'Orders';
    if(PAGE_KEY.indexOf('finance')>=0) return 'Finance';
    if(PAGE_KEY.indexOf('hub')>=0) return 'ERP Console';
    return 'ERP';
  }
  function syncButton(){
    var candidates = ['refreshBtn','syncRepairBtn','forceSyncBtn','loadBtn','loginBtn'];
    for(var i=0;i<candidates.length;i++){ var el=document.getElementById(candidates[i]); if(el && !el.classList.contains('hidden')) return el; }
    return null;
  }
  function forceSync(){
    saveSnapshot('manual-force-sync');
    var btn = syncButton();
    if(btn){ btn.click(); toast('Force sync requested. Watch the page status for results.', 'ok'); }
    else { toast('No page sync button found. Refresh the page after confirming your latest change is saved.', 'warn'); }
    writeHealth({ forceSyncRequestedAt:nowIso(), pendingChanges:pendingChanges });
    renderStatus();
  }
  function exportReliabilityBackup(){
    saveSnapshot('manual-backup');
    var payload = { exportedAt: nowIso(), page: PAGE, health: readHealth(), snapshot: safeJsonGet(SNAP_KEY,null), localArraySummary: arraysInLocalStorage() };
    var blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'olipoly-erp-recovery-' + PAGE_KEY + '-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){URL.revokeObjectURL(a.href);}, 1000);
    localStorage.setItem('olipoly_last_recovery_export_at', nowIso());
    writeHealth({ lastBackupExportAt:nowIso() });
    renderStatus();
  }
  function renderStatus(){
    if(!statusEl) return;
    var h = (readHealth()[PAGE_KEY] || {});
    var connected = tokenPresent() && (h.connected !== false || !!lastGoodSync);
    var lastSync = h.lastGoodSync || (lastGoodSync ? new Date(lastGoodSync).toISOString() : '');
    var snap = safeJsonGet(SNAP_KEY, null);
    var hasSnap = snap && meaningfulSnapshot(snap) && localStorage.getItem(DISMISS_KEY) !== (snap.capturedAt || '');
    var state = pendingChanges ? 'Unsaved local changes' : (connected ? 'Cloud ready' : 'Needs sign-in / cloud check');
    statusEl.className = 'erp-reliability-pill ' + (pendingChanges ? 'warn' : connected ? 'ok' : 'bad');
    statusEl.innerHTML = '<span></span><strong>'+state+'</strong><em>'+fmt(lastSync)+'</em>';
    if(detailEl){
      detailEl.innerHTML = ''+
        '<div><b>Module</b><span>'+moduleLabel()+'</span></div>'+
        '<div><b>Cloud</b><span>'+(tokenPresent() ? (h.connected === false ? 'Token present, last request failed' : 'Token present') : 'Not signed in')+'</span></div>'+
        '<div><b>Last sync</b><span>'+fmt(lastSync)+'</span></div>'+
        '<div><b>Local data</b><span>'+(h.recordEstimate || pageRecordEstimate())+'</span></div>'+
        '<div><b>Last backup</b><span>'+fmt(h.lastBackupExportAt || localStorage.getItem('olipoly_last_recovery_export_at'))+'</span></div>'+
        '<div><b>Last issue</b><span>'+(h.lastFailure || 'None recorded')+'</span></div>';
    }
    if(bannerEl){
      bannerEl.hidden = !hasSnap;
      if(hasSnap){
        var t = bannerEl.querySelector('.erp-recovery-banner-time');
        if(t) t.textContent = 'Captured ' + fmt(snap.capturedAt);
      }
    }
  }
  function buildPanel(){
    if(document.getElementById('erpReliabilityPanel')) return;
    var panel=document.createElement('section');
    panel.id='erpReliabilityPanel';
    panel.className='erp-reliability-panel';
    panel.innerHTML = ''+
      '<div class="erp-reliability-head">'+
        '<div><span class="erp-reliability-kicker">Reliability & Recovery</span><h2>System Health</h2><p>Cloud sync visibility, local recovery snapshots, and quick repair actions for '+moduleLabel()+'.</p></div>'+
        '<div class="erp-reliability-actions"><button type="button" data-erp-force>Force Sync</button><button type="button" data-erp-backup>Export Recovery</button></div>'+
      '</div>'+
      '<div class="erp-reliability-grid" id="erpReliabilityDetails"></div>'+
      '<div class="erp-recovery-banner" id="erpRecoveryBanner" hidden><strong>Recoverable local snapshot found.</strong><span class="erp-recovery-banner-time"></span><div><button type="button" data-erp-restore>Restore</button><button type="button" data-erp-dismiss>Ignore</button></div></div>';
    detailEl = panel.querySelector('#erpReliabilityDetails');
    bannerEl = panel.querySelector('#erpRecoveryBanner');
    panel.querySelector('[data-erp-force]').addEventListener('click', forceSync);
    panel.querySelector('[data-erp-backup]').addEventListener('click', exportReliabilityBackup);
    panel.querySelector('[data-erp-restore]').addEventListener('click', restoreSnapshot);
    panel.querySelector('[data-erp-dismiss]').addEventListener('click', function(){ var s=safeJsonGet(SNAP_KEY,null); if(s && s.capturedAt) localStorage.setItem(DISMISS_KEY, s.capturedAt); renderStatus(); });
    var wrap = document.querySelector('.wrap') || document.body;
    var top = wrap.querySelector('.topbar, header.topbar');
    if(top && top.parentNode === wrap) top.insertAdjacentElement('afterend', panel);
    else wrap.insertBefore(panel, wrap.firstChild);
  }
  function buildPill(){
    if(document.getElementById('erpReliabilityPill')) return;
    statusEl=document.createElement('button');
    statusEl.type='button'; statusEl.id='erpReliabilityPill'; statusEl.className='erp-reliability-pill';
    statusEl.title='Open System Health';
    statusEl.addEventListener('click', function(){ var p=document.getElementById('erpReliabilityPanel'); if(p) p.scrollIntoView({behavior:'smooth', block:'center'}); });
    document.body.appendChild(statusEl);
  }
  function installFormWatchers(){
    var timer=0;
    function mark(){
      if(Date.now() - bootedAt < 1200) return;
      pendingChanges = true;
      writeHealth({ pendingChanges:true, lastLocalChangeAt:nowIso(), recordEstimate:pageRecordEstimate() });
      clearTimeout(timer); timer=setTimeout(function(){ saveSnapshot('local-change'); renderStatus(); }, 900);
      renderStatus();
    }
    document.addEventListener('input', function(e){ if(e.target && e.target.matches && e.target.matches('input,textarea,select')) mark(); }, true);
    document.addEventListener('change', function(e){ if(e.target && e.target.matches && e.target.matches('input,textarea,select')) mark(); }, true);
    window.addEventListener('beforeunload', function(){ if(pendingChanges) saveSnapshot('beforeunload'); });
  }
  function hubEnhance(){
    if(PAGE_KEY !== 'hub_html' && PAGE_KEY !== 'hub') return;
    try{
      var h=readHealth();
      var modules=['hub','production_control_html','inventory_control_html','orders_admin_html','finance_pro_html'];
      var summary=document.createElement('div');
      summary.className='erp-reliability-hub-summary';
      summary.innerHTML='<h3>ERP page health rollup</h3>'+modules.map(function(m){
        var x=h[m]||{}; var ok=x.connected!==false;
        return '<div><b>'+(x.page||m.replace(/_html$/,'').replace(/_/g,' '))+'</b><span class="'+(x.pendingChanges?'warn':ok?'ok':'bad')+'">'+(x.pendingChanges?'Unsaved':ok?'OK':'Issue')+'</span><em>'+fmt(x.lastGoodSync||x.updatedAt)+'</em></div>';
      }).join('');
      var grid=document.getElementById('erpReliabilityDetails'); if(grid) grid.insertAdjacentElement('afterend', summary);
    }catch(e){}
  }
  function boot(){
    buildPill(); buildPanel(); installFormWatchers();
    writeHealth({ installed:true, bootedAt:nowIso(), connected:tokenPresent(), recordEstimate:pageRecordEstimate() });
    setTimeout(function(){ saveSnapshot('boot'); renderStatus(); hubEnhance(); }, 1200);
    setInterval(renderStatus, 15000);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
