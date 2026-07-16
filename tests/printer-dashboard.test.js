const assert = require('node:assert/strict');
const dashboard = require('../js/printer-dashboard.js');

const jobs = [
  {id:'active-p1', job_title:'Active P1', order_number:'OP-101', production_status:'printing', actual_machine:'P1S', machine_preference:'P2S', print_started_at:'2026-07-16T10:00:00Z', estimated_total_hours:2},
  {id:'next-p1', job_title:'Next P1', quote_number:'Q-202', production_status:'ready_to_print', machine_preference:'P1S', priority:'urgent', manual_rank:2, estimated_hours_each:1.5, quantity:2},
  {id:'later-p1', job_title:'Later P1', production_status:'ready_to_print', machine_preference:'P1S', priority:'normal', manual_rank:3, estimated_total_hours:4},
  {id:'wrong-status', job_title:'QC P1', production_status:'qc', machine_preference:'P1S'},
  {id:'unassigned', job_title:'Either', production_status:'ready_to_print', machine_preference:'either'},
  {id:'missing-eta', job_title:'Active P2', production_status:'printing', machine_preference:'P2S'}
];
const queueOrder = (a, b) => (a.manual_rank || 99) - (b.manual_rank || 99);

const p1 = dashboard.selectPrinterSnapshot(jobs, 'P1S', queueOrder);
assert.equal(p1.current.id, 'active-p1', 'actual assignment takes precedence over preference');
assert.equal(p1.next.id, 'next-p1');
assert.equal(p1.additionalQueued, 1);
assert.equal(dashboard.estimatedDurationHours(p1.next), 3);
assert.equal(dashboard.estimatedFinishAt(p1.current), '2026-07-16T12:00:00.000Z');

const p2 = dashboard.selectPrinterSnapshot(jobs.filter(job => job.id !== 'missing-eta'), 'P2S', queueOrder);
assert.equal(p2.current, null);
assert.equal(p2.next, null);
assert.equal(p2.additionalQueued, 0);
assert.equal(dashboard.estimatedFinishAt(jobs.find(job => job.id === 'missing-eta')), null);
assert.equal(dashboard.estimatedFinishAt({...jobs[0], print_started_at:null}), null);
assert.equal(dashboard.estimatedFinishAt({...jobs[0], estimated_total_hours:0, estimated_hours_each:0}), null);

console.log('Printer dashboard selection, ordering, idle, and ETA assertions passed.');
