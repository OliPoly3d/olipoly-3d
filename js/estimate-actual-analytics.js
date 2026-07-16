(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyEstimateActual = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const has = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const value = (source, keys) => {
    for(const key of keys) if(has(source?.[key])) return Number(source[key]);
    return null;
  };
  const sumKnown = (values) => values.every(has) ? values.reduce((sum, item) => sum + Number(item), 0) : null;
  const round = (number) => has(number) ? Math.round(Number(number) * 10000) / 10000 : null;

  function variance(estimated, actual, favorableWhenLower=true){
    if(!has(estimated) || !has(actual)) return {numeric:null, percent:null, direction:'unavailable'};
    const numeric = round(Number(actual) - Number(estimated));
    const percent = Number(estimated) === 0 ? null : round((numeric / Math.abs(Number(estimated))) * 100);
    if(numeric === 0) return {numeric, percent, direction:'neutral'};
    return {numeric, percent, direction:(numeric < 0) === favorableWhenLower ? 'favorable' : 'unfavorable'};
  }

  function attemptTotals(job){
    const attempts = Array.isArray(job?.production_attempts) ? job.production_attempts : [];
    if(!attempts.length) return null;
    const total = (keys) => {
      const rows = attempts.map(attempt => value(attempt, keys));
      return rows.some(has) ? round(rows.reduce((sum, item) => sum + (has(item) ? item : 0), 0)) : null;
    };
    return {
      goodGrams:total(['good_grams','actual_good_grams']),
      scrapGrams:total(['scrap_grams','failed_grams','purge_grams']),
      printHours:total(['actual_print_hours','print_hours','duration_hours']),
      designHours:total(['actual_design_hours','design_hours']),
      postHours:total(['actual_post_processing_hours','post_processing_hours','post_hours']),
      materialCost:attemptMaterialCost(attempts)
    };
  }

  function attemptMaterialCost(attempts){
    let found = false;
    let total = 0;
    for(const attempt of attempts){
      const explicit = value(attempt, ['actual_material_cost','material_cost']);
      if(has(explicit)){ found = true; total += explicit; continue; }
      const usages = Array.isArray(attempt.roll_usages) ? attempt.roll_usages : [];
      for(const usage of usages){
        const cost = value(usage, ['actual_cost','material_cost','cost']);
        const grams = value(usage, ['grams_used']);
        const rate = value(usage, ['cost_per_gram','unit_cost_per_gram']);
        if(has(cost)){ found = true; total += cost; }
        else if(has(grams) && has(rate)){ found = true; total += grams * rate; }
      }
    }
    return found ? round(total) : null;
  }

  function storedRevenue(job){
    const snapshots = [job?.quote_totals_snapshot, job?.totals_snapshot, job?.authoritative_quote_totals, job?.linked_quote_draft];
    for(const snapshot of snapshots){
      const found = value(snapshot, ['total','quote_total','final_total','grand_total','suggested_total']);
      if(has(found)) return found;
    }
    return value(job, ['quoted_revenue','quote_total','order_total','actual_revenue','revenue','estimated_revenue']);
  }

  function calculate(job){
    const qty = value(job, ['quantity']) ?? 1;
    const attempts = attemptTotals(job);
    const estimatedGrams = value(job, ['estimated_total_grams']) ?? (has(job?.estimated_grams_each) ? Number(job.estimated_grams_each) * qty : null);
    const estimatedPrint = value(job, ['estimated_total_hours']) ?? (has(job?.estimated_hours_each) ? Number(job.estimated_hours_each) * qty : null);
    const actualGood = attempts && has(attempts.goodGrams) ? attempts.goodGrams : value(job, ['actual_grams_used','actual_good_grams']);
    const actualScrap = attempts && has(attempts.scrapGrams) ? attempts.scrapGrams : value(job, ['scrap_grams']);
    const actualConsumed = has(actualGood) || has(actualScrap) ? round((actualGood || 0) + (actualScrap || 0)) : null;
    const actualPrint = attempts && has(attempts.printHours) ? attempts.printHours : value(job, ['actual_print_hours']);
    const estimatedDesign = value(job, ['estimated_design_hours','design_hours']);
    const actualDesign = attempts && has(attempts.designHours) ? attempts.designHours : value(job, ['actual_design_hours']);
    const estimatedPost = value(job, ['estimated_post_processing_hours','post_processing_hours','estimated_post_hours']);
    const actualPost = attempts && has(attempts.postHours) ? attempts.postHours : value(job, ['actual_post_processing_hours','actual_post_hours']);

    const estimatedMaterialCost = value(job, ['estimated_material_cost']);
    const estimatedMachineCost = value(job, ['estimated_machine_cost']);
    const estimatedDesignCost = value(job, ['estimated_design_cost','design_fee']);
    const estimatedPostCost = value(job, ['estimated_post_cost','estimated_post_processing_cost','post_processing_fee']);
    const estimatedOtherCost = value(job, ['estimated_other_cost','supply_cost']);
    const estimatedCost = value(job, ['estimated_direct_cost','estimated_internal_cost']) ?? value(job?.production_closeout_snapshot, ['estimated_cost']) ??
      sumKnown([estimatedMaterialCost, estimatedMachineCost, estimatedDesignCost, estimatedPostCost, estimatedOtherCost]);

    const actualMaterialCost = value(job, ['actual_material_cost']) ?? attempts?.materialCost ?? value(job?.production_closeout_snapshot, ['material_cost']);
    const actualMachineCost = value(job, ['actual_machine_cost']) ??
      (has(actualPrint) && has(job?.machine_hourly_rate) ? actualPrint * Number(job.machine_hourly_rate) : null);
    const actualDesignCost = value(job, ['actual_design_cost']) ??
      (has(actualDesign) && has(job?.design_hourly_rate) ? actualDesign * Number(job.design_hourly_rate) : null);
    const actualPostCost = value(job, ['actual_post_processing_cost','actual_post_cost']);
    const actualOtherCost = value(job, ['actual_other_cost','actual_supply_cost']);
    const actualCost = value(job, ['actual_direct_cost','actual_internal_cost']) ?? value(job?.production_closeout_snapshot, ['direct_cost']) ??
      sumKnown([actualMaterialCost, actualMachineCost, actualDesignCost, actualPostCost, actualOtherCost]);
    const revenue = storedRevenue(job);
    const estimatedProfit = has(revenue) && has(estimatedCost) ? round(revenue - estimatedCost) : null;
    const actualProfit = has(revenue) && has(actualCost) ? round(revenue - actualCost) : null;
    const estimatedMargin = has(revenue) && revenue !== 0 && has(estimatedProfit) ? round(estimatedProfit / revenue * 100) : null;
    const actualMargin = has(revenue) && revenue !== 0 && has(actualProfit) ? round(actualProfit / revenue * 100) : null;

    return {
      id:job?.id, jobTitle:job?.job_title || 'Untitled Job', orderNumber:job?.order_number || null,
      estimatedGrams, actualGoodGrams:actualGood, actualScrapGrams:actualScrap, actualConsumedGrams:actualConsumed,
      estimatedPrintHours:estimatedPrint, actualPrintHours:actualPrint,
      estimatedDesignHours:estimatedDesign, actualDesignHours:actualDesign,
      estimatedPostHours:estimatedPost, actualPostHours:actualPost,
      estimatedCost, actualCost, quotedRevenue:revenue, estimatedProfit, actualProfit, estimatedMargin, actualMargin,
      variances:{material:variance(estimatedGrams, actualConsumed, true), printTime:variance(estimatedPrint, actualPrint, true), cost:variance(estimatedCost, actualCost, true), profit:variance(estimatedProfit, actualProfit, false), margin:variance(estimatedMargin, actualMargin, false)},
      attemptCount:Array.isArray(job?.production_attempts) ? job.production_attempts.length : 0
    };
  }

  function aggregate(jobs){
    const rows = (jobs || []).map(calculate);
    const average = (selector) => {
      const values = rows.map(selector).filter(has);
      return values.length ? round(values.reduce((sum, item) => sum + item, 0) / values.length) : null;
    };
    const total = (selector) => {
      const values = rows.map(selector).filter(has);
      return values.length ? round(values.reduce((sum, item) => sum + item, 0)) : null;
    };
    const ranked = rows.filter(row => has(row.variances.material.percent)).sort((a,b)=>b.variances.material.percent-a.variances.material.percent);
    return {
      completedJobs:rows.length, rows,
      averageMaterialVariancePercent:average(row=>row.variances.material.percent),
      averagePrintTimeVariancePercent:average(row=>row.variances.printTime.percent),
      totalScrapGrams:total(row=>row.actualScrapGrams),
      estimatedProfit:total(row=>row.estimatedProfit), actualProfit:total(row=>row.actualProfit),
      estimatedMargin:average(row=>row.estimatedMargin), actualMargin:average(row=>row.actualMargin),
      marginVariance:variance(average(row=>row.estimatedMargin), average(row=>row.actualMargin), false),
      mostUnderestimated:ranked.filter(row=>row.variances.material.numeric > 0).slice(0,5),
      mostOverestimated:[...ranked].reverse().filter(row=>row.variances.material.numeric < 0).slice(0,5)
    };
  }

  return {calculate, aggregate, variance};
});
