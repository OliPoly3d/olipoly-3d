(function(root, factory){
  const api = factory(root.OliPolyWorkflow);
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyCustomer360 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(workflow){
  const clean = value => String(value == null ? '' : value).trim();
  const text = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const email = value => text(value);
  const phone = value => clean(value).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const name = value => text(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const company = value => name(value);
  const customerId = row => clean(row.customer_id || row.customerId || row.client_id);
  const customerName = row => clean(row.customer_name || row.customerName || row.contact_name || row.contactName);
  const customerEmail = row => clean(row.customer_email || row.customerEmail || row.email);
  const customerPhone = row => clean(row.customer_phone || row.customerPhone || row.phone);
  const customerCompany = row => clean(row.company_name || row.companyName || row.shipping_company || row.company);

  function identity(row={}){
    return {id:customerId(row), email:email(customerEmail(row)), phone:phone(customerPhone(row)), company:company(customerCompany(row)), contact:name(customerName(row)), name:name(customerName(row))};
  }
  function match(a, b){
    const x=identity(a), y=identity(b);
    if(x.id && y.id) return x.id === y.id;
    if(x.email && y.email) return x.email === y.email;
    if(x.phone && y.phone) return x.phone === y.phone;
    if(x.company && y.company && x.contact && y.contact) return x.company === y.company && x.contact === y.contact;
    return !!(x.name && y.name && x.name === y.name);
  }
  function recordKey(row, type){
    const keys = type === 'quote' ? [row.id,row.quote_number,row.quoteNumber] : type === 'order' ? [row.id,row.order_number] : type === 'job' ? [row.id,row.order_number,row.quote_number] : [row.id, row.event_type, row.created_at];
    return type + ':' + clean(keys.find(Boolean));
  }
  function dedupe(rows=[], type){
    const map=new Map();
    rows.forEach(row=>{ const key=recordKey(row,type); if(key !== type+':') map.set(key,{...(map.get(key)||{}),...row}); });
    return [...map.values()];
  }
  const amount = row => Number(row.order_total ?? row.quote_total ?? row.quoteTotal ?? row.customer_totals?.final_total ?? row.quoteData?.customer_totals?.final_total ?? 0) || 0;
  function paidAmount(row){
    if(row.payment_status === 'paid') return amount(row);
    return Math.max(0, Number(row.amount_paid ?? row.paid_amount ?? (row.payment_status === 'deposit_paid' ? row.deposit_amount : 0)) || 0);
  }
  function status(row){ return clean(row.production_status || row.status || 'ready_to_print').toLowerCase(); }
  function completed(row){ return ['closed','completed','cancelled','canceled','archived','void'].includes(status(row)); }
  function active(row){ return !completed(row); }
  function deepLink(page, row={}){
    const key=clean(row.order_number || row.converted_order_number || row.quote_number || row.quoteNumber || row.id);
    return page + (key ? '?search='+encodeURIComponent(key) : '');
  }
  function quoteOrderLink(quote, orders=[]){
    const number=clean(quote.converted_order_number);
    const linked=orders.find(o=>number ? clean(o.order_number)===number : clean(o.source_quote_number || o.quote_number)===clean(quote.quote_number || quote.quoteNumber));
    return linked ? deepLink('orders-admin.html',linked) : '';
  }
  function financialSummary(orders=[]){
    const accepted=dedupe(orders,'order');
    const total=accepted.reduce((sum,row)=>sum+amount(row),0);
    const paid=accepted.reduce((sum,row)=>sum+Math.min(amount(row),paidAmount(row)),0);
    const outstanding=Math.max(0,total-paid);
    const invoiceOutstanding=accepted.filter(row=>row.invoice_number && row.payment_status!=='paid').reduce((sum,row)=>sum+Math.max(0,amount(row)-paidAmount(row)),0);
    return {acceptedValue:total, paid, outstanding, invoiceOutstanding};
  }
  function dateOf(row){ return clean(row.created_at || row.order_date || row.saved_at || row.updated_at || row.updatedAt || row.date); }
  function buildTimeline({quotes=[],orders=[],jobs=[],events=[]}={}){
    const items=[];
    dedupe(quotes,'quote').forEach(q=>{
      items.push({date:dateOf(q),type:'quote_created',title:`Quote ${q.quote_number||q.quoteNumber||''} created`,detail:q.quote_title||q.quoteTitle||''});
      if(q.sent_at || q.quote_sent_at) items.push({date:q.sent_at||q.quote_sent_at,type:'quote_sent',title:'Quote sent',detail:q.quote_number||q.quoteNumber||''});
      if(q.customer_response) items.push({date:q.customer_responded_at||q.updated_at,type:'quote_response',title:`Quote ${q.customer_response}`,detail:q.customer_response_message||''});
    });
    dedupe(orders,'order').forEach(o=>{
      items.push({date:dateOf(o),type:'order_created',title:`Order ${o.order_number||''} created`,detail:o.order_title||''});
      if(paidAmount(o)>0) items.push({date:o.paid_date||o.updated_at||dateOf(o),type:'payment',title:`Payment ${o.payment_status||'recorded'}`,detail:paidAmount(o)});
      if(o.invoice_number) items.push({date:o.invoice_sent_at||o.invoice_date||dateOf(o),type:'invoice',title:`Invoice ${o.invoice_number}${o.invoice_sent?' sent':''}`,detail:o.po_number||''});
      if(completed(o)) items.push({date:o.closed_at||o.fulfilled_at||o.updated_at,type:'closure',title:`Order ${o.order_number||''} closed`,detail:o.fulfillment||''});
    });
    dedupe(jobs,'job').forEach(j=>items.push({date:j.status_changed_at||j.updated_at||dateOf(j),type:'production',title:`Production: ${clean(j.production_status||j.status).replace(/_/g,' ')}`,detail:j.order_number||j.quote_number||j.job_title||''}));
    dedupe(events,'event').forEach(e=>items.push({date:dateOf(e),type:e.event_type||'project',title:clean(e.event_type||'Project activity').replace(/_/g,' '),detail:e.order_number||e.quote_number||''}));
    return items.filter(i=>i.date).sort((a,b)=>b.date.localeCompare(a.date));
  }
  function build(data, selected){
    const source=[...(data.orders||[]),...(data.quotes||[]),...(data.jobs||[])];
    const seed=selected || source[0] || {};
    const orders=dedupe((data.orders||[]).filter(r=>match(seed,r)),'order');
    const quotes=dedupe((data.quotes||[]).filter(r=>match(seed,r)),'quote');
    const jobs=dedupe((data.jobs||[]).filter(r=>match(seed,r) || orders.some(o=>clean(o.order_number) && clean(o.order_number)===clean(r.order_number)) || quotes.some(q=>clean(q.quote_number||q.quoteNumber)===clean(r.quote_number))),'job');
    const refs=new Set([...orders.map(o=>o.order_number),...quotes.map(q=>q.quote_number||q.quoteNumber)].filter(Boolean));
    const events=dedupe((data.events||[]).filter(e=>refs.has(e.order_number)||refs.has(e.quote_number)),'event');
    const dates=[...orders,...quotes,...jobs,...events].map(dateOf).filter(Boolean).sort();
    const finance=financialSummary(orders);
    const business=[...orders,...quotes].some(r=>clean(r.customer_type||r.lite_quote_type).toLowerCase()==='business'||r.po_number||r.invoice_number);
    return {seed,orders,quotes,jobs,events,activeOrders:orders.filter(active),completedOrders:orders.filter(completed),finance,business,firstActivity:dates[0]||'',lastActivity:dates.at(-1)||'',timeline:buildTimeline({orders,quotes,jobs,events})};
  }
  function reorderDraft(order){
    return {source:'customer-360',source_order_number:order.order_number||null,created_at:new Date().toISOString(),customer_id:customerId(order)||null,customer_name:customerName(order),customer_email:customerEmail(order),customer_phone:customerPhone(order),company_name:customerCompany(order),order_title:(order.order_title||'Reorder')+' - Reorder',quantity:Number(order.quantity)||1,payment_terms:order.invoice_terms||'',po_number:order.po_number||'',internal_notes:'Reorder draft based on '+(order.order_number||'completed order')};
  }
  return Object.freeze({identity,match,dedupe,amount,paidAmount,active,completed,deepLink,quoteOrderLink,financialSummary,buildTimeline,build,reorderDraft});
});
