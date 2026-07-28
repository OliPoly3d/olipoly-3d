const assert = require('node:assert/strict');
const fs = require('node:fs');
const evidence = require('../js/production-evidence.js');

for(const value of [null, undefined, '', '   ']) assert.equal(evidence.nullableNumber(value), null);
assert.equal(evidence.nullableNumber(0), 0);
assert.equal(evidence.nullableNumber('0'), 0);
assert.equal(evidence.nullableNumber('12.5'), 12.5);
for(const value of ['invalid', NaN, Infinity, -Infinity]) assert.throws(()=>evidence.nullableNumber(value), /finite number/);
assert.deepEqual(evidence.actualPatch({notes:'unchanged'}), {});
assert.deepEqual(evidence.actualPatch({actual_grams_used:'', scrap_grams:'0'}), {actual_grams_used:null, scrap_grams:0});
assert.equal(evidence.nullableString('  P1S '), 'P1S');
assert.equal(evidence.nullableString('  '), null);
assert.equal(evidence.nullableJson([]), null);
assert.equal(evidence.nullableJson('{}'), null);
assert.deepEqual(evidence.nullableJson('[{"grams":0}]'), [{grams:0}]);
assert.equal(evidence.hasActualEvidence({actual_grams_used:null}), false);
assert.equal(evidence.hasActualEvidence({actual_grams_used:0}), true);

const clean = evidence.normalizeActuals({});
for(const key of evidence.ALL_FIELDS) assert.equal(clean[key], null, `${key} must initialize as null`);
const roundTrip = JSON.parse(JSON.stringify({...clean, actual_grams_used:0}));
assert.equal(roundTrip.scrap_grams, null, 'export/import must preserve null');
assert.equal(roundTrip.actual_grams_used, 0, 'export/import must preserve explicit zero');

const production = fs.readFileSync('production-control.html','utf8');
assert.match(production, /omitActualEvidence\(full\)/, 'ordinary cloud PATCH payload must omit actual evidence');
assert.doesNotMatch(production, /actual_grams_used:\s*num\(full/, 'ordinary persistence must not manufacture zero actuals');
assert.match(production, /legacy production evidence and cannot be promoted/, 'handoff must explain legacy evidence without clearing it');

const migration = fs.readFileSync('supabase/migrations/202607280005_repair_preproduction_zero_actual_contamination.sql','utf8');
assert.match(migration, /actual_grams_used = 0 and scrap_grams = 0 and actual_print_hours = 0 and actual_quantity = 0/);
assert.match(migration, /production_status in \('estimate','waiting_customer'\)/);
assert.match(migration, /order_number is null/);
assert.match(migration, /production_attempts/);
assert.match(migration, /roll_usages/);
assert.doesNotMatch(migration, /actual_grams_used\s*=\s*case/i, 'RPC rejection semantics must not be rewritten');

console.log('production evidence NULL semantics tests passed');
