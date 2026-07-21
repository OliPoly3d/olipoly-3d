(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const POST_ACCEPTANCE_STATUSES = Object.freeze([
    'ready_to_print', 'printing', 'qc', 'ready_for_fulfillment', 'closed'
  ]);
  const PRODUCTION_PRE_ORDER_STATUSES = Object.freeze(['estimate', 'waiting_customer']);
  const ORDER_STATUS_LABELS = Object.freeze({
    ready_to_print:'Ready to Print',
    printing:'Printing',
    qc:'QC / Finishing',
    ready_for_fulfillment:'Ready for Pickup / Shipment',
    closed:'Closed'
  });
  const PRE_ACCEPTANCE_STATUSES = new Set([
    'estimate', 'waiting_customer', 'waiting_for_customer', 'waiting_for_quote_approval',
    'quote_pending', 'draft_quote', 'quoted', 'quote_sent', 'quote_accepted',
    'awaiting_approval', 'awaiting_deposit', 'awaiting_production', 'in_design',
    'awaiting_design', 'idea'
  ]);
  const LEGACY_ORDER_STATUS_MAP = Object.freeze({
    ready_to_print:'ready_to_print', queued:'ready_to_print', scheduled:'ready_to_print',
    quote_sent:'ready_to_print', awaiting_approval:'ready_to_print', awaiting_deposit:'ready_to_print',
    awaiting_production:'ready_to_print', in_design:'ready_to_print', awaiting_design:'ready_to_print',
    estimate:'ready_to_print', waiting_customer:'ready_to_print', waiting_for_customer:'ready_to_print',
    waiting_for_quote_approval:'ready_to_print', quote_pending:'ready_to_print', draft_quote:'ready_to_print',
    quoted:'ready_to_print', quote_accepted:'ready_to_print', idea:'ready_to_print',
    printing:'printing', in_production:'printing',
    qc:'qc', post_processing:'qc', production_complete:'qc', qc_complete:'qc',
    ready_for_fulfillment:'ready_for_fulfillment', ready:'ready_for_fulfillment',
    ready_for_pickup:'ready_for_fulfillment', awaiting_pickup:'ready_for_fulfillment',
    delivery_scheduled:'ready_for_fulfillment', shipped:'ready_for_fulfillment', delivered:'ready_for_fulfillment',
    closed:'closed', completed:'closed', production_closed:'closed',
    canceled:'closed', cancelled:'closed', archived:'closed', void:'closed', failed_scrap:'ready_to_print',
    on_hold:'ready_to_print', issue_review:'qc'
  });

  function normalizeOrderStatus(value){
    return LEGACY_ORDER_STATUS_MAP[String(value || '').trim().toLowerCase()] || 'ready_to_print';
  }
  function isPreAcceptanceStatus(value){
    return PRE_ACCEPTANCE_STATUSES.has(String(value || '').trim().toLowerCase());
  }
  function orderStatusLabel(value){
    const status = normalizeOrderStatus(value);
    return ORDER_STATUS_LABELS[status];
  }
  function isPostAcceptanceStatus(value){
    return POST_ACCEPTANCE_STATUSES.includes(String(value || '').trim().toLowerCase());
  }
  function transitionDirection(from, to){
    const fromIndex = POST_ACCEPTANCE_STATUSES.indexOf(normalizeOrderStatus(from));
    const toIndex = POST_ACCEPTANCE_STATUSES.indexOf(normalizeOrderStatus(to));
    return toIndex < fromIndex ? 'backward' : toIndex > fromIndex ? 'forward' : 'same';
  }
  function backwardMoveWarning(from, to){
    if(transitionDirection(from, to) !== 'backward') return '';
    return 'This moves manufacturing backward. Production attempts, actual usage, scrap, and consumed inventory will be preserved; reservations and consumption will not be recreated or reversed automatically. Continue?';
  }
  function commandIdentity(scope, orderNumber, command, expectedUpdatedAt){
    if(!globalThis.localStorage) return `${scope}:${orderNumber}:${command}:${expectedUpdatedAt}`;
    const key = `olipoly_workflow_command:${scope}:${orderNumber}:${command}:${expectedUpdatedAt}`;
    let value = globalThis.localStorage.getItem(key);
    if(!value){
      value = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
      globalThis.localStorage.setItem(key, value);
    }
    return value;
  }
  function clearCommandIdentity(scope, orderNumber, command, expectedUpdatedAt){
    if(!globalThis.localStorage) return;
    globalThis.localStorage.removeItem(`olipoly_workflow_command:${scope}:${orderNumber}:${command}:${expectedUpdatedAt}`);
  }
  function inventoryConsumptionRpcRequest(job, command, expectedUpdatedAt, rollUsages, attempt){
    if(!job?.id) throw new Error('A Production job id is required for Inventory consumption.');
    if(!expectedUpdatedAt) throw new Error('Refresh before consuming Inventory; expected_updated_at is required.');
    const normalizedCommand = String(command || '').trim().toLowerCase();
    if(!['pass_qc','needs_reprint'].includes(normalizedCommand)) throw new Error('Inventory consumption is only allowed for QC Pass or Needs Reprint.');
    const attemptId = attempt?.id || job.current_attempt_id;
    if(!attemptId) throw new Error('A completed Production attempt id is required for Inventory consumption.');
    return {
      path:'/rest/v1/rpc/consume_production_attempt',
      body:{
        p_production_job_id:String(job.id),
        p_attempt_id:String(attemptId),
        p_correlation_id:commandIdentity('inventory-consumption', String(job.id), normalizedCommand, expectedUpdatedAt),
        p_expected_updated_at:expectedUpdatedAt,
        p_roll_usages:Array.isArray(rollUsages) ? rollUsages : [],
        p_workflow_command:normalizedCommand
      }
    };
  }

  function productionWorkflowRpcRequest(orderNumber, command, expectedUpdatedAt, payload){
    if(!orderNumber) throw new Error('A linked Order number is required.');
    if(!expectedUpdatedAt) throw new Error('Refresh before changing workflow status; expected_updated_at is required.');
    return {
      path:'/rest/v1/rpc/production_workflow_command',
      body:{
        p_order_number:String(orderNumber).trim(),
        p_command:String(command).trim().toLowerCase(),
        p_expected_updated_at:expectedUpdatedAt,
        p_payload:payload || {},
        p_correlation_id:commandIdentity('production', String(orderNumber).trim(), String(command).trim().toLowerCase(), expectedUpdatedAt),
        p_causation_id:null
      }
    };
  }
  function fulfillmentWorkflowRpcRequest(orderNumber, command, expectedUpdatedAt, payload){
    if(!orderNumber) throw new Error('A linked Order number is required.');
    if(!expectedUpdatedAt) throw new Error('Refresh before changing workflow status; expected_updated_at is required.');
    return {
      path:'/rest/v1/rpc/fulfillment_workflow_command',
      body:{
        p_order_number:String(orderNumber).trim(),
        p_command:String(command).trim().toLowerCase(),
        p_expected_updated_at:expectedUpdatedAt,
        p_payload:payload || {},
        p_correlation_id:commandIdentity('fulfillment', String(orderNumber).trim(), String(command).trim().toLowerCase(), expectedUpdatedAt),
        p_causation_id:null
      }
    };
  }
  function preAcceptanceProductionRpcRequest(jobId, command, expectedUpdatedAt, payload){
    if(!jobId) throw new Error('A Production job id is required.');
    if(!expectedUpdatedAt) throw new Error('Refresh before changing pre-acceptance Production state; expected_updated_at is required.');
    return {
      path:'/rest/v1/rpc/preacceptance_production_command',
      body:{
        p_job_id:String(jobId),
        p_command:String(command).trim().toLowerCase(),
        p_expected_updated_at:expectedUpdatedAt,
        p_payload:payload || {},
        p_correlation_id:commandIdentity('preacceptance-production', String(jobId), String(command).trim().toLowerCase(), expectedUpdatedAt),
        p_causation_id:null
      }
    };
  }
  return Object.freeze({
    POST_ACCEPTANCE_STATUSES, PRODUCTION_PRE_ORDER_STATUSES, ORDER_STATUS_LABELS,
    LEGACY_ORDER_STATUS_MAP, normalizeOrderStatus, isPreAcceptanceStatus,
    isPostAcceptanceStatus, transitionDirection, backwardMoveWarning,
    productionWorkflowRpcRequest, inventoryConsumptionRpcRequest, fulfillmentWorkflowRpcRequest, preAcceptanceProductionRpcRequest, clearCommandIdentity, orderStatusLabel
  });
});
