const assert = require('node:assert/strict');
const analytics = require('../js/estimate-actual-analytics.js');

const complete = {
  id:'job-1', job_title:'Production Run', order_number:'OP-1001', quantity:2,
  estimated_total_grams:100, estimated_total_hours:4,
  estimated_design_hours:2, estimated_post_processing_hours:1,
  estimated_direct_cost:60, quote_totals_snapshot:{total:150},
  actual_direct_cost:75, actual_design_hours:2.5, actual_post_processing_hours:1.25,
  production_attempts:[
    {id:'failed', good_grams:0, scrap_grams:30, actual_print_hours:1, failure_reason:'layer shift'},
    {id:'reprint', good_grams:95, scrap_grams:5, actual_print_hours:4.5}
  ]
};

const result = analytics.calculate(complete);
assert.equal(result.actualGoodGrams, 95);
assert.equal(result.actualScrapGrams, 35);
assert.equal(result.actualConsumedGrams, 130, 'failed print and successful reprint consumption are aggregated');
assert.equal(result.actualPrintHours, 5.5, 'attempt print time is preserved and aggregated');
assert.equal(result.estimatedProfit, 90);
assert.equal(result.actualProfit, 75);
assert.equal(result.estimatedMargin, 60);
assert.equal(result.actualMargin, 50);
assert.deepEqual(result.variances.material, {numeric:30, percent:30, direction:'unfavorable'});
assert.deepEqual(result.variances.profit, {numeric:-15, percent:-16.6667, direction:'unfavorable'});

const favorableJob = {...complete, id:'job-2', production_attempts:[{good_grams:75, scrap_grams:5, actual_print_hours:3}], actual_direct_cost:45};
const favorable = analytics.calculate(favorableJob);
assert.equal(favorable.variances.material.direction, 'favorable');
assert.equal(favorable.variances.printTime.direction, 'favorable');
assert.equal(favorable.variances.cost.direction, 'favorable');
assert.equal(favorable.variances.profit.direction, 'favorable');

const missing = analytics.calculate({id:'missing', job_title:'Missing actuals', estimated_total_grams:100});
assert.equal(missing.actualGoodGrams, null);
assert.equal(missing.actualScrapGrams, null);
assert.equal(missing.actualConsumedGrams, null, 'missing actuals are not converted to zero');
assert.equal(missing.actualCost, null);
assert.equal(missing.actualProfit, null);
assert.equal(missing.variances.material.direction, 'unavailable');

const zero = analytics.calculate({id:'zero', estimated_total_grams:0, actual_grams_used:10, quote_totals_snapshot:{total:0}, estimated_direct_cost:0, actual_direct_cost:5});
assert.equal(zero.variances.material.numeric, 10);
assert.equal(zero.variances.material.percent, null, 'zero estimate never becomes a percentage denominator');
assert.equal(zero.estimatedMargin, null, 'zero revenue never becomes a margin denominator');
assert.equal(zero.actualMargin, null);

const inventoryCost = analytics.calculate({
  id:'cost-basis', estimated_direct_cost:20, quote_total:50, machine_hourly_rate:2,
  actual_print_hours:2, actual_design_cost:0, actual_post_processing_cost:0, actual_supply_cost:0,
  production_attempts:[{good_grams:90, scrap_grams:10, roll_usages:[{grams_used:100,cost_per_gram:0.12}]}]
});
assert.equal(inventoryCost.actualCost, 16, 'recorded roll cost basis and attempt use feed actual internal cost');

const aggregate = analytics.aggregate([complete, favorableJob, {id:'missing', job_title:'Missing actuals', estimated_total_grams:100}]);
assert.equal(aggregate.completedJobs, 3);
assert.equal(aggregate.totalScrapGrams, 40);
assert.equal(aggregate.estimatedProfit, 180, 'aggregate excludes unavailable values rather than treating them as zero');
assert.equal(aggregate.mostUnderestimated[0].id, 'job-1');
assert.equal(aggregate.mostOverestimated[0].id, 'job-2');

const fs = require('node:fs');
const html = fs.readFileSync(require.resolve('../production-control.html'), 'utf8');
assert.match(html, /production-control\.html\?job=\$\{encodeURIComponent\(row\.id/);
assert.match(html, /orders-admin\.html\?order=\$\{encodeURIComponent\(row\.orderNumber/);
assert.match(html, /p\.get\('job'\)/, 'Production deep link query is handled');

console.log('Estimate-vs-actual calculations, missing data, attempts, variance, and deep links passed.');
