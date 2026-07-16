const assert = require('node:assert/strict');
const fs = require('node:fs');
const workflow = require('../js/workflow-status.js');

assert.deepEqual(workflow.POST_ACCEPTANCE_STATUSES, [
  'ready_to_print', 'printing', 'qc', 'ready_for_fulfillment', 'closed'
]);
assert.deepEqual(workflow.PRODUCTION_PRE_ORDER_STATUSES, ['estimate', 'waiting_customer']);
assert.equal(workflow.normalizeOrderStatus('quote_sent'), 'ready_to_print');
assert.equal(workflow.normalizeOrderStatus('awaiting_approval'), 'ready_to_print');
assert.equal(workflow.normalizeOrderStatus('in_production'), 'printing');
assert.equal(workflow.normalizeOrderStatus('post_processing'), 'qc');
assert.equal(workflow.normalizeOrderStatus('ready_for_pickup'), 'ready_for_fulfillment');
assert.equal(workflow.normalizeOrderStatus('completed'), 'closed');

const orders = fs.readFileSync(require.resolve('../orders-admin.html'), 'utf8');
const statusSelects = [...orders.matchAll(/<select id="(?:statusFilter|status)"[\s\S]*?<\/select>/g)].map(x => x[0]);
assert.equal(statusSelects.length, 2);
for(const html of statusSelects){
  for(const status of workflow.POST_ACCEPTANCE_STATUSES) assert.match(html, new RegExp(`value="${status}"`));
  for(const legacy of ['estimate','waiting_customer','waiting_for_quote_approval','quote_pending','draft_quote','quoted','quote_sent','awaiting_approval']){
    assert.doesNotMatch(html, new RegExp(`value="${legacy}"`));
  }
}

const production = fs.readFileSync(require.resolve('../production-control.html'), 'utf8');
const quote = fs.readFileSync(require.resolve('../quote.js'), 'utf8');
assert.match(production, /Estimate[\s\S]*Push to Quote/);
assert.match(production, /production_status: 'waiting_customer'/);
assert.match(quote, /production_status: 'ready_to_print'/);
assert.match(production, /data-complete-print=/);
assert.match(production, /data-status="\$\{j\.id\}\|ready_for_fulfillment"[^>]*>Pass/);
assert.match(production, /data-status="\$\{j\.id\}\|ready_to_print"[^>]*>Needs Reprint/);
assert.match(production, /data-status="\$\{j\.id\}\|closed"[^>]*>Fulfilled \/ Close/);
assert.match(production, /const RESERVABLE_STATUSES = \['ready_to_print','printing','qc'\]/);

assert.match(quote, /status: 'ready_to_print'/);
assert.match(quote, /production_status: 'ready_to_print'/);
console.log('Production workflow assertions passed.');
