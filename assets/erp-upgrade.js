/* OliPoly upgrade compatibility layer.
   Defensive only: no global styling or button overrides. */
(function(){
  'use strict';
  if(window.OliPolyUpgradeCompat) return;
  window.OliPolyUpgradeCompat = {version:'2026.06.08-repair'};
  document.addEventListener('DOMContentLoaded', function(){
    document.documentElement.dataset.olipolyUpgradeCompat = 'true';
  });
})();
