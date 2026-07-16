(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyPrinterDashboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const PRINTERS = ['P1S', 'P2S'];

  function assignedPrinter(job){
    const assigned = job?.actual_machine || job?.machine_preference || '';
    return assigned === 'either' ? '' : assigned;
  }

  function estimatedDurationHours(job){
    const total = Number(job?.estimated_total_hours);
    if(Number.isFinite(total) && total > 0) return total;
    const each = Number(job?.estimated_hours_each);
    const quantity = Number(job?.quantity) || 1;
    return Number.isFinite(each) && each > 0 ? each * quantity : null;
  }

  function estimatedFinishAt(job){
    const startedAt = Date.parse(job?.print_started_at || '');
    const hours = estimatedDurationHours(job);
    if(!Number.isFinite(startedAt) || !hours) return null;
    return new Date(startedAt + hours * 3600000).toISOString();
  }

  function selectPrinterSnapshot(jobs, printer, compareJobs){
    const assigned = (jobs || []).filter(job => assignedPrinter(job) === printer);
    const printing = assigned.filter(job => job.production_status === 'printing');
    const queued = assigned.filter(job => job.production_status === 'ready_to_print');
    if(typeof compareJobs === 'function'){
      printing.sort(compareJobs);
      queued.sort(compareJobs);
    }
    return {
      printer,
      current: printing[0] || null,
      next: queued[0] || null,
      additionalQueued: Math.max(0, queued.length - 1)
    };
  }

  return {PRINTERS, assignedPrinter, estimatedDurationHours, estimatedFinishAt, selectPrinterSnapshot};
});
