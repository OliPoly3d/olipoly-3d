const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/ops-preview/cloud.js');
const config = {projectRef: C.TEST_REF, url: `https://${C.TEST_REF}.supabase.co`, publishableKey: 'sb_publishable_fixture'};
function fixture(fetch) {
  const data = new Map();
  const storage = {getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k)};
  return {client: C.create(config, {storage, fetch}), data};
}
const ok = value => ({ok: true, status: 200, json: async () => value});
const login = {access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Date.now()/1000 + 3600, user: {id: 'fixture-user'}};

test('cloud adapter refuses a production host or a private key', () => {
  for (const overrides of [{url: 'https://other.supabase.co'}, {projectRef: 'other'}, {publishableKey: 'sb_secret_not_allowed'}]) {
    assert.throws(() => C.create({...config,...overrides}), /only its separate test project/);
  }
});

test('an uncertain commit retries its exact identity and body without duplicating a command', async () => {
  const requests = [];
  const {client} = fixture(async (url, request) => {
    requests.push({url,...request});
    if (url.includes('/auth/')) return ok(login);
    if (requests.length === 2) throw new Error('network loss after commit');
    return ok({revision: 2});
  });
  await client.auth('fixture@example.test', 'fictional-password');
  await assert.rejects(client.save({id:'order-1'}, {type:'pay'}, 1), /Connection interrupted/);
  assert.ok(client.pending());
  await assert.rejects(client.save({id:'order-1'}, {type:'pay'}, 1), /Retry the pending command/);
  assert.deepEqual(await client.retry(), {revision:2});
  assert.equal(requests[1].body, requests[2].body);
  assert.equal(client.pending(), null);
  assert.equal(requests[1].headers.Authorization, 'Bearer fixture-token');
});

test('explicit stale-write rejection clears pending state; timeouts retain it', async () => {
  let status = 400;
  const {client} = fixture(async url => url.includes('/auth/') ? ok(login) : {ok:false,status,json:async()=>({code:'40001',message:'Reload before saving.'})});
  await client.auth('fixture@example.test', 'fictional-password');
  await assert.rejects(client.save({id:'order-1'}, {type:'release'}, 1), /Reload/);
  assert.equal(client.pending(), null);
  status = 504;
  await assert.rejects(client.save({id:'order-1'}, {type:'release'}, 1));
  assert.ok(client.pending());
});

test('public tracking uses the existing RPC without exposing a login token', async () => {
  let request;
  const {client} = fixture(async (url, options) => {request={url,...options};return ok([{order_number:'OP-000001'}]);});
  await client.tracking('OP-000001');
  assert.ok(request.url.endsWith('/rest/v1/rpc/public_order_tracking_lookup'));
  assert.deepEqual(JSON.parse(request.body), {tracking_identifier:'OP-000001'});
  assert.equal(request.headers.Authorization, undefined);
});

test('confirmation-required signup does not create an authenticated session', async () => {
  const {client} = fixture(async () => ok({user:{id:'new-user'}}));
  const result = await client.auth('fixture@example.test', 'fictional-password', true);
  assert.equal(result.confirmationRequired, true);
  assert.equal(client.signedIn(), false);
});

test('pending commands survive signing out and stay scoped to their test account', async () => {
  let fail = true;
  const {client} = fixture(async (url, request) => {
    const body = JSON.parse(request.body);
    if (url.includes('/auth/')) return ok({...login,user:{id:body.email}});
    if (fail) throw new Error('connection lost');
    return ok({revision:2});
  });
  await client.auth('one@example.test','fictional-password');
  await assert.rejects(client.save({id:'one'},{type:'pay'},1));
  client.signOut();
  await client.auth('two@example.test','fictional-password');
  assert.equal(client.pending(),null);
  fail = false;
  await client.save({id:'two'},{type:'save'},1);
  client.signOut();
  await client.auth('one@example.test','fictional-password');
  assert.ok(client.pending());
  await client.retry();
  assert.equal(client.pending(),null);
});
