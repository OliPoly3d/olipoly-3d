const assert = require('node:assert/strict');
const fs = require('node:fs');

const trace = fs.readFileSync(
  'supabase/migrations/202608100005_trace_consume_production_attempt_statements.sql',
  'utf8',
);

const markers = [
  'ENTER',
  'AFTER_ARGUMENT_VALIDATION',
  'AFTER_COMMAND_LOCK',
  'AFTER_RECEIPT_LOOKUP',
  'AFTER_PRODUCTION_JOB_LOCK',
  'AFTER_PRODUCTION_CONCURRENCY_CHECK',
  'AFTER_ORDER_VALIDATION',
  'AFTER_ATTEMPT_RESOLUTION',
  'AFTER_ROLL_USAGE_VALIDATION',
  'BEFORE_RESERVATION_ROLL_LOCK',
  'AFTER_RESERVATION_ROLL_LOCK',
  'BEFORE_RAW_MATERIAL_UPDATE',
  'AFTER_RAW_MATERIAL_UPDATE',
  'BEFORE_RESERVATION_UPDATE',
  'AFTER_RESERVATION_UPDATE',
  'BEFORE_INVENTORY_TRANSACTION_INSERT',
  'AFTER_INVENTORY_TRANSACTION_INSERT',
  'BEFORE_RECEIPT_INSERT',
  'AFTER_RECEIPT_INSERT',
  'RETURNING',
];

for (const marker of markers) {
  assert.match(trace, new RegExp(`OP_ATTEMPT_CONSUME marker=${marker}\\b`));
}

const logStatements = trace.match(/raise log '[^']+'[^;]+;/g) || [];
assert.ok(logStatements.length >= markers.length);
for (const statement of logStatements) {
  for (const field of [
    'correlation_id=%',
    'attempt_id=%',
    'production_job_id=%',
    'backend_pid=%',
    'txid=%',
    'roll_id=%',
    'at=%',
  ]) {
    assert.match(statement, new RegExp(field.replace('%', '\\%')));
  }
  assert.match(statement, /pg_backend_pid\(\)/);
  assert.match(statement, /txid_current_if_assigned\(\)/);
  assert.match(statement, /clock_timestamp\(\)/);
}

assert.match(trace, /set_config\('lock_timeout','2000ms',true\)/);
assert.match(trace, /security definer[\s\S]*set search_path=public,pg_temp/i);
assert.doesNotMatch(trace, /raise log[^;]*(payload|order_number|quote_number|customer)/i);
assert.match(trace, /revoke execute on function public\.consume_production_attempt\(uuid,text,text,timestamptz,jsonb,text\) from public,anon/i);
assert.match(trace, /grant execute on function public\.consume_production_attempt\(uuid,text,text,timestamptz,jsonb,text\) to authenticated,service_role/i);

console.log('Temporary consume_production_attempt statement trace assertions passed.');
