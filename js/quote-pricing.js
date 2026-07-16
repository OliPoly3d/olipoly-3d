(function (root) {
  "use strict";

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function roundCurrency(value) {
    return Math.round((finiteNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function calculateQuoteTotals(input = {}) {
    const quantity = Math.max(1, Math.round(finiteNumber(input.quantity) || 1));
    const hasManualPrice = input.manualPiecePrice !== "" && input.manualPiecePrice != null;
    const hasProductionSuggestion = input.suggestedTotal !== "" && input.suggestedTotal != null;
    const manualPiecePrice = Math.max(0, finiteNumber(input.manualPiecePrice));
    const suggestedTotal = Math.max(0, finiteNumber(input.suggestedTotal));
    const suggestedPiecePrice = Math.max(0, finiteNumber(input.suggestedPiecePrice));
    const costs = input.costSnapshot || {};
    const material = Math.max(0, finiteNumber(costs.material ?? input.material));
    const machine = Math.max(0, finiteNumber(costs.machine ?? input.machine));
    const design = Math.max(0, finiteNumber(costs.design ?? input.design));
    const post = Math.max(0, finiteNumber(costs.postProcessing ?? costs.post ?? input.post));
    const packaging = Math.max(0, finiteNumber(costs.packaging ?? input.packaging));
    const shipping = Math.max(0, finiteNumber(costs.shippingEstimate ?? costs.shipping ?? input.shipping));
    const hardware = Math.max(0, finiteNumber(costs.hardware ?? input.hardware));
    const hasCostSnapshot = input.costSnapshot != null;
    const suppliedDirect = hasCostSnapshot || (costs.direct !== "" && costs.direct != null);
    const suppliedBreakEven = hasCostSnapshot || (costs.breakEven !== "" && costs.breakEven != null);
    const direct = suppliedDirect ? Math.max(0, finiteNumber(costs.direct)) : material + machine + design + post + packaging + shipping + hardware;
    const overhead = Math.max(0, finiteNumber(costs.overhead));
    const breakEven = suppliedBreakEven ? Math.max(0, finiteNumber(costs.breakEven)) : direct + overhead;
    const pricingMode = hasManualPrice ? "manual" : hasProductionSuggestion ? "suggested" : "calculated";
    const profitValue = Math.max(0, finiteNumber(input.profitValue));
    const profit = pricingMode === "calculated"
      ? input.profitMode === "flat" ? profitValue : direct * (profitValue / 100)
      : 0;
    const calculatedSubtotal = direct + profit;
    const sellingSubtotal = hasManualPrice ? manualPiecePrice * quantity
      : hasProductionSuggestion ? suggestedTotal : calculatedSubtotal;
    const marketplaceFee = pricingMode === "calculated"
      ? sellingSubtotal * (Math.max(0, finiteNumber(input.marketplacePercent)) / 100) : 0;
    const preDiscount = sellingSubtotal + marketplaceFee;
    const discount = Math.max(0, finiteNumber(input.discount));
    const subtotal = roundCurrency(Math.max(0, preDiscount - discount));
    const taxRate = input.taxExempt ? 0 : Math.max(0, finiteNumber(input.taxRate));
    const tax = roundCurrency(subtotal * (taxRate / 100));
    const unroundedTotal = subtotal + tax;
    const roundingIncrement = Math.max(0, finiteNumber(input.roundingIncrement));
    const total = roundCurrency(Math.max(0, roundingIncrement
      ? Math.round(unroundedTotal / roundingIncrement) * roundingIncrement
      : unroundedTotal));
    const roundingAdjustment = total - unroundedTotal;
    const depositPercent = Math.min(100, Math.max(0, finiteNumber(input.depositPercent)));
    const deposit = roundCurrency(total * (depositPercent / 100));
    const balance = roundCurrency(Math.max(0, total - deposit));
    const perItem = hasManualPrice ? manualPiecePrice
      : suggestedPiecePrice || (quantity ? sellingSubtotal / quantity : 0);
    const margin = total > 0 ? ((total - breakEven) / total) * 100 : 0;

    return Object.freeze({
      pricingMode, quantity, q: quantity, hasManualPrice, manualPiecePrice,
      manualPiece: manualPiecePrice, suggestedTotal, suggestedPiecePrice,
      piecePrice: perItem, material, machine, design, post, packaging, shipping,
      hardware, direct, overhead, base: direct, profit, marketplaceFee, preDiscount,
      discount, subtotal, beforeTax: subtotal, taxRate, tax, unroundedTotal,
      unroundedFinal: unroundedTotal, roundingIncrement, rounding: roundingIncrement,
      roundingAdjustment, roundingGain: roundingAdjustment, total, final: total,
      deposit, balance, perItem, breakEven, margin
    });
  }

  root.calculateQuoteTotals = calculateQuoteTotals;
})(typeof window !== "undefined" ? window : globalThis);
