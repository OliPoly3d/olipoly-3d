const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/202607200001_public_access_ownership_security_hardening.sql', 'utf8');
const track = fs.readFileSync('track.html', 'utf8');
const production = fs.readFileSync('production-control.html', 'utf8');

function has(pattern, message){ assert.match(migration, pattern, message); }
function lacks(pattern, message){ assert.doesNotMatch(migration, pattern, message); }

has(/alter table if exists public\.document_counters enable row level security;/, 'document_counters RLS must be enabled');
has(/revoke all on table public\.document_counters from anon;/, 'anon table access to document_counters must be revoked');
has(/revoke all on table public\.document_counters from authenticated;/, 'authenticated direct counter table access must be revoked');
has(/revoke execute on function public\.next_document_counter\(text\) from anon;/, 'anon must not execute counter allocation');
has(/grant execute on function public\.next_document_counter\(text\) to authenticated;/, 'authenticated users retain approved atomic counter RPC');
has(/normalized_key not in \('quote', 'order', 'invoice'\)/, 'counter keys are allowlisted');
has(/on conflict \(key\) do update[\s\S]*set value = dc\.value \+ 1/, 'counter allocation remains atomic');
has(/revoke execute on function public\.next_quote_invoice_number\(\) from authenticated;/, 'archived invoice counter must not remain browser-executable');

has(/create policy parts_catalog_owner_select[\s\S]*using \(user_id = auth\.uid\(\)\);/, 'parts_catalog reads are owner-scoped');
has(/create policy parts_catalog_owner_insert[\s\S]*with check \(user_id = auth\.uid\(\)\);/, 'parts_catalog inserts are owner-scoped');
has(/create policy parts_catalog_owner_update[\s\S]*using \(user_id = auth\.uid\(\)\)[\s\S]*with check \(user_id = auth\.uid\(\)\);/, 'parts_catalog updates are owner-scoped');
has(/revoke all on table public\.parts_catalog from anon;/, 'anon cannot access parts_catalog');
lacks(/create policy parts_catalog_owner_delete/, 'parts_catalog delete is not granted without active evidence');

has(/create policy project_events_owner_select[\s\S]*using \(user_id = auth\.uid\(\)\);/, 'project_events reads are owner-scoped');
has(/create policy project_events_owner_insert[\s\S]*with check \(user_id = auth\.uid\(\)\);/, 'project_events inserts are owner-scoped');
has(/revoke all on table public\.project_events from anon;/, 'anon cannot access project_events');
lacks(/create policy project_events_owner_update/, 'events must not be updateable by normal authenticated clients');
lacks(/create policy project_events_owner_delete/, 'events must not be deleteable by normal authenticated clients');

has(/revoke all on table public\.order_tracking_public from anon;/, 'anon direct tracking table access is revoked');
has(/drop policy if exists "Public can read tracking by lookup"/, 'deployed anonymous tracking lookup policy is removed');
has(/drop policy if exists order_tracking_public_read_all/, 'deployed read-all tracking policy is removed');
has(/drop policy if exists order_tracking_public_delete_own/, 'deployed owner delete tracking policy is replaced cleanly');
has(/drop policy if exists order_tracking_public_insert_own/, 'deployed owner insert tracking policy is replaced cleanly');
has(/drop policy if exists order_tracking_public_update_own/, 'deployed owner update tracking policy is replaced cleanly');
has(/drop policy if exists "Public can read order tracking"/, 'old overlapping public tracking policy is removed');
has(/drop policy if exists "Anon can read order tracking"/, 'old overlapping anon tracking policy is removed');
has(/create or replace function public\.public_order_tracking_lookup\(tracking_identifier text\)/, 'public lookup RPC exists');
has(/returns table \([\s\S]*order_number text[\s\S]*invoice_terms text[\s\S]*\)/, 'public lookup has an explicit allowlisted result shape');
const lookupReturnShape = migration.match(/returns table \([\s\S]*?\n\)/)?.[0] || '';
assert.doesNotMatch(lookupReturnShape, /user_id/, 'public lookup must not return user_id');
has(/where n\.lookup_order_number is not null[\s\S]*limit 1;/, 'public lookup returns at most one row');
has(/set search_path = public, pg_temp/, 'security definer RPCs use a fixed search_path');
has(/grant execute on function public\.public_order_tracking_lookup\(text\) to anon;/, 'anon receives only the narrow lookup RPC');
has(/Review gate:[\s\S]*must return zero rows[\s\S]*'anon' = any\(roles\)[\s\S]*qual = 'true'[\s\S]*coalesce\(qual, ''\) <> '\(user_id = auth\.uid\(\)\)'/, 'verification query flags anon, USING true, and cross-owner tracking policies');

assert.match(track, /\/rest\/v1\/rpc\/public_order_tracking_lookup/, 'track.html uses the narrow public lookup RPC');
assert.doesNotMatch(track, /\/rest\/v1\/order_tracking_public\?select=/, 'track.html must not query the listable tracking table');
assert.match(production, /Direct document_counters reads\/writes are intentionally denied by RLS/, 'production counter path documents the approved RPC-only contract');
assert.doesNotMatch(production, /document_counters\?select=key,value/, 'production browser code must not read counter rows directly');

console.log('public access security hardening assertions passed');
