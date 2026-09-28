(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyOrderPricing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  function snapshot(items, {discount = 0, shipping = 0, shippingDeferred = false, taxRate = 0, taxExempt = false} = {}) {
    const totals = root.calculateQuoteTotals({lineItems:items, discount, customerShipping:shipping, shippingDeferred, taxRate, taxExempt});
    return {
      line_items:totals.lineItems, quantity:totals.quantity, piece_price:totals.piecePrice,
      subtotal:totals.preDiscount, discount:totals.discount, taxable_subtotal:totals.beforeTax,
      tax_rate:totals.taxRate, tax:totals.tax, final_total:totals.total,
      shipping:totals.customerShipping, shipping_charged:totals.customerShipping,
      shipping_deferred:totals.shippingDeferred, shipping_in_taxable_subtotal:true,
      rounding_adjustment:0, deposit:0, balance:totals.total
    };
  }
  function initialItems(invoice) {
    const t = invoice.accepted;
    if (!t) throw new Error('This order needs a verified pricing breakdown before it can be revised.');
    if (t.line_items?.length) return t.line_items;
    // Legacy quotes stored the net subtotal after any discount. Carry that net
    // amount once, without subtracting the old discount a second time.
    const shipping = t.shipping_in_taxable_subtotal ? Number(t.shipping_charged ?? t.shipping ?? 0) : 0;
    return [{id:'legacy-product', description:invoice.order_title || 'Accepted project', quantity:Number(t.quantity), unit_price:(Number(t.taxable_subtotal)-shipping)/Number(t.quantity)}];
  }
  return Object.freeze({snapshot, initialItems});
});
