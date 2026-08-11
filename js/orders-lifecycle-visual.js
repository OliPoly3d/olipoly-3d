(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyOrdersLifecycleVisual = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const steps = Object.freeze(['ready_to_print', 'printing', 'qc', 'ready_for_fulfillment', 'closed']);

  function state(value, normalize = current => current) {
    const normalized = normalize(value);
    if (normalized === 'canceled') return { normalized, active: 'canceled', completed: [] };
    const active = steps.includes(normalized) ? normalized : 'ready_to_print';
    return { normalized, active, completed: steps.slice(0, steps.indexOf(active)) };
  }

  return Object.freeze({ steps, state });
}));
