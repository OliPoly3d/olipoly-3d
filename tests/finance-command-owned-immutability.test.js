const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202608110002_finance_command_owned_immutability.sql', 'utf8');
const verification = fs.readFileSync('supabase/verification/finance_command_owned_immutability.sql', 'utf8');
const finance = fs.readFileSync('finance-pro.js', 'utf8');
const correction = fs.readFileSync('supabase/migrations/202608020003_repair_finance_adjustment_helper_resolution.sql', 'utf8');
const posting = fs.readFileSync('supabase/migrations/202608100004_orders_close_and_finance_finalization.sql', 'utf8');

assert.match(migration, /alter table public\.financial_entries enable row level security/i);
assert.match(migration, /cmd in \('UPDATE', 'DELETE', 'ALL'\)[\s\S]*roles && array\['authenticated'::name\][\s\S]*roles && array\['public'::name\]/i);
assert.match(migration, /financial_entries_owner_update_manual_only[\s\S]*auth\.uid\(\) = user_id[\s\S]*not coalesce\(finance_command_owned, false\)[\s\S]*finance_command_id is null[\s\S]*order_id is null[\s\S]*correction_of_entry_id is null/i);
assert.match(migration, /financial_entries_owner_delete_manual_only[\s\S]*auth\.uid\(\) = user_id[\s\S]*not coalesce\(finance_command_owned, false\)/i);

for (const field of ['user_id', 'order_id', 'order_number', 'finance_command_owned', 'finance_command_id', 'finance_command', 'posted_by', 'posted_at']) {
  assert.match(migration.match(/revoke update\(([\s\S]*?)\) on public\.financial_entries/)?.[1] || '', new RegExp(`\\b${field}\\b`), `${field} is not browser-updatable`);
}

const guard = migration.match(/create or replace function public\.guard_command_owned_financial_entry_mutation\(\)([\s\S]*?)\$function\$;/i)?.[1] || '';
for (const marker of ['finance_command_owned', 'finance_command_id', 'finance_command', 'order_id', 'order_number', 'posted_by', 'posted_at', 'correction_of_entry_id', 'reversal_of_entry_id', 'replacement_for_entry_id', 'correction_group_id', 'correction_kind']) {
  assert.match(guard, new RegExp(`old\\.${marker}`), `${marker} makes a row immutable`);
}
assert.match(guard, /Posted Finance entries are immutable; create an append-only correction instead\./);
assert.match(guard, /if tg_op = 'UPDATE' then return new; end if;[\s\S]*return old;/i, 'eligible manual UPDATE and DELETE operations retain normal trigger behavior');
assert.match(migration, /before update or delete on public\.financial_entries/i);
assert.doesNotMatch(guard, /current_setting|session|bypass|auth\.uid|new\./i, 'guard has no caller-controlled bypass');

assert.match(finance, /rpc\('create_manual_financial_entry'/, 'manual income/expense creation remains RPC-controlled');
assert.match(finance, /rpc\('update_manual_financial_entry'/, 'manual income/expense editing remains RPC-controlled');
assert.match(finance, /rpc\('delete_manual_financial_entry'/, 'manual income/expense deletion remains RPC-controlled');
assert.doesNotMatch(finance, /from\('financial_entries'\)\.(update|delete|insert)/, 'Finance Pro does not depend on direct table mutation');
assert.match(finance, /This Finance entry is posted and cannot be edited\. Create an append-only correction instead\./, 'UI gives correction-only guidance');

assert.doesNotMatch(correction, /update public\.financial_entries|delete from public\.financial_entries/i, 'correction remains append-only');
assert.match(correction, /where command_identity=p_correlation_id[\s\S]*'idempotent',true/i, 'correction retry remains idempotent');
assert.match(correction, /insert into public\.finance_correction_receipts/i, 'correction receipt remains authoritative');
assert.match(posting, /insert into public\.financial_entries[\s\S]*finance_command_owned[\s\S]*update public\.orders[\s\S]*finance_pushed=true/i, 'Order posting and finance_pushed remain atomic');

for (const evidence of ['has_any_column_privilege', 'authenticated_delete', 'service_role_insert', 'service_role_post_rpc', 'authenticated_correction_rpc', 'pg_policies', 'pg_get_triggerdef', 'function_definition_md5', 'command_owned_rows']) {
  assert.match(verification, new RegExp(evidence), `verification includes ${evidence}`);
}
assert.doesNotMatch(verification, /\b(update|delete|insert)\s+(public\.)?financial_entries\b/i, 'live verification is read-only');

console.log('Finance command-owned immutability contract passed.');
