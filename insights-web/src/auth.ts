/**
 * Cognito Managed Login with OAuth 2.0 Authorization Code + PKCE (no client secret in the browser).
 * Tokens are kept in localStorage so a refresh keeps the driver signed in; access tokens live 1 hour and are
 * refreshed silently with the refresh token.
 */
export interface AppConfig { region: string; userPoolId: string; userPoolClientId: string; cognitoDomain: string; ownerAssistUrl?: string }
export interface Session { accessToken: string; idToken: string; refreshToken?: string; expiresAt: number; email?: string; name?: string; username?: string }

const KEY = 'oai.session';
const PKCE = 'oai.pkce';
const redirectUri = () => `${window.location.origin}/`;

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function decodeJwt(token: string): Record<string, any> {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
}

let config: AppConfig;
export async function loadConfig(): Promise<AppConfig> {
  if (!config) config = await (await fetch('/config.json', { cache: 'no-store' })).json();
  return config;
}

function save(t: { access_token: string; id_token: string; refresh_token?: string; expires_in: number }, prev?: Session): Session {
  const claims = decodeJwt(t.id_token);
  const s: Session = {
    accessToken: t.access_token, idToken: t.id_token, refreshToken: t.refresh_token ?? prev?.refreshToken,
    expiresAt: Date.now() + (t.expires_in - 60) * 1000, email: claims.email, name: claims.given_name, username: claims['cognito:username'],
  };
  store.set(KEY, JSON.stringify(s));
  return s;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.userPoolClientId, ...params }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  return res.json();
}

export async function startLogin(mode: 'login' | 'signup' = 'login') {
  await loadConfig();
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(PKCE, JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({
    response_type: 'code', client_id: config.userPoolClientId, redirect_uri: redirectUri(),
    scope: 'openid profile', state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  window.location.assign(`${config.cognitoDomain}/${mode === 'signup' ? 'signup' : 'oauth2/authorize'}?${q}`);
}

/** Completes the redirect from Managed Login (if present) and returns a valid session or null. */
let initOnce: Promise<Session | null> | null = null;
export function initSession(): Promise<Session | null> {
  initOnce ??= doInit(); // the one-time authorization code must be exchanged exactly once
  return initOnce;
}

async function doInit(): Promise<Session | null> {
  await loadConfig();
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (code) {
    const saved = JSON.parse(sessionStorage.getItem(PKCE) || '{}');
    window.history.replaceState({}, '', '/');
    if (!saved.verifier || saved.state !== url.searchParams.get('state')) return null;
    sessionStorage.removeItem(PKCE);
    return save(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: saved.verifier }));
  }
  return getSession();
}

let refreshing: Promise<Session | null> | null = null;
export async function getSession(): Promise<Session | null> {
  const raw = store.get(KEY);
  if (!raw) return null;
  const s: Session = JSON.parse(raw);
  if (Date.now() < s.expiresAt) return s;
  if (!s.refreshToken) { store.del(KEY); return null; }
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refreshToken })
    .then((t) => save(t, s))
    .catch(() => { store.del(KEY); return null; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function signOut() {
  await loadConfig();
  store.del(KEY);
  const q = new URLSearchParams({ client_id: config.userPoolClientId, logout_uri: redirectUri() });
  window.location.assign(`${config.cognitoDomain}/logout?${q}`);
}
