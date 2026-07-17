const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('quote-response.html', 'utf8');

const acceptanceCalls = source.match(/rpc\('respond_to_quote_public'/g) || [];
assert.equal(acceptanceCalls.length, 1, 'public acceptance must have one authoritative RPC call');
assert.doesNotMatch(source, /link_accepted_quote_to_production/,
  'the database acceptance transaction/trigger owns Production linkage');
assert.doesNotMatch(source, /replace\(\/\^Q-\/,\s*'OP-'\)/,
  'the public client must never fabricate an Order number from a Quote number');
assert.match(source, /decision==='accepted'&&!result\?\.order_number/,
  'accepted responses must require the authoritative Order number returned by Supabase');
assert.equal((source.match(/acceptBtn'\)\.addEventListener/g) || []).length, 1,
  'the approval button must have exactly one event handler');
assert.equal((source.match(/declineBtn'\)\.addEventListener/g) || []).length, 1,
  'the change-request button must have exactly one event handler');

console.log('Release-candidate public acceptance authority assertions passed.');
