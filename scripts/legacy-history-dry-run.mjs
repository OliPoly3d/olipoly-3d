import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Keep prefixes and leading zeroes. Normalization is only for reference matching.
const referenceKey = reference => reference.replace(/^ +| +$/g, '').toUpperCase();

function snapshot(records, label) {
  if (!Array.isArray(records)) throw new Error(`${label} must be an array of records.`);
  return records.map((record, index) => {
    const at = `${label} record ${index + 1}`;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`${at} must be an object.`);
    }
    const { source_key, record_type, archived_status, related_order, evidence, open_issues, references } = record;
    const fields = { source_key, record_type, archived_status, related_order, evidence, open_issues, references };
    if (Object.keys(record).some(name => !Object.hasOwn(fields, name))) {
      throw new Error(`${at} contains fields outside the history summary contract.`);
    }
    for (const [name, value] of Object.entries({ source_key, record_type, archived_status })) {
      if (typeof value !== 'string' || !value.trim()) throw new Error(`${at} requires ${name}.`);
    }
    if (related_order !== null && (typeof related_order !== 'string' || !related_order.trim())) {
      throw new Error(`${at} requires an explicit related_order or null.`);
    }
    for (const [name, values] of Object.entries({ evidence, open_issues, references })) {
      if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim())) {
        throw new Error(`${at} requires ${name} to be an array of nonblank strings.`);
      }
    }
    if (!references.length || references.some(value => [...value.replace(/^ +| +$/g, '')].length > 128)) {
      throw new Error(`${at} requires references of 1–128 characters.`);
    }
    const keys = references.map(referenceKey);
    if (new Set(keys).size !== keys.length) throw new Error(`${at} repeats an archive reference.`);
    return { ...fields, references: [...references].sort() };
  });
}

export function planLegacyHistoryImport(existingRecords, incomingRecords) {
  const existing = snapshot(existingRecords, 'Existing archive');
  const incoming = snapshot(incomingRecords, 'Incoming batch');
  const bySource = new Map(existing.map(record => [record.source_key, record]));
  if (bySource.size !== existing.length) throw new Error('Existing archive repeats a source key.');

  const countsBySource = new Map();
  for (const { source_key } of incoming) countsBySource.set(source_key, (countsBySource.get(source_key) ?? 0) + 1);
  const byReference = new Map();
  for (const { source_key, references } of [...existing, ...incoming]) {
    for (const reference of references) {
      const key = referenceKey(reference);
      if (!byReference.has(key)) byReference.set(key, new Set());
      byReference.get(key).add(source_key);
    }
  }

  const counts = { add: 0, skip: 0, review: 0 };
  const records = incoming.map(record => {
    const { source_key, references, open_issues } = record;
    const prior = bySource.get(source_key);
    const reasons = [];
    if (countsBySource.get(source_key) > 1) reasons.push('duplicate source key in incoming batch');
    let action = 'review';
    if (prior) {
      const changed = Object.keys(record).filter(field => JSON.stringify(prior[field]) !== JSON.stringify(record[field]));
      if (changed.length) reasons.push(`source record differs from the archive: ${changed.join(', ')}`);
      if (!reasons.length) action = 'skip';
    } else {
      for (const reference of references) {
        if (byReference.get(referenceKey(reference)).size > 1) reasons.push(`shared reference: ${reference}`);
      }
      if (open_issues.length) reasons.push('source has unresolved issues');
      if (!reasons.length) action = 'add';
    }
    counts[action]++;
    return { source_key, references, action, reasons };
  });
  return { mode: 'dry-run', counts, records };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [existingPath, incomingPath, ...extra] = process.argv.slice(2);
    if (!existingPath || !incomingPath || extra.length) {
      throw new Error('Usage: node scripts/legacy-history-dry-run.mjs EXISTING.json INCOMING.json');
    }
    const [existing, incoming] = await Promise.all([existingPath, incomingPath].map(async path => JSON.parse(await readFile(path, 'utf8'))));
    console.log(JSON.stringify(planLegacyHistoryImport(existing, incoming), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
