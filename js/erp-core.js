/* OliPoly ERP Core Hardening Layer
   Adds shared toast, safe storage helpers, lightweight cloud/error telemetry, and a mobile dock helper.
   It is intentionally defensive and does not depend on page-specific code. */
(function(){
  'use strict';
  if (window.OliPolyERP) return;

  const ERP = {
    version: '2026.06.08-core-hardening',
    page: (location.pathname.split('/').pop() || 'index.html').toLowerCase(),
    startedAt: new Date().toISOString(),
    memory: new Map()
  };

  function ensureToastStack(){
    let stack = document.querySelector('.erp-toast-stack');
    if (!stack){
      stack = document.createElement('div');
      stack.className = 'erp-toast-stack';
      stack.setAttribute('aria-live','polite');
      stack.setAttribute('aria-relevant','additions');
      document.body.appendChild(stack);
    }
    return stack;
  }

  ERP.toast = function(message, options){
    options = options || {};
    const type = options.type || 'info';
    const title = options.title || (type === 'error' ? 'Needs attention' : type === 'success' ? 'Done' : type === 'warning' ? 'Check this' : 'OliPoly ERP');
    const timeout = Number.isFinite(options.timeout) ? options.timeout : (type === 'error' ? 9000 : 4200);
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = 'erp-toast';
    toast.dataset.type = type;
    toast.innerHTML = '<div><strong></strong><span></span></div><button type="button" aria-label="Dismiss">×</button>';
    toast.querySelector('strong').textContent = title;
    toast.querySelector('span').textContent = String(message || '');
    const remove = () => toast.remove();
    toast.querySelector('button').addEventListener('click', remove);
    stack.appendChild(toast);
    if (timeout > 0) setTimeout(remove, timeout);
    return toast;
  };

  ERP.storage = {
    get(key, fallback){
      try{
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      }catch(err){
        console.warn('[OliPolyERP] localStorage get failed', key, err);
        return fallback;
      }
    },
    set(key, value){
      try{
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      }catch(err){
        console.warn('[OliPolyERP] localStorage set failed', key, err);
        ERP.memory.set(key, value);
        ERP.toast('Browser storage is full or blocked. This page will keep a temporary copy until refresh.', {type:'warning', timeout:7000});
        return false;
      }
    },
    remove(key){
      try{ localStorage.removeItem(key); }catch(err){ console.warn('[OliPolyERP] localStorage remove failed', key, err); }
      ERP.memory.delete(key);
    }
  };

  ERP.safeJson = function(value, fallback){
    if (value == null || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try{return JSON.parse(value);}catch{return fallback;}
  };

  ERP.money = function(value){
    const n = Number(value || 0);
    return n.toLocaleString(undefined,{style:'currency', currency:'USD'});
  };

  ERP.dateAgeDays = function(value){
    if(!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  };

  ERP.showCloudStatus = function(message, type){
    let box = document.querySelector('.erp-cloud-status');
    if (!box){
      box = document.createElement('div');
      box.className = 'erp-cloud-status';
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.dataset.type = type || 'info';
    box.classList.add('show');
    clearTimeout(box._erpTimer);
    box._erpTimer = setTimeout(()=>box.classList.remove('show'), 6500);
  };

  ERP.installMobileDock = function(items){
    if (!Array.isArray(items) || !items.length || document.querySelector('.erp-mobile-dock')) return;
    const dock = document.createElement('nav');
    dock.className = 'erp-mobile-dock';
    dock.setAttribute('aria-label','ERP mobile shortcuts');
    items.slice(0,5).forEach(item => {
      const a = document.createElement(item.onClick ? 'button' : 'a');
      if (item.href) a.href = item.href;
      if (item.onClick) a.addEventListener('click', item.onClick);
      a.innerHTML = '<span class="ico"></span><span></span>';
      a.querySelector('.ico').textContent = item.icon || '•';
      a.querySelector('span:last-child').textContent = item.label || 'Open';
      dock.appendChild(a);
    });
    document.body.classList.add('erp-has-mobile-dock');
    document.body.appendChild(dock);
  };

  ERP.installDefaultInternalDock = function(){
    const internalPages = ['hub.html','production-control.html','inventory-control.html','orders-admin.html','quote.html','finance-pro.html'];
    if (!internalPages.includes(ERP.page)) return;
    ERP.installMobileDock([
      {label:'Hub', icon:'⌂', href:'hub.html'},
      {label:'Prod', icon:'▦', href:'production-control.html'},
      {label:'Inv', icon:'◈', href:'inventory-control.html'},
      {label:'Orders', icon:'✓', href:'orders-admin.html'},
      {label:'Quote', icon:'$', href:'quote.html'}
    ]);
  };

  ERP.markReady = function(){
    document.documentElement.dataset.erpCoreReady = 'true';
    window.dispatchEvent(new CustomEvent('olipoly:erp-ready', {detail:{version:ERP.version, page:ERP.page}}));
  };

  window.addEventListener('error', function(event){
    const msg = event && event.message ? event.message : 'Unknown script error';
    if (/ResizeObserver loop|Script error/i.test(msg)) return;
    console.warn('[OliPolyERP] captured error:', msg);
    ERP.showCloudStatus('ERP noticed a page error. Check Console if something looks stuck.', 'error');
  });

  window.addEventListener('unhandledrejection', function(event){
    const reason = event && event.reason ? (event.reason.message || String(event.reason)) : 'Promise failed';
    console.warn('[OliPolyERP] captured promise rejection:', reason);
    if (/fetch|supabase|network|Failed to fetch|JWT|auth/i.test(reason)){
      ERP.showCloudStatus('Cloud/auth request failed. Refresh or sign in again if data does not load.', 'warning');
    }
  });

  document.addEventListener('DOMContentLoaded', function(){
    ERP.installDefaultInternalDock();
    ERP.markReady();
  });

  window.OliPolyERP = ERP;
})();
