/* Authoritative customer invoice adapter. Financial values originate only in the RPC. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyInvoiceAuthority = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BLOCKED = new Set(['totals_mismatch', 'malformed_snapshot', 'unsupported_snapshot']);
  const ALLOWED = new Set(['verified', 'aggregate_only', 'missing_snapshot']);
  const value = (candidate) => candidate === null || candidate === undefined ? null : Number(candidate);

  function normalize(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('Invoice authority RPC returned no snapshot.');
    const status = String(snapshot.reconciliation_status || 'malformed_snapshot');
    if (!ALLOWED.has(status) && !BLOCKED.has(status)) throw new Error('Invoice authority returned an unknown reconciliation status.');
    const identity = snapshot.identity || {};
    const payment = snapshot.current_payment_state || {};
    const accepted = status === 'verified' ? snapshot.accepted_commercial_breakdown : null;
    const orderTotal = value(payment.order_total);
    const balance = value(payment.balance_amount);
    if (orderTotal === null) throw new Error('Authoritative order total is unavailable.');
    if (balance === null) throw new Error('Authoritative current balance is unavailable.');
    return {
      ...identity,
      status,
      blocked: BLOCKED.has(status),
      aggregateOnly: status !== 'verified',
      breakdownSource: snapshot.breakdown_source || 'order_aggregates',
      accepted,
      order_total: orderTotal,
      deposit_amount: value(payment.deposit_amount),
      balance_amount: balance,
      amount_paid: value(payment.amount_paid),
      amount_paid_source: payment.amount_paid_source || null,
      payment_status: payment.payment_status || 'unpaid',
      invoice_number: payment.invoice_number ?? identity.invoice_number ?? null
    };
  }

  function totalsRows(invoice) {
    if (invoice.blocked) throw new Error('Invoice generation blocked: accepted financial snapshot requires review.');
    if (invoice.aggregateOnly) {
      return [
        ['Accepted order total', invoice.order_total],
        ...(invoice.deposit_amount === null ? [] : [['Deposit / prior payment', invoice.deposit_amount]]),
        ['Current amount due', invoice.balance_amount]
      ];
    }
    const t = invoice.accepted;
    return [
      ['Subtotal', value(t.subtotal)],
      ...(value(t.design_fee) === null ? [] : [['Design fee', value(t.design_fee)]]),
      ...(value(t.discount) === 0 ? [] : [['Discount', -value(t.discount)]]),
      ...(value(t.shipping) === null ? [] : [['Shipping', value(t.shipping)]]),
      ['Sales tax', value(t.tax)],
      ['Accepted total', value(t.final_total)],
      ...(invoice.deposit_amount === null ? [] : [['Deposit', invoice.deposit_amount]]),
      ...(invoice.amount_paid === null ? [] : [['Amount paid', invoice.amount_paid]]),
      ['Remaining balance', invoice.balance_amount]
    ];
  }

  function escapeHtml(input) {
    return String(input ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function escapedMultiline(input) { return escapeHtml(input).replace(/\r?\n/g, '<br>'); }
  return Object.freeze({ normalize, totalsRows, escapeHtml, escapedMultiline, BLOCKED });
});
