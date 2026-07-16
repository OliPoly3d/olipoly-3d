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
    const manualPiecePrice = Math.max(0, finiteNumber(input.manualPiecePrice));
    const material = Math.max(0, finiteNumber(input.material));
    const machine = Math.max(0, finiteNumber(input.machine));
    const design = Math.max(0, finiteNumber(input.design));
    const post = Math.max(0, finiteNumber(input.post));
    const packaging = Math.max(0, finiteNumber(input.packaging));
    const shipping = Math.max(0, finiteNumber(input.shipping));
    const hardware = Math.max(0, finiteNumber(input.hardware));
    const breakEven = material + machine + design + post + packaging + shipping + hardware;
    const pricingMode = hasManualPrice ? "manual" : "suggested";
    const direct = breakEven;
    const base = direct;
    const profitValue = Math.max(0, finiteNumber(input.profitValue));
    const profit = hasManualPrice
      ? 0
      : input.profitMode === "flat" ? profitValue : base * (profitValue / 100);
    const sellingSubtotal = hasManualPrice ? manualPiecePrice * quantity : base + profit;
    const marketplaceFee = hasManualPrice ? 0 : sellingSubtotal * (Math.max(0, finiteNumber(input.marketplacePercent)) / 100);
    const preDiscount = sellingSubtotal + marketplaceFee;
    const discount = Math.max(0, finiteNumber(input.discount));
    const rawSubtotal = Math.max(0, preDiscount - discount);
    const subtotal = hasManualPrice ? roundCurrency(rawSubtotal) : rawSubtotal;
    const taxRate = input.taxExempt ? 0 : Math.max(0, finiteNumber(input.taxRate));
    const rawTax = subtotal * (taxRate / 100);
    const tax = hasManualPrice ? roundCurrency(rawTax) : rawTax;
    const unroundedTotal = subtotal + tax;
    const roundingIncrement = Math.max(0, finiteNumber(input.roundingIncrement));
    const rawTotal = Math.max(0, !hasManualPrice && roundingIncrement
      ? Math.round(unroundedTotal / roundingIncrement) * roundingIncrement
      : unroundedTotal);
    const total = hasManualPrice ? roundCurrency(rawTotal) : rawTotal;
    const roundingAdjustment = total - unroundedTotal;
    const depositPercent = Math.min(100, Math.max(0, finiteNumber(input.depositPercent)));
    const rawDeposit = total * (depositPercent / 100);
    const deposit = hasManualPrice ? roundCurrency(rawDeposit) : rawDeposit;
    const rawBalance = Math.max(0, total - deposit);
    const balance = hasManualPrice ? roundCurrency(rawBalance) : rawBalance;
    const perItem = hasManualPrice ? manualPiecePrice : total / quantity;
    const margin = total > 0 ? ((total - breakEven) / total) * 100 : 0;

    return Object.freeze({
      pricingMode, quantity, q: quantity, hasManualPrice, manualPiecePrice,
      manualPiece: manualPiecePrice, piecePrice: perItem, material, machine, design,
      post, packaging, shipping, hardware, direct, base, profit, marketplaceFee,
      preDiscount, discount, subtotal, beforeTax: subtotal, taxRate, tax,
      unroundedTotal, unroundedFinal: unroundedTotal, roundingIncrement,
      rounding: roundingIncrement, roundingAdjustment, roundingGain: roundingAdjustment,
      total, final: total, deposit, balance, perItem, breakEven, margin
    });
  }

  root.calculateQuoteTotals = calculateQuoteTotals;
})(typeof window !== "undefined" ? window : globalThis);
