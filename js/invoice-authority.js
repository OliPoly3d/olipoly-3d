/* Authoritative customer-invoice adapter. It selects RPC values; it never prices an order. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyInvoiceAuthority = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BLOCKED = new Set(['totals_mismatch', 'malformed_snapshot', 'unsupported_snapshot']);
  const ALLOWED = new Set(['verified', 'aggregate_only', 'missing_snapshot']);
  const PRESENTATION_FIELDS = [
    'invoice_date', 'invoice_due_date', 'invoice_terms', 'invoice_terms_label', 'order_date',
    'po_number', 'ap_email', 'billing_address', 'shipping_address', 'shipping_company',
    'shipping_contact_name', 'shipping_or_pickup_note', 'tracking_number', 'public_status_text',
    'payment_link', 'payment_link_stripe', 'payment_link_paypal', 'payment_link_venmo',
    'po_part_number', 'olipoly_part_number', 'part_revision'
  ];

  function numberOrNull(candidate) {
    if (candidate === null || candidate === undefined || candidate === '') return null;
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizedSource(snapshot) {
    const source = String(snapshot.breakdown_source || 'order_aggregates');
    // The deployed RPC's legacy label does not reveal which customer_totals path won.
    // Keep that harmless ambiguity explicit until a future SQL migration can report the path.
    if (source === 'legacy_offer_quote_data_customer_totals') return 'legacy_customer_totals_unspecified';
    return ({
      versioned_accepted_snapshot: 'versioned_invoice_totals',
      invoice_totals: 'versioned_invoice_totals',
      legacy_offer_customer_totals: 'legacy_offer_customer_totals',
      order_aggregates: 'order_aggregates'
    })[source] || source;
  }

  function normalize(snapshot, presentation = {}) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('Invoice authority RPC returned no snapshot.');
    const status = String(snapshot.reconciliation_status || 'malformed_snapshot');
    if (!ALLOWED.has(status) && !BLOCKED.has(status)) throw new Error('Invoice authority returned an unknown reconciliation status.');
    const identity = snapshot.identity && typeof snapshot.identity === 'object' ? snapshot.identity : {};
    const payment = snapshot.current_payment_state && typeof snapshot.current_payment_state === 'object'
      ? snapshot.current_payment_state : {};
    const accepted = status === 'verified' && snapshot.component_breakdown_available === true
      ? snapshot.accepted_commercial_breakdown : null;
    const orderTotal = numberOrNull(payment.order_total);
    const balance = numberOrNull(payment.balance_amount);
    if (BLOCKED.has(status)) {
      return Object.freeze({ ...identity, status, blocked:true, aggregateOnly:false, breakdownSource:normalizedSource(snapshot) });
    }
    if (orderTotal === null) throw new Error('Authoritative order total is unavailable.');
    if (balance === null) throw new Error('Authoritative current balance is unavailable.');
    if (status === 'verified' && !accepted) throw new Error('Verified invoice component breakdown is unavailable.');
    if (accepted) {
      const required = ['subtotal', 'discount', 'taxable_subtotal', 'tax_rate', 'tax', 'quantity', 'piece_price', 'deposit', 'balance', 'final_total'];
      const missing = required.filter(field => numberOrNull(accepted[field]) === null);
      if (missing.length) throw new Error(`Verified invoice breakdown is malformed: missing ${missing.join(', ')}.`);
    }

    const extras = {};
    for (const field of PRESENTATION_FIELDS) {
      if (identity[field] === undefined && presentation[field] !== undefined) extras[field] = presentation[field];
    }
    const model = {
      ...extras,
      ...identity,
      status,
      blocked:false,
      aggregateOnly:status !== 'verified',
      componentBreakdownAvailable:!!accepted,
      breakdownSource:normalizedSource(snapshot),
      accepted:accepted ? Object.freeze({ ...accepted }) : null,
      order_total:orderTotal,
      deposit_amount:numberOrNull(payment.deposit_amount),
      balance_amount:balance,
      amount_paid:numberOrNull(payment.amount_paid),
      amount_paid_source:payment.amount_paid_source || null,
      payment_status:payment.payment_status || 'unpaid',
      paid_date:payment.paid_date ?? null,
      invoice_number:payment.invoice_number ?? identity.invoice_number ?? null
    };
    return Object.freeze(model);
  }

  function totalsRows(invoice) {
    if (invoice.blocked) throw new Error('Invoice generation blocked: accepted financial snapshot requires review.');
    if (invoice.aggregateOnly) {
      return [
        ['Accepted order total', invoice.order_total],
        ...(invoice.deposit_amount === null ? [] : [['Deposit / prior payment', invoice.deposit_amount]]),
        ...(invoice.amount_paid === null ? [] : [['Amount paid', invoice.amount_paid]]),
        ['Current amount due', invoice.balance_amount]
      ];
    }
    const t = invoice.accepted;
    return [
      ['Product subtotal', numberOrNull(t.subtotal)],
      ...(numberOrNull(t.design_fee) === null ? [] : [['Design fee', numberOrNull(t.design_fee)]]),
      ...(numberOrNull(t.discount) === 0 || numberOrNull(t.discount) === null ? [] : [['Discount', -numberOrNull(t.discount)]]),
      ...(numberOrNull(t.shipping) === null ? [] : [['Shipping', numberOrNull(t.shipping)]]),
      ...(numberOrNull(t.taxable_subtotal) === null ? [] : [['Taxable subtotal', numberOrNull(t.taxable_subtotal)]]),
      ['Sales tax', numberOrNull(t.tax)],
      ['Accepted total', numberOrNull(t.final_total)],
      ...(invoice.deposit_amount === null ? [] : [['Deposit / prior payment', invoice.deposit_amount]]),
      ...(invoice.amount_paid === null ? [] : [['Amount paid', invoice.amount_paid]]),
      ['Current amount due', invoice.balance_amount]
    ];
  }

  function escapeHtml(input) {
    return String(input ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function escapedMultiline(input) { return escapeHtml(input).replace(/\r?\n/g, '<br>'); }
  function preciseUnitPrice(value) {
    const amount = numberOrNull(value);
    if (amount === null) return null;
    return amount.toLocaleString('en-US', { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:6 });
  }

  return Object.freeze({ normalize, totalsRows, escapeHtml, escapedMultiline, preciseUnitPrice, BLOCKED });
});
