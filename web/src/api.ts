/**
 * API client. CloudFront signs calls to the Lambda Function URLs with SigV4 (Origin Access Control); for requests
 * with a body, OAC requires the client to send the SHA-256 of the payload in x-amz-content-sha256.
 * The user's Cognito access token travels in X-Auth-Token because CloudFront owns the Authorization header.
 */
import { getSession } from './auth';

export interface Vehicle {
  vehicleId: string; nickname?: string; model: string; year: number; trim?: string; vin?: string;
  mileage?: number; inServiceDate?: string; certifiedPreOwned?: boolean;
}
export interface Citation { id: string; title: string; url?: string; page?: number; snippet: string; docType?: string }
export interface ToolRun { name: string; ms: number; ok: boolean }
export interface Turn { id: string; role: 'user' | 'assistant'; text: string; at: string; citations?: Citation[]; tools?: ToolRun[]; guardrail?: boolean; model?: string }
export interface ConversationSummary { id: string; title: string; updatedAt: string }

export class AuthError extends Error {}

async function sha256Hex(body: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function request(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const s = await getSession();
  if (!s) throw new AuthError('Signed out');
  const payload = body === undefined ? '' : JSON.stringify(body);
  const headers: Record<string, string> = { 'x-auth-token': s.accessToken, 'x-amz-content-sha256': await sha256Hex(payload) };
  if (payload) headers['content-type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: payload || undefined, signal });
  if (res.status === 401) throw new AuthError('Session expired');
  return res;
}

async function jsonCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await request(method, path, body);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  listVehicles: () => jsonCall<{ vehicles: Vehicle[] }>('GET', '/api/garage').then((r) => r.vehicles),
  addVehicle: (v: Partial<Vehicle>) => jsonCall<Vehicle>('POST', '/api/garage', v),
  updateVehicle: (id: string, v: Partial<Vehicle>) => jsonCall<Vehicle>('PUT', `/api/garage/${id}`, v),
  deleteVehicle: (id: string) => jsonCall<void>('DELETE', `/api/garage/${id}`),
  listConversations: () => jsonCall<{ conversations: ConversationSummary[] }>('GET', '/api/conversations').then((r) => r.conversations),
  getConversation: (id: string) => jsonCall<{ id: string; title: string; turns: Turn[] }>('GET', `/api/conversations/${id}`),
  deleteConversation: (id: string) => jsonCall<void>('DELETE', `/api/conversations/${id}`),
  feedback: (conversationId: string, messageId: string, rating: 'up' | 'down', comment?: string) =>
    jsonCall('POST', '/api/feedback', { conversationId, messageId, rating, comment }),
  decodeVin: (vin: string) => jsonCall<{ make?: string; model?: string; year?: number; trim?: string; supported: boolean }>('GET', `/api/vin/${vin}`),
  models: () => jsonCall<{ models: string[] }>('GET', '/api/models').then((r) => r.models),
};

export type ChatEvent =
  | { type: 'meta'; conversationId: string; messageId: string }
  | { type: 'status'; text: string; tool?: string }
  | { type: 'delta'; text: string }
  | { type: 'guardrail'; text: string }
  | { type: 'done'; citations: Citation[]; tools: ToolRun[]; latencyMs: number; firstTokenMs?: number; usage: Record<string, number>; model?: { key: string; label: string } }
  | { type: 'error'; message: string }
  | { type: 'ping' };

/** POST /api/chat and yield NDJSON events as they stream in. */
export async function* streamChat(message: string, conversationId: string | undefined, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await request('POST', '/api/chat', { message, conversationId }, signal);
  if (res.status === 429) { yield { type: 'error', message: 'You are sending messages too quickly. Please wait a minute and try again.' }; return; }
  if (!res.ok || !res.body) { yield { type: 'error', message: `The assistant is unavailable (${res.status}).` }; return; }
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
      if (line) { try { yield JSON.parse(line) as ChatEvent; } catch { /* partial/garbled line */ } }
    }
  }
}

// ---------------- LLM Selection ----------------
export type Weights = { quality: number; cost: number; latency: number };
export interface LlmCandidate { key: string; label: string; provider: string; modelId: string; strengths: string; priceInPerM: number; priceOutPerM: number; qualityPrior: number; thinking: string }
export interface LlmMeasurement { probePassRate: number; probes: { id: string; pass: boolean; ms: number; note?: string }[]; medianLatencyMs: number; estCostPerAnswerUsd: number; error?: string }
export interface LlmState {
  weights: Weights; activeModel: string; switchMargin: number; candidates: LlmCandidate[];
  measurements: Record<string, LlmMeasurement>;
  ranking: { key: string; label: string; score: number; quality: number; cost: number; latency: number }[];
  lastEvaluation: { at: string; weights: Weights; decision: string; previousModel: string } | null;
  run: { state: 'idle' | 'running'; startedAt?: string; finishedAt?: string; progress?: string; weights?: Weights; lastDecision?: string; lastError?: string | null };
}
export const llmApi = {
  state: () => jsonCall<LlmState>('GET', '/api/llm'),
  evaluate: (weights: Weights) => jsonCall<{ started: boolean }>('POST', '/api/llm/evaluate', { weights }),
};
