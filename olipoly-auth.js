
/* === OliPoly Inline Shared Auth Bridge - no external file dependency === */
(function(){
  'use strict';

  // Pages may include the bridge more than once while legacy bundles are being
  // retired. Never replace an already-restored authenticated client.
  if (window.OliPolyAuth) return;

  const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';
  const SESSION_KEY = 'olipoly_auth_session_v1';
  const TOKEN_KEY = 'sb_token';
  const REFRESH_KEY = 'sb_refresh_token';
  const USER_KEY = 'sb_user';
  const CLIENT_INSTANCE_KEY = 'olipoly-shared-auth-v1';
  const OPERATIONAL_CACHE_KEYS = Object.freeze([
    'olipoly_production_jobs_v3', 'olipoly_production_jobs_v2', 'olipoly_production_jobs_v1',
    'olipoly_production_jobs_local_v1', 'olipoly_active_projects_local_v1',
    'olipoly_active_projects_v1', 'active_projects', 'olipoly_linked_workflow_recovery_v1',
    'olipoly_raw_material_inventory_v3', 'olipoly_finished_goods_inventory_v3',
    'olipoly_non_filament_supplies_v1', 'olipoly_inventory_ledger_v2',
    'olipoly_inventory_recovery_review_v1', 'olipoly_spool_pool_v1',
    'olipoly_orders_admin_v1', 'olipoly_orders_v1', 'olipoly_quote_history_v3',
    'olipoly_order_closure_overrides_v1'
  ]);
  const authStateListeners = new Set();
  const userChangeHandlers = new Set();
  let currentSession = null;

  const readJson = (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };

  function normalizeSession(session) {
    if (!session) return null;
    return {
      access_token: session.access_token || session.accessToken || null,
      refresh_token: session.refresh_token || session.refreshToken || null,
      expires_at: session.expires_at || session.expiresAt || jwtExpiresAt(session.access_token || session.accessToken) || null,
      expires_in: session.expires_in || null,
      token_type: session.token_type || 'bearer',
      user: session.user || null,
      saved_at: Date.now()
    };
  }

  function jwtExpiresAt(token) {
    try {
      const payload = token && token.split ? token.split('.')[1] : null;
      if (!payload) return null;
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return decoded?.exp ? Number(decoded.exp) : null;
    } catch {
      return null;
    }
  }

  function tokenExpiresSoon(session) {
    const expiresAt = Number(session?.expires_at || jwtExpiresAt(session?.access_token) || 0);
    return !!expiresAt && ((expiresAt * 1000) - Date.now()) < 10 * 60 * 1000;
  }

  function writeSession(session) {
    const normalized = normalizeSession(session);
    if (!normalized || !normalized.access_token) return null;

    const previousUserId = readSession()?.user?.id || null;
    const nextUserId = normalized.user?.id || null;
    if (previousUserId && nextUserId && previousUserId !== nextUserId) {
      clearOperationalCaches();
      console.info('[OliPolyERP] AUTH_USER_CHANGED_CACHE_CLEARED', { previousUserId, nextUserId });
    }

    localStorage.setItem(TOKEN_KEY, normalized.access_token);
    if (normalized.refresh_token) localStorage.setItem(REFRESH_KEY, normalized.refresh_token);
    if (normalized.user) localStorage.setItem(USER_KEY, JSON.stringify(normalized.user));
    localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
    currentSession = normalized;

    window.dispatchEvent(new CustomEvent('olipoly-auth-changed', { detail: normalized }));
    authStateListeners.forEach(listener => listener(normalized));
    if (previousUserId && nextUserId && previousUserId !== nextUserId) {
      userChangeHandlers.forEach(handler => handler({ previousUserId, nextUserId }));
    }
    return normalized;
  }

  function readSession() {
    const saved = readJson(SESSION_KEY, null) || {};
    const token = localStorage.getItem(TOKEN_KEY) || saved.access_token || null;
    const refresh = localStorage.getItem(REFRESH_KEY) || saved.refresh_token || null;
    const user = readJson(USER_KEY, null) || saved.user || null;
    if (!token && !refresh) return null;
    return { ...saved, access_token: token, refresh_token: refresh, user };
  }

  function clearOperationalCaches() {
    OPERATIONAL_CACHE_KEYS.forEach(key => localStorage.removeItem(key));
  }

  function clearSession() {
    [SESSION_KEY, TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
    clearOperationalCaches();
    currentSession = null;
    window.dispatchEvent(new CustomEvent('olipoly-auth-changed', { detail: null }));
    authStateListeners.forEach(listener => listener(null));
  }

  async function authApi(path, options = {}) {
    const headers = {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error_description || data?.message || data?.hint || `Supabase error ${res.status}`);
    return data;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || readSession()?.access_token || null;
  }

  async function fetchUser(token) {
    try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => null);
      return { res, data };
    } catch {
      return { res: { ok: false, status: 0 }, data: null };
    }
  }

  async function getUser() {
    const session = await recover();
    return session?.user || null;
  }

  async function login(email, password) {
    const data = await authApi('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    return writeSession(data);
  }

  async function signup(email, password) {
    const data = await authApi('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data?.access_token) writeSession(data);
    return data;
  }

  async function refresh() {
    const refreshToken = localStorage.getItem(REFRESH_KEY) || readSession()?.refresh_token;
    if (!refreshToken) return readSession();

    try {
      const data = await authApi('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      return writeSession(data);
    } catch {
      clearSession();
      return null;
    }
  }

  let recoveryPromise = null;
  async function recoverSession() {
    const current = readSession();
    if (!current) {
      clearOperationalCaches();
      currentSession = null;
      return null;
    }

    let session = current;
    let refreshed = false;
    if (!session.access_token || tokenExpiresSoon(session)) {
      refreshed = true;
      session = await refresh();
      if (!session?.access_token) return null;
    }

    let result = await fetchUser(session.access_token);
    if (!result.res.ok && (result.res.status === 401 || result.res.status === 403) && !refreshed && session.refresh_token) {
      session = await refresh();
      if (!session?.access_token) return null;
      result = await fetchUser(session.access_token);
    }
    if (!result.res.ok) {
      if (result.res.status === 401 || result.res.status === 403) clearSession();
      return null;
    }
    return writeSession({ ...session, user: result.data });
  }

  function recover() {
    if (!recoveryPromise) recoveryPromise = recoverSession().finally(() => { recoveryPromise = null; });
    return recoveryPromise;
  }

  const ensure = recover;
  const getSession = recover;

  function getCurrentSession() { return currentSession || readSession(); }
  function getCurrentUser() { return getCurrentSession()?.user || null; }
  async function requireAuthenticatedUser() {
    const session = await recover();
    if (!session?.user) throw new Error('Sign in is required.');
    return session.user;
  }
  function onAuthState(listener, options = {}) {
    if (typeof listener !== 'function') return () => {};
    authStateListeners.add(listener);
    if (options.immediate !== false) listener(getCurrentSession());
    return () => authStateListeners.delete(listener);
  }
  function registerUserChangeHandler(handler) {
    if (typeof handler !== 'function') return () => {};
    userChangeHandlers.add(handler);
    return () => userChangeHandlers.delete(handler);
  }
  function hasCommandAuthority() { return !!getCurrentSession()?.user?.id; }

  window.OliPolyAuth = {
    SUPABASE_URL,
    SUPABASE_KEY,
    SESSION_KEY,
    TOKEN_KEY,
    REFRESH_KEY,
    USER_KEY,
    clientInstanceKey: CLIENT_INSTANCE_KEY,
    persistSession: true,
    detectSessionInUrl: false,
    login,
    signup,
    logout: clearSession,
    clearSession,
    clearOperationalCaches,
    readSession,
    writeSession,
    refresh,
    recover,
    ensure,
    getSession,
    getCurrentSession,
    getCurrentUser,
    requireAuthenticatedUser,
    onAuthState,
    registerUserChangeHandler,
    hasCommandAuthority,
    getToken,
    getUser,
    authHeaders() {
      const token = getToken();
      return {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
    }
  };

  window.OliPolyHubAuthCheck = function OliPolyHubAuthCheck(){
    return {
      bridgeLoaded: typeof window.OliPolyAuth,
      tokenPresent: !!localStorage.getItem('sb_token'),
      sessionPresent: !!localStorage.getItem('olipoly_auth_session_v1'),
      refreshPresent: !!localStorage.getItem('sb_refresh_token'),
      userPresent: !!localStorage.getItem('sb_user')
    };
  };

  ensure();
})();
