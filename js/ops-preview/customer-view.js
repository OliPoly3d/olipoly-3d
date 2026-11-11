(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.OliPolyCustomerView=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const E=root.OliPolyLineItems.escape;
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
  const cents=value=>Math.round(Number(value)*100);
  const customerTotals = t => ({
    beforeTax:Number(t.beforeTax), tax:Number(t.tax), total:Number(t.total),
    discount:Number(t.grossDiscount??t.discount??0), shipping:Number(t.grossShipping??t.customerShipping??0),
    shippingDeferred:!!t.shippingDeferred, rounding:Number(t.roundingAdjustment||0)
  });
  function project(order) {
    // Explicit presentation projection. Never return the workspace, manufacturing usage,
    // run details, manufacturing costs, margin, fees or private request notes.
    const accepted=!!order.snapshot;
    const offer=order.quoteOffer;
    if(!accepted&&!offer)return null;
    const t=accepted?order.snapshot:offer.totals;
    if(!t||![t.total,t.beforeTax,t.tax].every(v=>Number.isFinite(Number(v))))throw new Error('Saved quote totals are incomplete.');
    const current=order.fulfillmentPlan?.totals||t;
    const total=cents(current.total),paid=accepted?(order.payments||[]).reduce((s,p)=>s+cents(p.amount),0):0;
    const items=(t.grossLineItems||t.lineItems||[]).map(i=>{
      const source=(offer?.items||order.items||[]).find(raw=>raw.id===i.id);
      const materialLabel=[...new Set((source?.materials||[]).map(m=>[m.material,m.color].filter(Boolean).join(' · ')))].join('; ');
      return {description:String(i.description||''),materialLabel,quantity:i.quantity,unitPrice:i.unit_price,lineTotal:i.line_total};
    });
    const phase=!accepted?'awaiting':order.fulfilled?'fulfilled':!order.released?'approved':order.items.every(i=>root.OliPolyOpsPreview.remaining(order,i)===0)?'ready':order.runs.some(r=>r.status==='printing')?'printing':'scheduled';
    const historical = order.historicalCompletion;
    const shipment = accepted ? order.shipment || (historical?.method === 'shipping' ? {...historical, handoffAt:order.fulfilledAt} : null) : null;
    const shipping = shipment ? {
      shipped: Boolean(shipment.handoffAt),
      ...(shipment.handoffAt ? {carrier: String(shipment.carrier||''), service: String(shipment.service||''), tracking: String(shipment.tracking||'')} : {})
    } : null;
    const identity=root.OliPolyOpsPreview.projectIdentity(order);
    const terms=String(offer?.terms||order.terms||'To be agreed');
    return {reference:identity.primary,legacyQuote:identity.legacyQuote,customer:String(offer?.customer||order.customer),title:String(offer?.title||order.title),
      revision:offer?.revision||1,accepted,approvedAt:order.approvedAt||'',phase,items,shipping,handoffDate:historical?.handoffDate||'',paymentPending:!!order.shippingDraft,method:root.OliPolyOpsPreview.fulfillmentMethod(order),
      totals:customerTotals(current),quoteTotals:customerTotals(t),adjusted:current.total!==t.total || current.tax!==t.tax || current.customerShipping!==t.customerShipping,
      taxIncluded:!!current.taxIncluded,quoteTaxIncluded:!!t.taxIncluded,taxExempt:!!order.taxExempt,paid:paid/100,balance:Math.max(0,total-paid)/100,credit:Math.max(0,paid-total)/100,
      terms,business:order.preset==='business',turnaround:String(offer?.turnaround||order.turnaround||'OliPoly will confirm scheduling.'),
      validUntil:String(offer?.validUntil||order.validUntil||''),customerNotes:String(offer?.customerNotes||order.customerNotes||''),
      fulfillmentNote:offer?.fulfillmentNote??root.OliPolyOpsPreview.quoteFulfillmentNote(order),
      payments:(order.payments||[]).map(p=>({amount:Number(p.amount),method:String(p.method),date:String(p.date||'')}))};
  }
  const row=(label,value)=>`<div class="row"><span>${E(label)}</span><strong>${E(value)}</strong></div>`;
  function totals(v,view) {
    const isQuote = view === 'quote';
    const t = isQuote ? v.quoteTotals : v.totals;
    const feeLabel = v.method === 'delivery' && !isQuote ? 'Local delivery charge' : 'Shipping charged';
    let breakdown, taxNote;
    if (isQuote) {
      breakdown = row('Before tax',money(t.beforeTax)) +
        row(v.taxExempt?'Sales tax · exempt':'Sales tax',money(t.tax)) +
        (t.discount ? row('Discount applied',money(t.discount)) : '') +
        (t.shipping ? row(feeLabel,money(t.shipping)) : row('Separate shipping charge',t.shippingDeferred?'To be confirmed; not in total':money(0))) +
        (cents(t.rounding) ? row('Discount or Adjustment',money(t.rounding)) : '');
      taxNote = v.quoteTaxIncluded ? 'Tax included; breakdown shown above.' : 'Includes the sales tax shown above.';
    } else {
      const quoted = v.quoteTotals;
      // Start from the accepted total, which already includes its original tax
      // and charges. Show only changes made since acceptance.
      const taxChange = cents(t.tax) - cents(quoted.tax);
      const shippingChange = cents(t.shipping) - cents(quoted.shipping);
      const adjustment = cents(t.total) - cents(quoted.total) - taxChange - shippingChange;
      breakdown = row('Quoted total',money(quoted.total)) +
        row(taxChange < 0 ? 'Sales tax reduction' : 'Additional sales tax',money(taxChange/100)) +
        (shippingChange || !v.paymentPending ? row(feeLabel,money(shippingChange/100)) : '') +
        (adjustment ? row('Discount or Adjustment',money(adjustment/100)) : '');
      taxNote = v.taxExempt ? 'Sales tax exempt.' : `Total sales tax included: ${money(t.tax)}.`;
    }
    return `<aside class="card customer-summary"><h2>${isQuote?'Your quotation':'Order summary'}</h2><p class="customer-note customer-reference">${E(v.reference)} · Revision ${v.revision}</p>${breakdown}<div class="customer-total"><small>${isQuote?'Quoted total':'Agreed total'}</small><strong>${money(t.total)}</strong><small>${taxNote}</small></div>${(v.accepted && (!isQuote || !v.adjusted))?`${row('Payments confirmed',money(v.paid))}${row('Remaining balance',money(v.balance))}${v.credit?row('Credit to resolve',money(v.credit)):''}`:''}<p class="customer-note">${E(v.terms)}</p><div class="actions no-print"><button data-action="print">Print / save ${isQuote?'quote PDF':'order summary'}</button></div></aside>`;
  }
  function quote(v) {
    return `<section class="card"><div class="customer-meta"><div><div class="eyebrow">${v.accepted?'Accepted quotation':'Prepared for you'}</div><h2>${E(v.customer)}</h2></div><p>${E(v.reference)} · Rev ${v.revision}${v.validUntil?`<br>Valid through ${E(v.validUntil)}`:''}${v.legacyQuote?`<br>Original quote ${E(v.legacyQuote)}`:''}</p></div><div class="customer-line-items"><table class="receipt-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit price${v.quoteTaxIncluded?' · tax included':''}</th><th>Amount</th></tr></thead><tbody>${v.items.map(i=>`<tr><td>${E(i.description)}${i.materialLabel?`<br><small>${E(i.materialLabel)}</small>`:''}</td><td>${E(i.quantity)}</td><td>${money(i.unitPrice)}</td><td>${money(i.lineTotal)}</td></tr>`).join('')}</tbody></table></div><div class="customer-terms"><strong>Timing</strong>${E(v.turnaround)}<strong>Payment terms</strong>${E(v.terms)}${v.customerNotes?`<strong>Scope & notes</strong>${E(v.customerNotes)}`:''}${v.fulfillmentNote?`<strong>Fulfillment</strong>${E(v.fulfillmentNote)}`:''}</div>${v.accepted?'<p class="customer-status" style="margin-top:22px">Your quote is accepted. You can follow your order’s progress and balance below.</p>':`<form id="customer-accept" class="no-print" style="margin-top:24px"><h3>Ready to go ahead?</h3><label>Your name<input name="name" autocomplete="name" required maxlength="160"></label><label class="check customer-check"><input type="checkbox" name="confirm" required><span>I approve revision ${v.revision}, including the listed scope, quantities, total of <strong>${money(v.totals.total)}</strong>, timing and payment terms.</span></label><button class="primary" type="submit">Accept quote · ${money(v.totals.total)}</button><p class="customer-note">Owner test: this records approval in OliPoly ERP Test. It does not release production.${v.business?' OliPoly must also review any required purchase order.':''}</p></form><details class="no-print" style="margin-top:20px"><summary>Need a change before accepting?</summary><p class="customer-note">Contact OliPoly with ${E(v.reference)} and the change you need. Reply to your quote message with the changes you need. Wait for an updated quote before accepting.</p></details>`}</section>`;
  }
  function track(v) {
    const [ready, fulfilled] = root.OliPolyOpsPreview.fulfillmentMilestones[v.method];
    const readyNote = {
      pending: 'OliPoly will confirm how you’ll receive your order.',
      pickup: 'OliPoly will confirm the pickup arrangements.',
      shipping: 'Your order is being prepared for carrier handoff.',
      delivery: 'OliPoly will arrange a drop-off time with you.'
    }[v.method];
    const steps=[['approved','Approved','Your scope and price are confirmed.'],['scheduled','Scheduled','Your work is released to production.'],['printing','In production','Printing, finishing and quality checks.'],['ready',ready,readyNote],['fulfilled',fulfilled,'Your order has been handed over.']];
    const current=steps.findIndex(s=>s[0]===v.phase);
    const shipmentMethod = [v.shipping?.carrier,v.shipping?.service].filter(Boolean).join(' · ');
    const shipmentDetails = v.shipping?.shipped ?
      (shipmentMethod ? `<small>Shipping method · ${E(shipmentMethod)}</small>` : '') +
      (v.shipping.tracking ? `<small>Tracking number · ${E(v.shipping.tracking)}</small>` : '') : '';

    return `<section class="card"><h2>Your project, moving along.</h2><p class="customer-note">We’ll show the important milestones here. Your payment status is separate from production progress.</p>${!v.accepted?'<p class="customer-status">Awaiting quote acceptance. Production has not started.</p>':`<div style="margin:30px 0">${steps.map(([id,label,note],i)=>`<div class="customer-step ${i<=current?'done':''}" ${i===current?'aria-current="step"':''}><strong>${E(label)}</strong><small>${i===current?'Current step · ':i>current?'Upcoming · ':'Completed · '}${E(note)}</small>${id==='fulfilled'?`${v.handoffDate?`<small>Handoff date · ${E(v.handoffDate)}</small>`:''}${shipmentDetails}`:''}</div>`).join('')}</div><div class="customer-status">${v.phase==='approved'?'Your quote is approved and awaiting production release.':v.phase==='fulfilled'?(v.method==='shipping'?'Your order has shipped.':E(fulfilled)):v.phase==='ready'?E(readyNote):'Your order is progressing.'}</div>`}${['ready','fulfilled'].includes(v.phase)?'':`<div class="customer-terms"><strong>Agreed timing</strong>${E(v.turnaround)}</div>`}${v.accepted&&!v.paymentPending&&v.balance>0?'<button class="primary no-print" data-view="pay" style="margin-top:24px">View payment details</button>':''}</section>`;
  }
  function pay(v) {
    if(v.paymentPending)return '<section class="card"><h2>Payment is on hold.</h2><p>OliPoly will confirm the shipping details and update the amount due.</p></section>';
    if(!v.accepted)return '<section class="card"><h2>Payment follows your agreement.</h2><p>Accept the quote first. Your agreed total and any amount due will appear here.</p></section>';
    if(v.balance===0)return `<section class="card"><div class="eyebrow">${v.credit?'Credit on account':'Payment complete'}</div><h2>${v.credit?'No payment is due.':'Thank you. You’re paid in full.'}</h2><p class="customer-status">Remaining balance ${money(0)}</p>${v.credit?`<p class="customer-note">Please contact OliPoly about your ${money(v.credit)} credit. It has not been treated as a tip.</p>`:''}<h3 style="margin-top:26px">Confirmed payments</h3>${v.payments.map(p=>row(p.method,money(p.amount))).join('')}<p class="customer-note" style="margin-top:20px">The printable order summary shows your items and confirmed payment totals. Contact OliPoly if you need an itemized receipt.</p></section>`;
    if(v.business)return `<section class="card"><div class="eyebrow">Business purchasing</div><h2>Pay according to your invoice terms.</h2><p class="customer-status">Balance ${money(v.balance)} · ${E(v.terms)}</p><p class="customer-note" style="margin-top:22px">Use the payment instructions on the issued invoice and include ${E(v.reference)}. Contact OliPoly before using a different payment method.</p><p class="customer-note">Consumer payment buttons are not shown for this PO / business order. Please refer to your issued invoice for its number and due date.</p></section>`;
    return `<section class="card"><div class="eyebrow">Your payment</div><h2>A clear amount. Your choice of method.</h2><div class="payment-instruction"><span>Exact amount to enter</span><strong>${money(v.balance)}</strong><span>Use this remaining balance—not the original order total. Include <b>${E(v.reference)}</b> in the payment note when available.</span></div><div class="customer-actions no-print"><button data-action="copy-amount">Copy amount · ${money(v.balance)}</button><button data-action="copy-reference">Copy ${E(v.reference)}</button></div><div class="customer-pay-options no-print">${[['card','Card / Apple Pay'],['paypal','PayPal'],['venmo','Venmo']].map(([id,name])=>`<button data-method="${id}"><strong>${name}</strong><small>Review payment instructions →</small></button>`).join('')}</div><div id="method-instructions" role="status" aria-live="polite"></div><p class="customer-note">If the provider asks you to enter an amount, enter <strong>${money(v.balance)}</strong>. Tax is already included in that balance; do not add it again. No tip is selected or added.</p><p class="customer-note">Payments appear here after OliPoly confirms receipt. Opening a provider page is not payment confirmation. Cash, check or ACH may be arranged directly.</p></section>`;
  }
  function render(v,view='quote') {
    if(!v)return '<section class="card"><h1>Your quote is being prepared.</h1><p>This project has no saved shared quote or accepted price to preview yet. Finish and mark the quote sent in the private workspace, then reload.</p></section>';
    if(!['quote','track','pay'].includes(view))view='quote';
    return `<div class="eyebrow customer-reference">${E(v.reference)} · ${v.accepted?'Your order':'Your quotation'}</div><h1>${E(v.title)}</h1><nav class="customer-nav no-print" aria-label="Your project">${[['quote','Your quote'],['track','Order progress'],['pay','Payment']].map(([id,label])=>`<button data-view="${id}" ${view===id?'aria-current="page"':''}>${label}</button>`).join('')}</nav><div class="customer-grid">${({quote,track,pay})[view](v)}${totals(v,view)}</div>`;
  }
  return {project,render,money};
});
