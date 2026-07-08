
/* === OliPoly Inline Shared Auth Bridge - no external file dependency === */
(function(){
  'use strict';

  const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';
  const SESSION_KEY = 'olipoly_auth_session_v1';
  const TOKEN_KEY = 'sb_token';
  const REFRESH_KEY = 'sb_refresh_token';
  const USER_KEY = 'sb_user';

  const readJson = (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };

  function jwtExpiresAt(token) {
    try {
      const payload = token && token.split ? token.split('.')[1] : null;
      if (!payload) return null;
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return decoded && decoded.exp ? Number(decoded.exp) : null;
    } catch {
      return null;
    }
  }

  function tokenExpiresSoon(session) {
    if (!session) return false;
    const exp = Number(session.expires_at || jwtExpiresAt(session.access_token) || 0);
    return !!exp && ((exp * 1000) - Date.now()) < 10 * 60 * 1000;
  }

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

  function writeSession(session) {
    const normalized = normalizeSession(session);
    if (!normalized || !normalized.access_token) return null;

    localStorage.setItem(TOKEN_KEY, normalized.access_token);
    if (normalized.refresh_token) localStorage.setItem(REFRESH_KEY, normalized.refresh_token);
    if (normalized.user) localStorage.setItem(USER_KEY, JSON.stringify(normalized.user));
    localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));

    window.dispatchEvent(new CustomEvent('olipoly-auth-changed', { detail: normalized }));
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

  function clearSession() {
    [SESSION_KEY, TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
    window.dispatchEvent(new CustomEvent('olipoly-auth-changed', { detail: null }));
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

  async function getUser() {
    let session = await ensure();
    let token = getToken();
    if (!token) return null;

    async function fetchUser(activeToken) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${activeToken}` }
      });
      const data = await res.json().catch(() => null);
      return { res, data };
    }

    let result = await fetchUser(token);
    if (!result.res.ok && (result.res.status === 401 || result.res.status === 403) && readSession()?.refresh_token) {
      session = await refresh();
      token = getToken();
      if (token) result = await fetchUser(token);
    }
    if (!result.res.ok) {
      if (result.res.status === 401 || result.res.status === 403) clearSession();
      return null;
    }

    localStorage.setItem(USER_KEY, JSON.stringify(result.data));
    const existing = readSession();
    if (existing?.access_token) writeSession({ ...existing, user: result.data });
    return result.data;
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
    } catch (err) {
      console.warn('OliPoly auth refresh failed:', err);
      return readSession();
    }
  }

  async function ensure() {
    const current = readSession();
    if (!current) return null;

    if (tokenExpiresSoon(current)) return refresh();

    if (current.access_token && !current.user) {
      const user = await getUser();
      if (user) return writeSession({ ...current, user });
    }

    return current;
  }

  window.OliPolyAuth = {
    SUPABASE_URL,
    SUPABASE_KEY,
    SESSION_KEY,
    TOKEN_KEY,
    REFRESH_KEY,
    USER_KEY,
    login,
    signup,
    logout: clearSession,
    clearSession,
    readSession,
    writeSession,
    refresh,
    ensure,
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
