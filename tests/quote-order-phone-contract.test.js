"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync("supabase/migrations/202608020006_repair_quote_order_optional_phone.sql", "utf8");
const quoteSchemaFields = new Set([
  "id", "user_id", "quote_number", "quote_title", "quote_total", "quote_data",
  "customer_name", "customer_email", "customer_response", "converted_to_order",
  "converted_order_number"
]);
const references = [...migration.matchAll(/\bv_quote\.([a-z_][a-z0-9_]*)/g)].map((match) => match[1]);
const invalid = [...new Set(references.filter((field) => !quoteSchemaFields.has(field)))];

assert.deepEqual(invalid, [], `respond_to_quote_public has invalid public.quotes row fields: ${invalid.join(", ")}`);
assert.doesNotMatch(migration, /v_quote\.customer_phone/, "RPC must not access a nonexistent Quote row field");
assert.match(migration, /v_customer_phone text;/);
assert.match(migration, /quote_data #>> '\{fields,customerPhone\}'/, "current quote_data.fields phone is authoritative");
assert.match(migration, /quote_data #>> '\{production_draft,customer_phone\}'/, "legacy Production-linked Quote phone remains supported");
assert.match(migration, /lower\(coalesce\(v_customer_phone,''\)\) in \('n\/a','na','none','not available','not provided','unknown','-','—'\)/);
assert.match(migration, /jsonb_build_object\('name', v_quote\.customer_name, 'email', v_quote\.customer_email, 'phone', v_customer_phone\)/);
assert.match(migration, /customer_name, customer_email, customer_phone, order_title[\s\S]*v_quote\.customer_name, v_quote\.customer_email, v_customer_phone, v_order_title/);

function normalizePhone(value) {
  const trimmed = String(value ?? "").trim();
  return ["n/a", "na", "none", "not available", "not provided", "unknown", "-", "—"].includes(trimmed.toLowerCase()) ? null : (trimmed || null);
}
for (const missing of [undefined, null, "", "   ", "n/a", "N/A", "none", "Not provided"]) {
  assert.equal(normalizePhone(missing), null, `${String(missing)} must normalize to SQL null`);
}
assert.equal(normalizePhone("  330-555-0123  "), "330-555-0123", "valid phone transfers without invention");

for (const contract of [
  /security definer[\s\S]*set search_path = public, pg_temp/,
  /from public\.quotes[\s\S]*for update;/,
  /public\.allocate_order_number\(\)/,
  /on conflict \(source_quote_number\)[\s\S]*do nothing/,
  /actual_usage_captured/,
  /revoke execute[\s\S]*grant execute[\s\S]*anon, authenticated, service_role/
]) assert.match(migration, contract);

console.log("Quote-to-Order optional phone and row schema contracts passed.");
