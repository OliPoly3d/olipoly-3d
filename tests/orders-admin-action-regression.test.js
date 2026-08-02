const assert = require('node:assert/strict');
const fs = require('node:fs');

const orders = fs.readFileSync('orders-admin.html', 'utf8');
const workflowMigration = fs.readFileSync('supabase/migrations/202607200008_workflow_command_authority_parameter_default_compatibility.sql', 'utf8');
const actionMigration = fs.readFileSync('supabase/migrations/202608020009_orders_admin_active_metadata_authority.sql', 'utf8');

const visibleActions = [
  'saveBtn','newBtn','newBtnInline','deleteBtn','prepareInvoiceEmailBtn','sendCompleteEmailBtn','orderStartedEmailBtn','readyPickupEmailBtn','shippedEmailBtn','markInvoiceSentBtn','paymentNotRequiredBtn','financeNotRequiredBtn','completionEmailNotRequiredBtn','generateProfessionalInvoicePdfBtn','generatePackingSlipBtn','generateTravelerPdfBtn','printShippingLabelBtn','printInnerPackLabelBtn','pushFinanceBtn','saveCatalogPartBtn'
];
for (const id of visibleActions) {
  assert.equal((orders.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must exist exactly once in visible markup`);
  assert.match(orders, new RegExp(`bind\\('${id}'[\\s\\S]*?\\)`, 'm'), `${id} must be rebound by the final one-handler action guard`);
}

assert.match(orders, /ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[/, 'ordinary save must use an explicit column allowlist');
const allowlist = orders.match(/ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
for (const editable of ['customer_name','customer_phone','order_title','tracking_number','destination_county','sales_tax_rate','internal_notes']) {
  assert.match(allowlist, new RegExp(`'${editable}'`), `${editable} remains ordinary-editable`);
}
for (const protectedColumn of ['user_id','status','source_quote_number','created_from_quote','accepted_commercial_snapshot','public_status_text','public_next_step','shipping_or_pickup_note','payment_status','paid_date','invoice_number','finance_pushed','finance_pushed_at','updated_at','completion_email_sent','catalog_part_id']) {
  assert.doesNotMatch(allowlist, new RegExp(`'${protectedColumn}'`), `${protectedColumn} must not be part of the ordinary save PATCH payload`);
}
assert.match(orders, /const ordinaryPayload = buildOrdinaryOrderEditPayload\(payload, currentRow\);/, 'saveOrder must call the changed-field allowlist builder');
assert.match(orders, /direct Orders Admin creation is disabled by workflow authority/, 'direct Order creation remains disabled');
assert.doesNotMatch(orders, /body:JSON\.stringify\(\{\s*status:/, 'status must not be directly PATCHed from Orders Admin');
assert.match(orders, /fulfillmentWorkflowRpcRequest\(orderNumber, command/, 'workflow status transitions remain RPC-only');
assert.match(orders, /Pop-up blocked\. Allow pop-ups for this site and try again\./, 'document actions must report blocked popups visibly');
assert.match(orders, /console\.error\('Orders Admin save failed:'/, 'save API errors must be logged actionably');
assert.match(orders, /Completion email sent marker failed:/, 'database-writing action errors must be visible');
assert.match(orders, /Catalog part saved, but linking it to the order failed:/, 'catalog link API errors must be visible');

const metadataMigration = fs.readFileSync('supabase/migrations/202608020009_orders_admin_active_metadata_authority.sql', 'utf8');
const deployedUpdateGrant = metadataMigration.match(/grant update\(([\s\S]*?)\) on public\.orders to authenticated;/i)?.[1] || '';
for (const column of allowlist.match(/'([a-z0-9_]+)'/g).map(s => s.slice(1,-1))) {
  assert.match(deployedUpdateGrant, new RegExp(`\\b${column}\\b`, 'i'), `${column} must match deployed narrow orders UPDATE grants`);
}
for (const protectedColumn of ['user_id','status','source_quote_number','public_status_text','public_next_step','shipping_or_pickup_note']) {
  assert.doesNotMatch(deployedUpdateGrant, new RegExp(`\\b${protectedColumn}\\b`, 'i'), `${protectedColumn} must stay protected in deployed workflow-authority grants`);
}
assert.match(actionMigration, /create policy orders_owner_update_active_metadata[\s\S]*user_id = auth\.uid\(\)[\s\S]*status not in \('closed', 'fulfilled', 'cancelled'\)/i, 'normal Save policy is owner-scoped and active-only');
assert.match(actionMigration, /revoke update\([\s\S]*payment_status[\s\S]*invoice_number[\s\S]*finance_pushed[\s\S]*updated_at[\s\S]*\) on public\.orders from authenticated/i, 'migration revokes protected ordinary-write columns');

console.log('Orders Admin action regression assertions passed.');
