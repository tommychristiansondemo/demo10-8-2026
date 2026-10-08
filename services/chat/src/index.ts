/**
 * POST /api/chat  -> streamed NDJSON events
 *   {type:"meta", conversationId, messageId}
 *   {type:"status", text}                 tool progress for the UI
 *   {type:"delta", text}                  answer tokens
 *   {type:"guardrail", text}              guardrail intervened: replace the answer with this text
 *   {type:"done", citations, tools, usage, latencyMs}
 *   {type:"error", message}
 *
 * Agent loop (services/shared/agentLoop.ts): Bedrock ConverseStream (Claude Sonnet 4.6, adaptive thinking) with tool use,
 * Bedrock Guardrail on the driver's latest message and on model output, prompt caching, and one `llm_call` reasoning
 * log line per model call.
 */
import type { Message, SystemContentBlock } from '@aws-sdk/client-bedrock-runtime';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import { authenticate } from './auth.js';
import { bedrock, logger, metrics } from './clients.js';
import { historyMessages, loadConversation, saveConversation, type Conversation, type Turn } from './conversations.js';
import { driverContext, SYSTEM_PROMPT } from './prompt.js';
import { describeGarage, listVehicles } from './tools/garage.js';
import { runTool, TOOL_SPECS, toolStatus } from './tools/index.js';
import { CitationRegistry } from './tools/knowledge.js';
import { runAgentLoop } from '../../shared/agentLoop.js';
import { activeCandidate, getModelConfig } from '../../shared/appConfig.js';

declare const awslambda: {
  streamifyResponse: (h: (event: APIGatewayProxyEventV2, stream: Writable, ctx: unknown) => Promise<void>) => unknown;
  HttpResponseStream: { from: (s: Writable, meta: { statusCode: number; headers?: Record<string, string> }) => Writable };
};

const MAX_TOOL_ROUNDS = 6;
const MAX_INPUT_CHARS = 2000;

function open(stream: Writable, statusCode: number) {
  return awslambda.HttpResponseStream.from(stream, {
    statusCode,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
const send = (out: Writable, ev: Record<string, unknown>) => out.write(`${JSON.stringify(ev)}\n`);

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const started = Date.now();
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const user = await authenticate(headers);
  if (!user) {
    const out = open(responseStream, 401);
    send(out, { type: 'error', message: 'Please sign in again.' });
    out.end();
    return;
  }
  let body: { message?: string; conversationId?: string };
  try {
    body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}');
  } catch {
    body = {};
  }
  const text = String(body.message || '').trim().slice(0, MAX_INPUT_CHARS);
  if (!text) {
    const out = open(responseStream, 400);
    send(out, { type: 'error', message: 'Message is required.' });
    out.end();
    return;
  }

  const out = open(responseStream, 200);
  const conversationId = body.conversationId && /^[\w-]{8,64}$/.test(body.conversationId) ? body.conversationId : randomUUID();
  const messageId = randomUUID();
  logger.appendKeys({ userId: user.sub, conversationId, messageId });
  send(out, { type: 'meta', conversationId, messageId });
  // Keep bytes flowing so CloudFront's origin read timeout (60 s) never trips during slow tool calls.
  const heartbeat = setInterval(() => send(out, { type: 'ping' }), 10_000);

  const citations = new CitationRegistry();

  try {
    const [conv, vehicles, modelCfg] = await Promise.all([loadConversation(user.sub, conversationId), listVehicles(user.sub), getModelConfig()]);
    // The live model comes from AWS AppConfig (changed by the LLM Selection feature) - no redeploy needed.
    const model = activeCandidate(modelCfg);
    logger.appendKeys({ model: model.key });
    const system: SystemContentBlock[] = [
      { text: SYSTEM_PROMPT },
      { cachePoint: { type: 'default' } },
      { text: driverContext(describeGarage(vehicles)) },
    ];
    // Only the driver's newest message is wrapped in guardContent, so the guardrail screens what the user typed
    // rather than tool output such as NHTSA complaint narratives describing crashes and fires.
    const messages: Message[] = [
      ...historyMessages(conv),
      { role: 'user', content: [{ guardContent: { text: { text, qualifiers: ['guard_content'] } } }] },
    ];

    const { answer, guardrailText, toolLog, usage, firstTokenMs } = await runAgentLoop({
      app: 'owner-assist',
      client: bedrock,
      modelId: model.modelId,
      profile: model.profile,
      system,
      messages,
      tools: TOOL_SPECS,
      question: text,
      guardrail: { id: process.env.GUARDRAIL_ID!, version: process.env.GUARDRAIL_VERSION! },
      maxRounds: MAX_TOOL_ROUNDS,
      logger,
      metrics,
      runTool: (name, input) => runTool(name, input, { userId: user.sub, citations }),
      onText: (t) => send(out, { type: 'delta', text: t }),
      onToolStart: (name, input) => send(out, { type: 'status', text: toolStatus(name, input), tool: name }),
      onGuardrail: (t) => send(out, { type: 'guardrail', text: t }),
    });

    // Persist the exchange (plain text) for history and the conversation list.
    const now = new Date().toISOString();
    const c: Conversation = conv ?? { id: conversationId, title: text.slice(0, 80), createdAt: now, updatedAt: now, turns: [] };
    const usedCitations = citations.all().filter((x) => answer.includes(`[${x.id}]`));
    const turns: Turn[] = [
      { id: randomUUID(), role: 'user', text, at: now, guardrail: !!guardrailText },
      { id: messageId, role: 'assistant', text: guardrailText ?? answer, at: now, citations: usedCitations, tools: toolLog, guardrail: !!guardrailText, model: model.label },
    ];
    c.turns.push(...turns);
    c.updatedAt = now;
    await saveConversation(user.sub, c);

    const latencyMs = Date.now() - started;
    send(out, { type: 'done', citations: usedCitations, tools: toolLog, usage, latencyMs, firstTokenMs, model: { key: model.key, label: model.label } });
    metrics.addMetric('ChatRequests', MetricUnit.Count, 1);
    metrics.addMetric('ChatLatency', MetricUnit.Milliseconds, latencyMs);
    if (firstTokenMs != null) metrics.addMetric('TimeToFirstToken', MetricUnit.Milliseconds, firstTokenMs);
    metrics.addMetric('InputTokens', MetricUnit.Count, usage.inputTokens);
    metrics.addMetric('OutputTokens', MetricUnit.Count, usage.outputTokens);
    metrics.addMetric('CacheReadTokens', MetricUnit.Count, usage.cacheReadInputTokens);
    metrics.addMetric('ToolCallsPerAnswer', MetricUnit.Count, toolLog.length);
    const byModel = metrics.singleMetric();
    byModel.addDimension('model', model.key);
    byModel.addMetric('AnswersByModel', MetricUnit.Count, 1);
    logger.info('chat complete', { model: model.key, latencyMs, firstTokenMs, usage, tools: toolLog, citations: usedCitations.length, guardrail: !!guardrailText, question: text.slice(0, 300) });
  } catch (err) {
    logger.error('chat failed', err as Error);
    metrics.addMetric('ChatErrors', MetricUnit.Count, 1);
    const throttled = /throttl|too many/i.test(String((err as Error).name) + String((err as Error).message));
    send(out, { type: 'error', message: throttled ? 'The assistant is busy right now - please try again in a few seconds.' : 'Something went wrong answering that. Please try again.' });
  } finally {
    clearInterval(heartbeat);
    metrics.publishStoredMetrics();
    out.end();
  }
});
