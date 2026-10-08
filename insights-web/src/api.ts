/** Insights API client (same OAC + X-Auth-Token conventions as Owner Assist). */
import { getSession } from './auth';

export class AuthError extends Error {}

async function sha256Hex(body: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function request(method: string, path: string, body?: unknown, signal?: AbortSignal) {
  const s = await getSession();
  if (!s) throw new AuthError('Signed out');
  const payload = body === undefined ? '' : JSON.stringify(body);
  const headers: Record<string, string> = { 'x-auth-token': s.accessToken, 'x-amz-content-sha256': await sha256Hex(payload) };
  if (payload) headers['content-type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: payload || undefined, signal });
  if (res.status === 401) throw new AuthError('Session expired');
  return res;
}

export async function getJson<T = any>(path: string): Promise<T> {
  const r = await request('GET', path);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
}
export async function getText(path: string): Promise<string> {
  const r = await request('GET', path);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.text();
}

export type ChatEvent =
  | { type: 'meta'; messageId: string } | { type: 'status'; text: string } | { type: 'delta'; text: string }
  | { type: 'done'; tools: { name: string; ms: number }[]; latencyMs: number; usage: Record<string, number> }
  | { type: 'error'; message: string } | { type: 'guardrail'; text: string } | { type: 'ping' };

export async function* streamChat(message: string, history: { role: string; text: string }[], signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await request('POST', '/api/chat', { message, history }, signal);
  if (res.status === 429) { yield { type: 'error', message: 'Too many requests - wait a minute and try again.' }; return; }
  if (!res.ok || !res.body) { yield { type: 'error', message: `Unavailable (${res.status})` }; return; }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) { try { yield JSON.parse(line); } catch { /* ignore */ } }
    }
  }
}
