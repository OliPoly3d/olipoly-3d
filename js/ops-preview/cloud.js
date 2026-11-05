(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyOpsCloud = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const TEST_REF = 'llscjdyiiatmuqhilube';
  function create(config, options = {}) {
    if (config?.projectRef !== TEST_REF || config.url !== `https://${TEST_REF}.supabase.co` || !config.publishableKey?.startsWith('sb_publishable_')) {
      throw new Error('The workspace accepts only its separate test project and a public publishable key.');
    }
    const fetch = options.fetch || root.fetch.bind(root);
    const storage = options.storage || root.sessionStorage;
    const now = options.now || Date.now;
    const sessionKey = `olipoly.ops.test.${TEST_REF}.session`;
    const pendingKey = () => `olipoly.ops.test.${TEST_REF}.pending.${session?.user?.id || 'signed-out'}`;
    const read = key => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
    let session = read(sessionKey);
    function storeSession(value) {
      session = value;
      if (value) storage.setItem(sessionKey, JSON.stringify(value));
      else storage.removeItem(sessionKey);
    }
    async function request(path, body, token) {
      let response;
      try {
        response = await fetch(config.url + path, {method: 'POST', headers: {
          apikey: config.publishableKey, 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})
        }, body: JSON.stringify(body)});
      } catch {
        const error = new Error('Connection interrupted. A saved command may already have completed. Retry the pending command before continuing.');
        error.uncertain = true; throw error;
      }
      let result;
      try { result = await response.json(); }
      catch {
        const error = new Error('The server response was incomplete. Retry the pending command before continuing.');
        error.uncertain = true; throw error;
      }
      if (!response.ok) {
        const error = new Error(result.message || result.error_description || result.msg || 'The test project rejected this request.');
        error.code = result.code || response.status;
        // A gateway timeout may arrive after a committed database transaction.
        error.uncertain = response.status >= 500;
        throw error;
      }
      return result;
    }
    async function token() {
      if (!session?.access_token) throw new Error('Sign in to the test project.');
      if ((session.expires_at || 0) * 1000 < now() + 60000) {
        const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {refresh_token: session.refresh_token});
        storeSession(refreshed);
      }
      return session.access_token;
    }
    async function auth(email, password, signup = false) {
      const result = await request(signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', {email, password});
      // Signup can require email confirmation; it must not masquerade as a login.
      if (result.access_token) storeSession(result);
      return {signedIn: !!result.access_token, confirmationRequired: !result.access_token};
    }
    async function rpc(name, params = {}, publicCall = false) {
      const allowed = publicCall ? ['public_order_tracking_lookup'] : ['ops_preview_initialize', 'ops_preview_load', 'ops_preview_commit', 'ops_preview_history_lookup'];
      if (!allowed.includes(name)) throw new Error('Unsupported test workspace command.');
      return request(`/rest/v1/rpc/${name}`, params, publicCall ? undefined : await token());
    }
    function pending() {
      const value = read(pendingKey());
      return value && value.userId === session?.user?.id ? value : null;
    }
    async function retry() {
      const value = pending();
      if (!value) throw new Error('No pending command for this test account.');
      try {
        const state = await rpc('ops_preview_commit', value.params);
        storage.removeItem(pendingKey());
        return state;
      } catch (error) {
        // Only an explicit database rejection proves that the transaction rolled back.
        if (!error.uncertain && error.code !== 401) storage.removeItem(pendingKey());
        throw error;
      }
    }
    async function save(order, action, revision) {
      if (pending()) throw new Error('Retry the pending command before making another change.');
      const value = {userId: session?.user?.id, params: {p_sample_id: order.id, p_action: action,
        p_order: order, p_expected_revision: revision, p_command_id: root.crypto.randomUUID()}};
      if (!value.userId) throw new Error('Sign in to the test project.');
      storage.setItem(pendingKey(), JSON.stringify(value));
      return retry();
    }
    return {auth, save, retry, pending, signedIn: () => !!session?.access_token,
      initialize: () => rpc('ops_preview_initialize'), load: () => rpc('ops_preview_load'),
      historyLookup: reference => rpc('ops_preview_history_lookup', {p_reference: reference}),
      tracking: reference => rpc('public_order_tracking_lookup', {tracking_identifier: reference}, true),
      // Pending receipts survive signing out, so a retry can resolve an uncertain commit.
      signOut: () => storeSession(null)};
  }
  return {create, TEST_REF};
});
