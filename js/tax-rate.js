(function (root) {
  "use strict";

  const MAX_SALES_TAX_RATE_PERCENT = 20;

  function normalizeTaxRatePercent(value) {
    const rate = Number(value);
    if (!Number.isFinite(rate)) throw new TypeError("Sales-tax rate must be a finite number.");
    if (rate < 0 || rate > MAX_SALES_TAX_RATE_PERCENT) {
      throw new RangeError(`Sales-tax rate must be between 0 and ${MAX_SALES_TAX_RATE_PERCENT} percent.`);
    }
    return rate;
  }

  function calculateSalesTax(taxableSubtotal, ratePercent) {
    const taxable = Number(taxableSubtotal);
    if (!Number.isFinite(taxable) || taxable < 0) {
      throw new RangeError("Taxable subtotal must be a non-negative finite number.");
    }
    const rate = normalizeTaxRatePercent(ratePercent);
    return Math.round((taxable * rate / 100 + Number.EPSILON) * 100) / 100;
  }

  root.OliPolyTax = Object.freeze({
    MAX_SALES_TAX_RATE_PERCENT,
    normalizeTaxRatePercent,
    calculateSalesTax
  });
  root.normalizeTaxRatePercent = normalizeTaxRatePercent;
  root.calculateSalesTax = calculateSalesTax;
})(typeof window !== "undefined" ? window : globalThis);
