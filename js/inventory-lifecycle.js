(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyInventoryLifecycle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const RESERVATION_STATUSES = Object.freeze(['ready_to_print', 'printing', 'qc']);
  const RELEASE_STATUSES = Object.freeze(['estimate', 'waiting_customer', 'qc', 'ready_for_fulfillment', 'closed', 'canceled', 'void']);

  function normalize(value){ return String(value == null ? '' : value).trim().toLowerCase(); }
  function shouldReserve(status){ return RESERVATION_STATUSES.includes(normalize(status)); }
  function reservationAction(fromStatus, toStatus){
    const from = normalize(fromStatus);
    const to = normalize(toStatus);
    // Reopening consumed work is a workflow correction, not a new attempt.
    if(['ready_for_fulfillment', 'closed'].includes(from) && shouldReserve(to)) return 'preserve_consumed_no_reserve';
    if(to === 'ready_to_print' && from === 'qc') return 'consume_and_reserve_reprint';
    if(to === 'ready_for_fulfillment' && from === 'qc') return 'consume_and_release';
    if(to === 'qc' && from === 'printing') return 'capture_actuals_keep_reservation';
    if(shouldReserve(to)) return shouldReserve(from) ? 'keep' : 'reserve';
    if(RELEASE_STATUSES.includes(to)) return 'release';
    return 'release';
  }
  function activeReservations(job){
    if(!job || !shouldReserve(job.production_status)) return [];
    return Array.isArray(job.material_reservations) ? job.material_reservations : [];
  }
  function attemptKey(job){
    if(!job) return '';
    return String(job.current_attempt_id || job.actuals_captured_at || '');
  }
  function attemptAlreadyConsumed(job){
    const key = attemptKey(job);
    return !!key && (Array.isArray(job.production_attempts) ? job.production_attempts : [])
      .some(attempt => String(attempt.id) === key && !!attempt.consumed_at);
  }

  return Object.freeze({
    RESERVATION_STATUSES,
    RELEASE_STATUSES,
    shouldReserve,
    reservationAction,
    activeReservations,
    attemptKey,
    attemptAlreadyConsumed
  });
});
