const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const authSource = fs.readFileSync('js/olipoly-auth.js', 'utf8');
const shell = fs.readFileSync('js/engine-shell.js', 'utf8');
const engineCss = fs.readFileSync('assets/css/engine-rc1.css', 'utf8');
const assetCss = fs.readFileSync('css/job-assets.css', 'utf8');
const privatePages = ['hub.html','orders-admin.html','quote.html','production-control.html','inventory-control.html','finance-pro.html','customer-360.html','product-recipes.html','campaign-manager.html','erp-handbook.html','erp-knowledge-library.html'];

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), has: key => values.has(key) };
}
function response(status, data) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
function context(initial, fetch) {
  const localStorage = storage(initial), logs = [];
  const window = { dispatchEvent() {}, addEventListener() {} };
  const sandbox = { window, localStorage, fetch, CustomEvent: function(){}, atob: value => Buffer.from(value, 'base64url').toString(), console: { log: (...x) => logs.push(x), warn: (...x) => logs.push(x), error: (...x) => logs.push(x) }, Date, JSON, Promise, Buffer, setTimeout, clearTimeout };
  window.window = window; window.localStorage = localStorage; window.fetch = fetch; window.CustomEvent = sandbox.CustomEvent;
  vm.runInNewContext(authSource, sandbox);
  return { auth: window.OliPolyAuth, localStorage, logs };
}

(async () => {
  const missing = context({}, async () => { throw new Error('unexpected request'); });
  assert.equal(await missing.auth.recover(), null, 'missing session must reach sign-in state');

  let refreshCalls = 0, userCalls = 0;
  const expired = context({ sb_token: 'expired', sb_refresh_token: 'refresh', olipoly_auth_session_v1: JSON.stringify({ access_token: 'expired', refresh_token: 'refresh', expires_at: 1 }) }, async url => {
    if (url.includes('refresh_token')) { refreshCalls += 1; return response(200, { access_token: 'fresh', refresh_token: 'fresh-refresh', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'synthetic-user' } }); }
    userCalls += 1; return response(200, { id: 'synthetic-user' });
  });
  const recovered = await expired.auth.recover();
  assert.equal(recovered.user.id, 'synthetic-user');
  assert.equal(refreshCalls, 1, 'expired session refreshes once');
  assert.equal(userCalls, 1, 'refreshed session is verified once');
  assert.equal(expired.logs.length, 0, 'credentials and session failures are not logged');

  const rejected = context({ sb_token: 'expired', sb_refresh_token: 'invalid', olipoly_auth_session_v1: JSON.stringify({ access_token: 'expired', refresh_token: 'invalid', expires_at: 1 }) }, async () => response(401, { message: 'invalid session' }));
  assert.equal(await rejected.auth.recover(), null);
  for (const key of ['sb_token','sb_refresh_token','sb_user','olipoly_auth_session_v1']) assert.equal(rejected.localStorage.has(key), false, `invalid ${key} must clear`);
  assert.equal(rejected.logs.length, 0);

  assert.match(shell, /await auth\.login\(email, password\)[\s\S]*await auth\.getUser\(\)[\s\S]*location\.reload\(\)/, 'sign-in must reload authoritative data');
  assert.match(shell, /auth\.logout\(\);[\s\S]*showSignIn/, 'sign-out must return to sign-in');
  assert.match(shell, /form\.elements\.password\.value = ''/, 'password must be discarded after failure');
  assert.doesNotMatch(shell + authSource, /console\.(?:log|warn|error)\s*\(/, 'auth runtime must not log credentials, tokens, or sessions');
  for (const page of privatePages) {
    assert.match(fs.readFileSync(page, 'utf8'), /class=["'][^"']*op-engine/, `${page} is in the private auth boundary`);
    assert.ok(shell.includes(`'${page}'`), `${page} must use the shared gate`);
  }
  for (const page of ['index.html','fundraiser.html','niles.html','quote-response.html','track.html','pay.html']) assert.doesNotMatch(fs.readFileSync(page, 'utf8'), /js\/engine-shell\.js/, `${page} must remain outside private auth`);

  for (const page of ['product-recipes.html','customer-360.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /class="wrap engine-assets-container"><div data-job-assets>/, `${page} assets must align to shared container`);
  }
  assert.match(engineCss, /--op-container:\s*1440px/);
  assert.match(engineCss, /\.engine-assets-container[\s\S]*max-width:\s*var\(--op-container\)/);
  assert.match(engineCss, /\.engine-auth-form[\s\S]*grid-template-columns:[^;]*minmax/);
  assert.match(engineCss, /@media \(max-width: 768px\)[\s\S]*\.engine-auth-form[\s\S]*minmax\(0, 1fr\)/);
  assert.match(engineCss, /\.engine-auth-gate button[^}]*min-height:\s*44px/);
  for (const required of ['min-width:0','max-width:100%','flex-wrap:wrap']) assert.ok(assetCss.replace(/\s/g,'').includes(required), `asset CSS missing ${required}`);
  assert.match(assetCss, /input\[type="file"\][^{]*\{[^}]*width:100%/);

  console.log('Engine RC2.2 authentication recovery and width correction assertions passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
