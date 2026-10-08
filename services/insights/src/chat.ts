/**
 * Class Insights chatbot: POST /api/chat  {message, history:[{role,text}]}  -> NDJSON stream (same protocol as Owner Assist).
 * The full projectknowledge.md (from S3) is the prompt-cached system prompt; read-only tools fetch live AWS data.
 * Uses the shared agent loop, so its own reasoning is logged as llm_call (app = "insights").
 */
import type { Message, Tool, ToolInputSchema } from '@aws-sdk/client-bedrock-runtime';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import { runAgentLoop } from '../../shared/agentLoop.js';
import { authenticate, bedrockRuntime, logger, LOG_SOURCES, lowerHeaders, metrics, projectKnowledge } from './common.js';
import { aiConfig, appMetrics, deploymentStatus, lambdaConfig, llmSelection, reasoningLogs, searchLogs } from './data.js';

declare const awslambda: {
  streamifyResponse: (h: (event: APIGatewayProxyEventV2, stream: Writable) => Promise<void>) => unknown;
  HttpResponseStream: { from: (s: Writable, meta: { statusCode: number; headers?: Record<string, string> }) => Writable };
};

const schema = (properties: Record<string, unknown>, required: string[] = []): ToolInputSchema => ({ json: { type: 'object', properties, required } as any });
const TOOLS: Tool[] = [
  { toolSpec: { name: 'get_reasoning_logs', description: 'Fetch structured LLM reasoning logs (one record per model call: question, the model\'s reasoning text, tool calls chosen, output preview, stop reason, tokens, latency) for the Owner Assist chatbot and/or this Insights chatbot, via CloudWatch Logs Insights.',
    inputSchema: schema({ app: { type: 'string', enum: ['owner-assist', 'insights', 'all'] }, minutes: { type: 'integer', description: 'look-back window, default 1440' }, limit: { type: 'integer', description: 'max records, default 15, max 50' }, contains: { type: 'string', description: 'optional text the record must contain, e.g. a word from the question or a tool name' } }) } },
  { toolSpec: { name: 'search_logs', description: `Search raw CloudWatch log events in an allow-listed source with an optional CloudWatch filter pattern (e.g. '{ $.log_type = "tool" }', '{ $.level = "ERROR" }', '"feedback"', '{ $.action = "BLOCK" }' for WAF). Sources: ${Object.entries(LOG_SOURCES).map(([k, v]) => `${k} (${v.description})`).join('; ')}.`,
    inputSchema: schema({ source: { type: 'string', enum: Object.keys(LOG_SOURCES) }, filter_pattern: { type: 'string' }, minutes: { type: 'integer' }, limit: { type: 'integer' } }, ['source']) } },
  { toolSpec: { name: 'get_app_metrics', description: 'Live CloudWatch metrics for the apps: answers served, errors, guardrail interventions, latency and time-to-first-token percentiles, token usage, prompt-cache reads, tool-call counts, feedback.',
    inputSchema: schema({ hours: { type: 'integer', description: 'look-back window, default 24' } }) } },
  { toolSpec: { name: 'get_deployment_status', description: 'Live CloudFormation status of every OwnerAssist stack: status, last update time, outputs (IDs/URLs), resource counts by type.', inputSchema: schema({}) } },
  { toolSpec: { name: 'get_ai_configuration', description: 'Live Bedrock configuration: Knowledge Base (embedding model, S3 Vectors storage, chunking, recent ingestion jobs + document counts) and the Guardrail policy (filters, denied topics, PII rules).', inputSchema: schema({}) } },
  { toolSpec: { name: 'get_llm_selection', description: 'LLM Selection feature: the live AWS AppConfig document (active model, quality/cost/latency weights, 5 candidate models with prices and quality priors, last evaluation with per-model probe results and ranking) plus recent configuration versions and deployments (history of model switches).',
    inputSchema: schema({ history: { type: 'integer', description: 'number of versions/deployments to return, default 10' } }) } },
  { toolSpec: { name: 'get_lambda_configuration', description: 'Live configuration of every Lambda function (runtime, arch, memory, timeout, tracing, environment variables).', inputSchema: schema({}) } },
];

const STATUS: Record<string, string> = {
  get_reasoning_logs: 'Querying LLM reasoning logs (CloudWatch Logs Insights)…', search_logs: 'Searching CloudWatch logs…',
  get_app_metrics: 'Reading CloudWatch metrics…', get_deployment_status: 'Checking CloudFormation stacks…',
  get_ai_configuration: 'Reading Bedrock Knowledge Base and Guardrail configuration…', get_llm_selection: 'Reading LLM Selection state from AWS AppConfig…', get_lambda_configuration: 'Reading Lambda configuration…',
};

function runTool(name: string, input: any) {
  switch (name) {
    case 'get_reasoning_logs': return reasoningLogs(input);
    case 'search_logs': return searchLogs(input);
    case 'get_app_metrics': return appMetrics(input);
    case 'get_deployment_status': return deploymentStatus();
    case 'get_ai_configuration': return aiConfig();
    case 'get_lambda_configuration': return lambdaConfig();
    case 'get_llm_selection': return llmSelection(input);
    default: throw new Error(`Unknown tool ${name}`);
  }
}

const INSTRUCTIONS = `You are Class Insights, a teaching assistant for students in a 3-day AWS class. You explain how the
"Owner Assist" application (a GenAI owner portal for Nissan vehicles at https://www.awsteach.com) and this Class Insights
app (https://insights.awsteach.com) were designed, built and deployed - by Claude Code for the instructor.

Your primary source is the PROJECT KNOWLEDGE document below. Use the tools to show LIVE evidence from AWS: reasoning logs
of LLM calls, CloudWatch logs and metrics, CloudFormation stack status, Bedrock Knowledge Base/Guardrail and Lambda configuration.
- Prefer showing real data (e.g. actual reasoning text, tool calls and token counts from logs) when students ask "how/why did
  the bot decide...". Quote reasoning faithfully; say when logs are empty for the time window and widen it if useful.
- If something isn't in the document or the tools, say so rather than guess.
- Never reveal credentials, tokens or keys (none exist in the design: IAM roles + Cognito). Student usernames are not
  logged; logs identify users only by an opaque Cognito subject id.
- Format with concise markdown: headings, bullets, small tables, code blocks for config/log excerpts. No emojis.
- Today's date: ${new Date().toISOString().slice(0, 10)}.

=== PROJECT KNOWLEDGE (projectknowledge.md) ===
`;

const send = (out: Writable, ev: Record<string, unknown>) => out.write(`${JSON.stringify(ev)}\n`);
const open = (s: Writable, statusCode: number) => awslambda.HttpResponseStream.from(s, {
  statusCode, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
});

export const handler = awslambda.streamifyResponse(async (event, stream) => {
  const started = Date.now();
  const user = await authenticate(lowerHeaders(event.headers));
  if (!user) { const o = open(stream, 401); send(o, { type: 'error', message: 'Please sign in again.' }); o.end(); return; }
  let body: { message?: string; history?: { role: string; text: string }[] } = {};
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}'); } catch { /* empty */ }
  const text = String(body.message || '').trim().slice(0, 2000);
  if (!text) { const o = open(stream, 400); send(o, { type: 'error', message: 'Message is required.' }); o.end(); return; }

  const out = open(stream, 200);
  const messageId = randomUUID();
  logger.appendKeys({ userId: user.sub, messageId });
  send(out, { type: 'meta', messageId });
  const heartbeat = setInterval(() => send(out, { type: 'ping' }), 10_000);
  try {
    const history: Message[] = [];
    for (const h of (body.history || []).slice(-10)) {
      const role = h.role === 'assistant' ? 'assistant' : 'user';
      const t = String(h.text || '').slice(0, 6000);
      if (!t) continue;
      if (history.length && history[history.length - 1].role === role) history[history.length - 1].content!.push({ text: t });
      else history.push({ role, content: [{ text: t }] });
    }
    while (history.length && history[0].role !== 'user') history.shift();
    if (history.length && history[history.length - 1].role === 'user') history.pop();

    const r = await runAgentLoop({
      app: 'insights',
      client: bedrockRuntime,
      modelId: process.env.MODEL_ID!,
      system: [{ text: INSTRUCTIONS + (await projectKnowledge()) }, { cachePoint: { type: 'default' } }],
      messages: [...history, { role: 'user', content: [{ text }] }],
      tools: TOOLS,
      question: text,
      maxRounds: 5,
      logger, metrics,
      runTool,
      onText: (t) => send(out, { type: 'delta', text: t }),
      onToolStart: (name) => send(out, { type: 'status', text: STATUS[name] || name, tool: name }),
      onGuardrail: (t) => send(out, { type: 'guardrail', text: t }),
    });
    const latencyMs = Date.now() - started;
    send(out, { type: 'done', tools: r.toolLog, usage: r.usage, latencyMs, firstTokenMs: r.firstTokenMs, citations: [] });
    metrics.addMetric('ChatRequests', MetricUnit.Count, 1);
    metrics.addMetric('InputTokens', MetricUnit.Count, r.usage.inputTokens);
    metrics.addMetric('OutputTokens', MetricUnit.Count, r.usage.outputTokens);
    logger.info('chat complete', { log_type: 'chat_complete', latencyMs, usage: r.usage, tools: r.toolLog, question: text.slice(0, 300) });
  } catch (err) {
    logger.error('insights chat failed', err as Error);
    send(out, { type: 'error', message: 'Something went wrong. Please try again.' });
  } finally {
    clearInterval(heartbeat);
    metrics.publishStoredMetrics();
    out.end();
  }
});
