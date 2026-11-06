import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { planLegacyHistoryImport } from '../scripts/legacy-history-dry-run.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/legacy-history/${name}.json`, import.meta.url), 'utf8'));

test('reports additions, exact replays, source changes, orphan snapshots and shared references', () => {
  const existing = fixture('existing');
  const incoming = fixture('incoming');
  const before = structuredClone({ existing, incoming });
  const plan = planLegacyHistoryImport(existing, incoming);

  assert.deepEqual(plan.counts, { add: 1, skip: 1, review: 3 });
  assert.deepEqual(plan.records.map(record => record.action), ['skip', 'add', 'review', 'review', 'review']);
  assert.match(plan.records[2].reasons[0], /archived_status/);
  assert.match(plan.records[3].reasons[0], /unresolved issues/);
  assert.deepEqual(plan.records[4].reasons, ['shared reference: 000123']);
  assert.deepEqual({ existing, incoming }, before);
});

test('rehearsing only proposed additions in memory makes a repeat propose zero additions', () => {
  const existing = fixture('existing');
  const incoming = fixture('incoming');
  const additions = new Set(planLegacyHistoryImport(existing, incoming).records
    .filter(record => record.action === 'add').map(record => record.source_key));
  const staged = [...existing, ...incoming.filter(record => additions.has(record.source_key))];
  assert.deepEqual(planLegacyHistoryImport(staged, incoming).counts, { add: 0, skip: 2, review: 3 });
});

test('reference matching preserves literal identifiers and ignores input reference ordering', () => {
  const [issued, converted] = fixture('existing');
  const differentlyOrdered = { ...converted, references: [...converted.references].reverse() };
  const shared = { ...issued, source_key: 'fixture:alternate', references: [' q-900001 '] };
  const other = { ...issued, source_key: 'fixture:other', references: ['OP-900001', 'Q-0900001'] };
  const { records } = planLegacyHistoryImport([issued, converted], [differentlyOrdered, shared, other]);
  assert.deepEqual(records.map(record => record.action), ['skip', 'review', 'add']);
  assert.deepEqual(records[1].references, [' q-900001 ']);
});

test('duplicate incoming keys and references shared within the same batch require review', () => {
  const [record] = fixture('existing');
  const competing = { ...record, source_key: 'fixture:competing' };
  assert.deepEqual(planLegacyHistoryImport([], [record, record, competing]).counts, { add: 0, skip: 0, review: 3 });
});

test('rejects out-of-contract data instead of silently dropping it', () => {
  const [record] = fixture('existing');
  assert.throws(() => planLegacyHistoryImport([], [{ ...record, payment_cents: 100 }]), /outside the history summary contract/);
  assert.throws(() => planLegacyHistoryImport([], [{ ...record, references: ['Q-900001', ' q-900001 '] }]), /repeats an archive reference/);
  assert.throws(() => planLegacyHistoryImport([record, record], []), /Existing archive repeats a source key/);
});
