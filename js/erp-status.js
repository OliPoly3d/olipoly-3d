(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const PRODUCTION_ALIASES = Object.freeze({
    idea:'estimate', draft:'estimate', estimate:'estimate',
    waiting_customer:'waiting_customer', waiting_for_customer:'waiting_customer', waiting_for_quote_approval:'waiting_customer',
    quote_sent:'waiting_customer', quote_pending:'waiting_customer', draft_quote:'waiting_customer', quoted:'waiting_customer',
    ready_to_print:'ready_to_print', queued:'ready_to_print', scheduled:'ready_to_print', failed_scrap:'ready_to_print',
    printing:'printing', in_production:'printing',
    qc:'qc', qc_finishing:'qc', post_processing:'qc', production_complete:'qc', qc_complete:'qc',
    ready_for_fulfillment:'ready_for_fulfillment', ready_for_pickup:'ready_for_fulfillment',
    ready_for_shipment:'ready_for_fulfillment', awaiting_pickup:'ready_for_fulfillment', ready:'ready_for_fulfillment',
    closed:'closed', completed:'closed', fulfilled:'closed', production_closed:'closed',
    canceled:'canceled', cancelled:'canceled', void:'canceled'
  });
  const ORDER_ALIASES = Object.freeze({
    ...PRODUCTION_ALIASES,
    estimate:'ready_to_print', idea:'ready_to_print', waiting_customer:'ready_to_print', waiting_for_customer:'ready_to_print',
    quote_sent:'ready_to_print', quote_accepted:'ready_to_print', awaiting_approval:'ready_to_print', awaiting_deposit:'ready_to_print',
    awaiting_production:'ready_to_print', in_design:'ready_to_print', awaiting_design:'ready_to_print',
    shipped:'ready_for_fulfillment', delivered:'ready_for_fulfillment', delivery_scheduled:'ready_for_fulfillment',
    archived:'closed', issue_review:'qc', on_hold:'ready_to_print'
  });
  const PRODUCTION_LABELS = Object.freeze({
    estimate:'Estimate', waiting_customer:'Waiting for Customer', ready_to_print:'Ready to Print', printing:'Printing',
    qc:'QC / Finishing', ready_for_fulfillment:'Ready for Pickup / Shipment', closed:'Closed', canceled:'Canceled'
  });
  const ORDER_LABELS = Object.freeze({
    ready_to_print:'Ready to Print', printing:'Printing', qc:'QC / Finishing',
    ready_for_fulfillment:'Ready for Pickup / Shipment', closed:'Closed', canceled:'Canceled'
  });
  const QUOTE_ALIASES = Object.freeze({
    draft:'draft', pending:'draft', quote_pending:'draft', estimate:'draft',
    sent:'sent', quote_sent:'sent', waiting_customer:'sent', waiting_for_customer:'sent',
    accepted:'accepted', approved:'accepted', quote_accepted:'accepted',
    declined:'declined', rejected:'declined', expired:'expired',
    canceled:'canceled', cancelled:'canceled', void:'canceled',
    converted:'converted_to_order', converted_to_order:'converted_to_order',
    closed:'converted_to_order', archived:'converted_to_order', completed:'converted_to_order', complete:'converted_to_order',
    revised:'draft'
  });
  const QUOTE_LABELS = Object.freeze({
    draft:'Draft', sent:'Sent', accepted:'Accepted', declined:'Declined', converted_to_order:'Converted to Order',
    expired:'Expired', canceled:'Canceled'
  });

  const key = value => String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_');
  function normalizeProductionStatus(value){ return PRODUCTION_ALIASES[key(value)] || 'estimate'; }
  function productionStatusFromRecord(row){
    if(row && row.production_status != null && String(row.production_status).trim()) return normalizeProductionStatus(row.production_status);
    return normalizeProductionStatus(row?.job_status ?? row?.job_payload?.production_status ?? row?.job_payload?.status);
  }
  function productionStatusLabel(value){ return PRODUCTION_LABELS[normalizeProductionStatus(value)]; }
  function normalizeOrderStatus(value){ return ORDER_ALIASES[key(value)] || 'ready_to_print'; }
  function orderStatusFromRecord(row){ return normalizeOrderStatus(row?.status); }
  function orderStatusLabel(value){ return ORDER_LABELS[normalizeOrderStatus(value)]; }
  function quoteStateFromRecord(row){
    const converted = row?.converted_to_order === true || !!row?.converted_order_number;
    const response = QUOTE_ALIASES[key(row?.customer_response)] || null;
    const quoteStatus = QUOTE_ALIASES[key(row?.quote_status)] || 'draft';
    return Object.freeze({ quoteStatus, customerResponse:response, converted, displayStatus:converted ? 'converted_to_order' : (response || quoteStatus) });
  }
  function quoteStatusLabel(value){ return QUOTE_LABELS[key(value)] || QUOTE_LABELS.draft; }

  return Object.freeze({
    PRODUCTION_ALIASES, ORDER_ALIASES, PRODUCTION_LABELS, ORDER_LABELS, QUOTE_ALIASES, QUOTE_LABELS,
    normalizeProductionStatus, productionStatusFromRecord, productionStatusLabel,
    normalizeOrderStatus, orderStatusFromRecord, orderStatusLabel, quoteStateFromRecord, quoteStatusLabel
  });
});
