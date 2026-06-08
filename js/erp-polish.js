/* OliPoly ERP polish compatibility file.
   Kept minimal so it cannot hijack page-specific login/save buttons. */
(function(){
  'use strict';
  if(window.OliPolyERPPolish) return;
  window.OliPolyERPPolish = {version:'2026.06.08-repair'};
  document.addEventListener('DOMContentLoaded', function(){
    document.documentElement.dataset.erpPolishReady = 'true';
  });
})();
