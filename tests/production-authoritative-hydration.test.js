const assert = require('node:assert/strict');
const fs = require('node:fs');
const persistence = require('../js/production-status-persistence.js');

const localA = {id:'A', job_title:'A', production_status:'ready_to_print'};
const localB = {id:'B', job_title:'B', production_status:'ready_to_print'};
const remoteQc = {id:'A', job_title:'A', production_status:'qc'};

let result = persistence.authoritativeHydration([remoteQc], [localA, localB]);
assert.deepEqual(result.jobs.map(row => row.id), ['A'], 'a successful authoritative refresh removes local-only B');
assert.equal(result.jobs[0].production_status, 'qc', 'the authoritative lifecycle status wins');
assert.deepEqual(result.ghosts.map(row => row.id), ['B']);

const survivor = {
  id:'27be9786-47bb-4e20-a4b5-5ad05c407f08',
  job_title:'Survivor Tree Puzzles',
  production_status:'ready_to_print'
};
result = persistence.authoritativeHydration([], [survivor]);
assert.deepEqual(result.jobs, [], 'a deleted Survivor row cannot be resurrected by browser recovery');
assert.equal(result.ghosts[0].id, survivor.id);

const auditEvents = [{event:'production_job_saved', job_id:'X', title:'Historical job'}];
result = persistence.authoritativeHydration([], [], value => value, auditEvents);
assert.deepEqual(result.jobs, [], 'audit history is not an input to active Production hydration');

assert.deepEqual(
  persistence.offlineRecovery([localA]),
  [localA],
  'local Production recovery remains available only on the explicit fetch-failure path'
);

result = persistence.authoritativeHydration([], [localA, localB]);
assert.deepEqual(result.jobs, [], 'a successful empty cloud response renders zero jobs');

for(const status of ['qc', 'printing']){
  result = persistence.authoritativeHydration(
    [{...remoteQc, production_status:status}],
    [{...localA, production_status:'ready_to_print'}]
  );
  assert.equal(result.jobs[0].production_status, status, `${status} persists across authoritative hydration`);
}

const production = fs.readFileSync(require.resolve('../production-control.html'), 'utf8');
const cloudLoader = production.slice(production.indexOf('async function loadCloudJobs'), production.indexOf('async function migrateVisibleJobsToCloud'));
assert.doesNotMatch(cloudLoader, /return \[\][\s\S]*catch|Cloud load failed/, 'fetch failure must not be represented as a successful empty result');
assert.match(production, /state\.authorityMode = 'offline-recovery'/);
assert.match(production, /Offline recovery: showing browser Production data/);
assert.match(production, /Removed stale Production cache record absent from authoritative dataset/);
assert.doesNotMatch(production, /erp_event_log_v1[\s\S]*state\.jobs/, 'audit event storage cannot hydrate active cards');

const cancel = production.slice(production.indexOf('async function cancelJob'), production.indexOf('async function deleteJob'));
assert.match(cancel, /Production job not found for authenticated owner/);
assert.match(cancel, /await refreshAuthoritativeProductionState\(\)/);
assert.match(cancel, /removeProductionRecoveryRecord\(id\)/);
assert.match(cancel, /stale local card was removed/);

console.log('Authoritative Production hydration assertions passed.');
