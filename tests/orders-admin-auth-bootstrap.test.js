const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const authSource = fs.readFileSync(require.resolve('../olipoly-auth.js'), 'utf8');
const ordersSource = fs.readFileSync(require.resolve('../orders-admin.html'), 'utf8');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

(async () => {
  const user = { id: 'owner-1', email: 'owner@example.com' };
  const saved = JSON.stringify({ access_token: 'authenticated-token', refresh_token: 'refresh-token', user });
  const calls = [];
  const localStorage = storage({ olipoly_auth_session_v1: saved, sb_token: 'authenticated-token', sb_refresh_token: 'refresh-token', sb_user: JSON.stringify(user) });
  const window = { localStorage, dispatchEvent() {} };
  window.window = window;
  const context = { window, localStorage, CustomEvent: function(){}, atob: value => Buffer.from(value, 'base64url').toString(), Date, JSON, Promise,
    fetch: async (url, init = {}) => { calls.push({ url, init }); return response(200, url.includes('/auth/v1/user') ? user : []); }
  };
  window.fetch = context.fetch;
  vm.runInNewContext(authSource, context);

  const firstClient = window.OliPolyAuth;
  const restored = await firstClient.getSession();
  assert.equal(restored.user.id, user.id, 'authenticated reload restores the owner session');
  assert.equal((await firstClient.getUser()).id, user.id, 'auth.uid identity remains available after successful login/session restoration');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer authenticated-token', 'user validation sends the bearer token');

  vm.runInNewContext(authSource, context);
  assert.equal(window.OliPolyAuth, firstClient, 'a duplicate script cannot create an anonymous replacement client');
  assert.equal(firstClient.clientInstanceKey, 'olipoly-shared-auth-v1');
  assert.equal(firstClient.persistSession, true);
  assert.equal(firstClient.detectSessionInUrl, false);

  assert.match(ordersSource, /await window\.OliPolyAuth\.getSession\(\)/, 'Orders waits for session restoration during bootstrap');
  assert.match(ordersSource, /await window\.OliPolyAuth\.login\(email, password\)/, 'Orders login uses the shared authenticated client');
  assert.doesNotMatch(ordersSource, /createClient\s*\(/, 'Orders never creates a second Supabase client');
  assert.match(ordersSource, /\.\.\.\(options\.headers \|\| \{\}\),\s*\.\.\.\(accessToken \? \{Authorization:/, 'REST bearer authorization cannot be stripped by caller headers');
  console.log('Orders Admin authenticated bootstrap assertions passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
