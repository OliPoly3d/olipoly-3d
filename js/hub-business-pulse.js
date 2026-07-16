(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyHubPulse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const ACTIVE_STATUSES = ['waiting_for_customer','ready_to_print','printing','qc','ready_for_fulfillment'];
  const STATUS_ALIASES = {
    quote_sent:'waiting_for_customer', awaiting_approval:'waiting_for_customer', waiting_customer:'waiting_for_customer',
    post_processing:'qc', finishing:'qc', ready_for_pickup:'ready_for_fulfillment', ready_for_shipment:'ready_for_fulfillment',
    completed:'closed'
  };
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const day = value => String(value || '').slice(0, 10);
  const statusOf = row => STATUS_ALIASES[row?.production_status || row?.status] || row?.production_status || row?.status || 'estimate';
  const recordKey = row => row?.id || row?.order_id || row?.order_number || row?.quote_number || row?.job_id;
  const recordLabel = row => row?.order_number || row?.quote_number || row?.job_number || row?.job_title || row?.title || 'Record';
  const deepLink = (page, row) => `${page}?search=${encodeURIComponent(recordLabel(row))}`;
  const dateValue = row => row?.due_date || row?.target_date || row?.estimated_finish_at || row?.invoice_due_date;

  function unique(rows){
    const seen = new Set();
    return (rows || []).filter(row => { const key = recordKey(row); if(!key || seen.has(key)) return false; seen.add(key); return true; });
  }

  function workflowCounts(rows, today){
    const counts = Object.fromEntries(ACTIVE_STATUSES.map(status => [status, 0]));
    counts.closed_today = 0;
    unique(rows).forEach(row => {
      const status = statusOf(row);
      if(Object.hasOwn(counts, status)) counts[status] += 1;
      if(status === 'closed' && day(row.closed_at || row.completed_at || row.updated_at) === today) counts.closed_today += 1;
    });
    return counts;
  }

  function reservationSnapshot(jobs, inventory){
    const active = unique(jobs).filter(job => ['ready_to_print','printing','qc'].includes(statusOf(job)));
    let reservedGrams = 0;
    const shortageJobs = [];
    active.forEach(job => {
      const reservations = Array.isArray(job.material_reservations) ? job.material_reservations : [];
      reservations.forEach(row => { reservedGrams += number(row.grams_reserved); });
      const required = number(job.estimated_total_grams || job.total_grams_required || job.estimated_grams);
      const reserved = reservations.reduce((sum, row) => sum + number(row.grams_reserved), 0);
      if(reservations.some(row => row.shortage) || number(job.reservation_shortage_grams) > 0 || (required > 0 && reserved < required)) shortageJobs.push(job);
    });
    const belowReorder = (inventory || []).filter(row => {
      const remaining = number(row.remaining_grams ?? row.remaining ?? row.available_grams);
      const threshold = number(row.reorder_threshold_grams ?? row.reorder_threshold);
      return threshold > 0 && remaining <= threshold && row.reorder_policy !== 'discontinued';
    });
    return {reservedGrams, belowReorder, shortageJobs:unique(shortageJobs)};
  }

  function outstandingBalance(row){
    if(['paid','refunded'].includes(row?.payment_status)) return 0;
    const total = number(row?.balance_amount || row?.order_total || row?.total_amount || row?.totals_snapshot?.total);
    return Math.max(0, total - number(row?.deposit_paid_amount));
  }

  function moneySnapshot(orders, finance, today){
    const rows = unique(orders);
    const unpaidAcceptedTotal = rows.filter(row => statusOf(row) !== 'closed').reduce((sum, row) => sum + outstandingBalance(row), 0);
    const depositsDue = rows.filter(row => row.payment_status === 'deposit_due').reduce((sum, row) => sum + number(row.deposit_amount || row.deposit_due_amount), 0);
    const overdueInvoices = rows.filter(row => row.customer_type === 'business' && row.invoice_due_date && day(row.invoice_due_date) < today && !['paid','refunded'].includes(row.payment_status));
    const paidTodayRows = rows.filter(row => row.payment_status === 'paid' && day(row.paid_at || row.paid_date || row.updated_at) === today);
    const paidToday = paidTodayRows.length
      ? paidTodayRows.reduce((sum, row) => sum + number(row.order_total || row.total_amount || row.totals_snapshot?.total), 0)
      : number(finance?.todayRevenue);
    return {unpaidAcceptedTotal, depositsDue, overdueInvoices, paidToday, paidTodayAvailable:paidTodayRows.length > 0 || finance?.todayRevenue != null};
  }

  function attentionItems(jobs, orders, inventorySnapshot, today){
    const now = Date.parse(`${today}T00:00:00Z`);
    const items = [];
    const add = (priority, kind, title, detail, href) => items.push({priority, kind, title, detail, href});
    unique([...(orders || []), ...(jobs || [])]).forEach(row => {
      const status = statusOf(row); const label = recordLabel(row); const due = Date.parse(`${day(dateValue(row))}T00:00:00Z`);
      if(Number.isFinite(due) && !['closed','canceled'].includes(status)) {
        const days = Math.ceil((due - now) / 86400000);
        if(days < 0) add(100, 'danger', `${label} is overdue`, `${Math.abs(days)} day(s) past due.`, deepLink(status === 'waiting_for_customer' ? 'quote.html' : 'orders-admin.html', row));
        else if(days <= 2) add(85, 'warn', `${label} is due soon`, `Due in ${days} day(s).`, deepLink('orders-admin.html', row));
      }
      const waitingSince = Date.parse(row.quote_sent_at || row.status_changed_at || row.updated_at || '');
      if(status === 'waiting_for_customer' && Number.isFinite(waitingSince) && now - waitingSince >= 7 * 86400000) add(75, 'warn', `${label} needs quote follow-up`, 'Waiting at least 7 days for customer response.', deepLink('quote.html', row));
      if(['failed','failed_scrap','needs_reprint'].includes(row.production_status)) add(95, 'danger', `${label} needs reprint review`, 'Failed or reprint work needs production action.', deepLink('production-control.html', row));
      if(status === 'qc') add(70, 'warn', `${label} is waiting for QC`, 'Complete finishing and quality review.', deepLink('production-control.html', row));
      if(status === 'ready_for_fulfillment' && Number.isFinite(waitingSince) && now - waitingSince >= 2 * 86400000) add(65, 'warn', `${label} is awaiting fulfillment`, 'Ready for pickup or shipment for at least 2 days.', deepLink('orders-admin.html', row));
      if(status !== 'closed' && !row.po_number && row.customer_type === 'business') add(80, 'warn', `${label} is missing a PO`, 'Business order needs purchasing information.', deepLink('orders-admin.html', row));
      if(status !== 'closed' && row.payment_status === 'deposit_due') add(80, 'warn', `${label} is blocked by deposit`, 'Required deposit has not been recorded.', deepLink('orders-admin.html', row));
    });
    inventorySnapshot.shortageJobs.forEach(row => add(90, 'danger', `${recordLabel(row)} has an inventory shortage`, 'Reservation is missing or insufficient.', deepLink('inventory-control.html', row)));
    return items.sort((a,b) => b.priority - a.priority || a.title.localeCompare(b.title)).slice(0, 12);
  }

  function build(input){
    const today = input?.today || new Date().toISOString().slice(0,10);
    const jobs = unique(input?.jobs || []); const orders = unique(input?.orders?.length ? input.orders : jobs.filter(row => row.order_number));
    const inventory = reservationSnapshot(jobs, input?.inventory || []);
    return {counts:workflowCounts(jobs, today), inventory, money:moneySnapshot(orders, input?.finance || {}, today), attention:attentionItems(jobs, orders, inventory, today)};
  }

  return {statusOf, unique, workflowCounts, reservationSnapshot, moneySnapshot, attentionItems, build, deepLink};
});
