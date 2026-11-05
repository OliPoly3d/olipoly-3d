(function (root) {
  "use strict";

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function roundCurrency(value) {
    return Math.round((finiteNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function inclusiveNetItems(items, netSubtotal) {
    // Allocate whole cents across lines so many small items still reconcile
    // to the order's net subtotal. Preserve the entered gross display lines.
    const gross = items.reduce((sum, item) => sum + item.line_total, 0);
    const allocations = items.map((item, index) => {
      const exactCents = gross ? item.line_total / gross * Math.round(netSubtotal * 100) : 0;
      const cents = Math.floor(exactCents + Number.EPSILON);
      return {item, index, cents, fraction: exactCents - cents};
    });
    const remaining = Math.round(netSubtotal * 100) - allocations.reduce((sum, row) => sum + row.cents, 0);
    allocations.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    allocations.forEach((row, rank) => { if (rank < remaining) row.cents += 1; });
    allocations.sort((a, b) => a.index - b.index);
    return allocations.map(({item, cents}) => ({...item, unit_price: cents / 100 / item.quantity}));
  }

  function calculateQuoteTotals(input = {}) {
    if (input.taxIncluded === true) {
      const grossItems = root.OliPolyLineItems.commercial(input.lineItems || []);
      if (!grossItems.length) throw new Error('Tax-inclusive pricing requires itemized prices.');
      const rate = input.taxExempt ? 0 : root.normalizeTaxRatePercent(input.taxRate ?? 0);
      const divisor = 1 + rate / 100;
      const grossSubtotal = roundCurrency(grossItems.reduce((sum, item) => sum + item.line_total, 0));
      const grossDiscount = Math.min(grossSubtotal, Math.max(0, finiteNumber(input.discount)));
      const grossShipping = input.shippingDeferred ? 0 : roundCurrency(Math.max(0, finiteNumber(input.customerShipping)));
      const grossBeforeRounding = roundCurrency(grossSubtotal - grossDiscount + grossShipping);
      const includedTax = roundCurrency(grossBeforeRounding * rate / (100 + rate));
      const beforeTax = roundCurrency(grossBeforeRounding - includedTax);
      const netShipping = roundCurrency(grossShipping / divisor);
      const netDiscount = roundCurrency(grossDiscount / divisor);
      const netSubtotal = roundCurrency(beforeTax - netShipping + netDiscount);
      const increment = Math.max(0, finiteNumber(input.roundingIncrement));
      const total = roundCurrency(increment ? Math.round(grossBeforeRounding / increment) * increment : grossBeforeRounding);
      const net = calculateQuoteTotals({...input, taxIncluded: false, roundingIncrement: 0,
        lineItems: inclusiveNetItems(grossItems, netSubtotal),
        discount: netDiscount, customerShipping: netShipping});
      const deposit = roundCurrency(total * Math.min(100, Math.max(0, finiteNumber(input.depositPercent))) / 100);
      const adjustment = roundCurrency(total - grossBeforeRounding);
      return Object.freeze({...net, taxIncluded: true, grossLineItems: grossItems,
        grossSubtotal, grossDiscount, grossShipping, beforeTax, tax: includedTax,
        unroundedTotal: grossBeforeRounding, unroundedFinal: grossBeforeRounding, total, final: total,
        roundingAdjustment: adjustment, roundingGain: adjustment,
        deposit, balance: roundCurrency(total - deposit)});
    }
    const lineItems = input.lineItems?.length ? root.OliPolyLineItems.commercial(input.lineItems) : [];
    const quantity = lineItems.length ? lineItems.reduce((sum, item) => sum + item.quantity, 0)
      : Math.max(1, Math.round(finiteNumber(input.quantity) || 1));
    const hasManualPrice = !lineItems.length && input.manualPiecePrice !== "" && input.manualPiecePrice != null;
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
    const pricingMode = lineItems.length ? "itemized" : hasManualPrice ? "manual" : hasProductionSuggestion ? "suggested" : "calculated";
    const profitValue = Math.max(0, finiteNumber(input.profitValue));
    const profit = pricingMode === "calculated"
      ? input.profitMode === "flat" ? profitValue : direct * (profitValue / 100)
      : 0;
    const calculatedSubtotal = direct + profit;
    const sellingSubtotal = lineItems.length ? roundCurrency(lineItems.reduce((sum, item) => sum + item.line_total, 0)) : hasManualPrice ? manualPiecePrice * quantity
      : hasProductionSuggestion ? suggestedTotal : calculatedSubtotal;
    const marketplaceFee = pricingMode === "calculated"
      ? sellingSubtotal * (Math.max(0, finiteNumber(input.marketplacePercent)) / 100) : 0;
    const preDiscount = sellingSubtotal + marketplaceFee;
    const discount = Math.max(0, finiteNumber(input.discount));
    const subtotal = roundCurrency(Math.max(0, preDiscount - discount));
    const shippingDeferred = input.shippingDeferred === true;
    const customerShipping = shippingDeferred ? 0 : roundCurrency(Math.max(0, finiteNumber(input.customerShipping)));
    const taxableSubtotal = roundCurrency(subtotal + customerShipping);
    const taxRate = input.taxExempt ? 0 : root.normalizeTaxRatePercent(input.taxRate ?? 0);
    const tax = root.calculateSalesTax(taxableSubtotal, taxRate);
    const unroundedTotal = taxableSubtotal + tax;
    const roundingIncrement = Math.max(0, finiteNumber(input.roundingIncrement));
    const total = roundCurrency(Math.max(0, roundingIncrement
      ? Math.round(unroundedTotal / roundingIncrement) * roundingIncrement
      : unroundedTotal));
    const roundingAdjustment = total - unroundedTotal;
    const depositPercent = Math.min(100, Math.max(0, finiteNumber(input.depositPercent)));
    const deposit = roundCurrency(total * (depositPercent / 100));
    const balance = roundCurrency(Math.max(0, total - deposit));
    const perItem = lineItems.length ? sellingSubtotal / quantity : hasManualPrice ? manualPiecePrice
      : suggestedPiecePrice || (quantity ? sellingSubtotal / quantity : 0);
    const margin = total > 0 ? ((total - breakEven) / total) * 100 : 0;

    return Object.freeze({
      pricingMode, quantity, q: quantity, hasManualPrice, manualPiecePrice,
      manualPiece: manualPiecePrice, suggestedTotal, suggestedPiecePrice,
      piecePrice: perItem, material, machine, design, post, packaging, shipping,
      hardware, direct, overhead, base: direct, profit, marketplaceFee, preDiscount,
      lineItems, customerShipping, shippingDeferred,
      discount, subtotal, beforeTax: taxableSubtotal, taxRate, tax, unroundedTotal,
      unroundedFinal: unroundedTotal, roundingIncrement, rounding: roundingIncrement,
      roundingAdjustment, roundingGain: roundingAdjustment, total, final: total,
      deposit, balance, perItem, breakEven, margin
    });
  }

  root.calculateQuoteTotals = calculateQuoteTotals;
})(typeof window !== "undefined" ? window : globalThis);
