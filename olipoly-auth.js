// OliPoly shared auth bridge
// Purpose: one Hub login can unlock Quote, Orders, Production, Inventory, and Finance pages in the same browser.
(function(){
  'use strict';

  const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';
  const SESSION_KEY = 'olipoly_auth_session_v1';
  const TOKEN_KEY = 'sb_token';
  const REFRESH_KEY = 'sb_refresh_token';
  const USER_KEY = 'sb_user';

  const readJson = (key, fallback=null) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };

  const writeSession = (session) => {
    if (!session) return null;
    const normalized = {
      access_token: session.access_token || session.accessToken || null,
      refresh_token: session.refresh_token || session.refreshToken || null,
      expires_at: session.expires_at || session.expiresAt || null,
      expires_in: session.expires_in || null,
      token_type: session.token_type || 'bearer',
      user: session.user || null,
      saved_at: Date.now()
    };
    if (normalized.access_token) localStorage.setItem(TOKEN_KEY, normalized.access_token);
    if (normalized.refresh_token) localStorage.setItem(REFRESH_KEY, normalized.refresh_token);
    if (normalized.user) localStorage.setItem(USER_KEY, JSON.stringify(normalized.user));
    localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('olipoly-auth-changed', {detail: normalized}));
    return normalized;
  };

  const readSession = () => {
    const saved = readJson(SESSION_KEY, null) || {};
    const token = localStorage.getItem(TOKEN_KEY) || saved.access_token || null;
    const refresh = localStorage.getItem(REFRESH_KEY) || saved.refresh_token || null;
    const user = readJson(USER_KEY, null) || saved.user || null;
    if (!token && !refresh) return null;
    return {...saved, access_token: token, refresh_token: refresh, user};
  };

  const clearSession = () => {
    [SESSION_KEY, TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
    window.dispatchEvent(new CustomEvent('olipoly-auth-changed', {detail: null}));
  };

  const api = async (path, options={}) => {
    const headers = {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const res = await fetch(`${SUPABASE_URL}${path}`, {...options, headers});
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error_description || data?.message || data?.hint || `Supabase error ${res.status}`);
    return data;
  };

  const getToken = () => localStorage.getItem(TOKEN_KEY) || readSession()?.access_token || null;

  const getUser = async () => {
    const token = getToken();
    if (!token) return null;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`}
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return null;
    localStorage.setItem(USER_KEY, JSON.stringify(data));
    return data;
  };

  const login = async (email, password) => {
    const data = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({email, password})
    });
    const session = writeSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      expires_in: data.expires_in,
      token_type: data.token_type,
      user: data.user
    });
    return session;
  };

  const signup = async (email, password) => {
    const data = await api('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({email, password})
    });
    if (data?.access_token) writeSession(data);
    return data;
  };

  const refresh = async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY) || readSession()?.refresh_token;
    if (!refreshToken) return readSession();
    try {
      const data = await api('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({refresh_token: refreshToken})
      });
      return writeSession(data);
    } catch (err) {
      console.warn('OliPoly auth refresh failed:', err);
      return readSession();
    }
  };

  const ensure = async () => {
    const current = readSession();
    if (!current) return null;
    const expiresAt = Number(current.expires_at || 0);
    const expiresSoon = expiresAt && (expiresAt * 1000 - Date.now()) < 10 * 60 * 1000;
    if (expiresSoon) return refresh();
    return current;
  };

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
    authHeaders(){
      const token = getToken();
      return {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {})
      };
    }
  };

  // Best-effort session refresh for pages that still use localStorage.getItem('sb_token') during startup.
  ensure();
})();
