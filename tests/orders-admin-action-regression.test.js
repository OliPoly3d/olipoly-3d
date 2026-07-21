const assert = require('node:assert/strict');
const fs = require('node:fs');

const orders = fs.readFileSync('orders-admin.html', 'utf8');
const workflowMigration = fs.readFileSync('supabase/migrations/202607200008_workflow_command_authority_parameter_default_compatibility.sql', 'utf8');
const actionMigration = fs.readFileSync('supabase/migrations/202607210007_reconcile_orders_admin_action_column_privileges.sql', 'utf8');

const visibleActions = [
  'saveBtn','newBtn','newBtnInline','deleteBtn','prepareInvoiceEmailBtn','sendCompleteEmailBtn','orderStartedEmailBtn','readyPickupEmailBtn','shippedEmailBtn','markInvoiceSentBtn','paymentNotRequiredBtn','financeNotRequiredBtn','completionEmailNotRequiredBtn','generateProfessionalInvoicePdfBtn','generatePackingSlipBtn','generateTravelerPdfBtn','printShippingLabelBtn','printInnerPackLabelBtn','pushFinanceBtn','saveCatalogPartBtn'
];
for (const id of visibleActions) {
  assert.equal((orders.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must exist exactly once in visible markup`);
  assert.match(orders, new RegExp(`bind\\('${id}'[\\s\\S]*?\\)`, 'm'), `${id} must be rebound by the final one-handler action guard`);
}

assert.match(orders, /ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[/, 'ordinary save must use an explicit column allowlist');
const allowlist = orders.match(/ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
for (const editable of ['order_number','customer_name','order_title','payment_status','tracking_number','invoice_number','internal_notes','updated_at']) {
  assert.match(allowlist, new RegExp(`'${editable}'`), `${editable} remains ordinary-editable`);
}
for (const protectedColumn of ['user_id','status','source_quote_number','created_from_quote','accepted_commercial_snapshot','public_status_text','public_next_step','shipping_or_pickup_note','finance_pushed','finance_pushed_at','completion_email_sent','catalog_part_id']) {
  assert.doesNotMatch(allowlist, new RegExp(`'${protectedColumn}'`), `${protectedColumn} must not be part of the ordinary save PATCH payload`);
}
assert.match(orders, /const ordinaryPayload = buildOrdinaryOrderEditPayload\(payload\);/, 'saveOrder must call the allowlist builder');
assert.match(orders, /direct Orders Admin creation is disabled by workflow authority/, 'direct Order creation remains disabled');
assert.doesNotMatch(orders, /body:JSON\.stringify\(\{\s*status:/, 'status must not be directly PATCHed from Orders Admin');
assert.match(orders, /fulfillmentWorkflowRpcRequest\(orderNumber, command/, 'workflow status transitions remain RPC-only');
assert.match(orders, /Pop-up blocked\. Allow pop-ups for this site and try again\./, 'document actions must report blocked popups visibly');
assert.match(orders, /console\.error\('Orders Admin save failed:'/, 'save API errors must be logged actionably');
assert.match(orders, /Completion email sent marker failed:/, 'database-writing action errors must be visible');
assert.match(orders, /Catalog part saved, but linking it to the order failed:/, 'catalog link API errors must be visible');

const deployedUpdateGrant = workflowMigration.match(/grant update\(([\s\S]*?)\) on public\.orders to authenticated;/i)?.[1] || '';
for (const column of allowlist.match(/'([a-z0-9_]+)'/g).map(s => s.slice(1,-1))) {
  assert.match(deployedUpdateGrant, new RegExp(`\\b${column}\\b`, 'i'), `${column} must match deployed narrow orders UPDATE grants`);
}
for (const protectedColumn of ['user_id','status','source_quote_number','public_status_text','public_next_step','shipping_or_pickup_note']) {
  assert.doesNotMatch(deployedUpdateGrant, new RegExp(`\\b${protectedColumn}\\b`, 'i'), `${protectedColumn} must stay protected in deployed workflow-authority grants`);
}
assert.match(actionMigration, /grant update\(completion_email_sent, completion_email_sent_at, catalog_part_id\)/i, 'only proven non-workflow action columns get a forward-only grant');
assert.match(actionMigration, /revoke update\(user_id, status, source_quote_number[\s\S]*public_status_text[\s\S]*finance_pushed/i, 'migration preserves protected columns');

console.log('Orders Admin action regression assertions passed.');
