const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authority = require('../js/browser-recovery-authority.js');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('cloud success replaces every cached production lifecycle value', () => {
  const cache = authority.envelope([{id:'job-1', production_status:'ready_to_print'}], {ownerId:'A'});
  const result = authority.hydrate({cloudSucceeded:true, cloudData:[{id:'job-1', production_status:'qc'}], cacheValue:cache, ownerId:'A'});
  assert.equal(result.mode, 'authoritative');
  assert.equal(result.data[0].production_status, 'qc');
  assert.equal(result.commandsEnabled, true);
});

test('cache is recovery-only after definitive cloud failure and disables commands', () => {
  const now = Date.now();
  const cache = authority.envelope([{id:'job-1', production_status:'printing'}], {ownerId:'A', capturedAt:new Date(now).toISOString()});
  const result = authority.hydrate({cloudSucceeded:false, cacheValue:cache, ownerId:'A', ttlMs:60_000, now});
  assert.equal(result.mode, 'recovery');
  assert.equal(result.commandsEnabled, false);
});

test('wrong-user, expired, and old-version operational caches are ignored', () => {
  const now = Date.now();
  const cache = authority.envelope([], {ownerId:'A', capturedAt:new Date(now - 61_000).toISOString()});
  assert.equal(authority.inspect(cache, {ownerId:'B', ttlMs:60_000, now}).reason, 'owner-mismatch');
  assert.equal(authority.inspect(cache, {ownerId:'A', ttlMs:60_000, now}).reason, 'expired');
  assert.equal(authority.inspect({...cache, cacheVersion:0}, {ownerId:'A'}).reason, 'cache-version');
});

test('generic payloads cannot write command-owned lifecycle fields', () => {
  const editable = authority.stripCommandOwnedFields({notes:'safe', status:'closed', production_status:'qc', remaining_grams:1});
  assert.deepEqual(editable, {notes:'safe'});
});

test('runtime pages contain P0 containment boundaries', () => {
  assert.match(read('production-control.html'), /authorityMode !== 'authoritative'/);
  assert.match(read('js/production-status-persistence.js'), /authoritativeHydration/);
});

test('quote recovery strips accepted and conversion lifecycle identity', () => {
  const source = read('quote.js');
  assert.match(source, /\['quoteStatus','customerResponse','convertedToOrder','convertedOrderNumber','productionJobId'\]/);
  assert.match(source, /mergeSavedQuoteRowIntoFields\(row\.quoteData\?\.fields \|\| \{}, \{}\)/);
});

test('logout and user switch clear operational caches without Finance keys', () => {
  const auth = read('olipoly-auth.js');
  assert.match(auth, /AUTH_USER_CHANGED_CACHE_CLEARED/);
  assert.match(auth, /clearOperationalCaches\(\)/);
  const keys = auth.match(/const OPERATIONAL_CACHE_KEYS[\s\S]*?\]\);/)?.[0] || '';
  assert.doesNotMatch(keys, /finance/i);
});
