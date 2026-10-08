/**
 * Shared streaming agent loop used by BOTH chatbots (Owner Assist and Class Insights).
 *
 *  - Bedrock ConverseStream with tool use and Claude adaptive (extended) thinking
 *  - Reasoning blocks (with signatures) are passed back to the model between tool rounds, as required for
 *    interleaved thinking with tools
 *  - Optional Bedrock Guardrail
 *  - REASONING LOGGING: every model call emits one structured `llm_call` JSON log line (prompt context, the model's
 *    reasoning text, tool calls chosen, output preview, stop reason, token usage, latency). The Insights app
 *    queries these with CloudWatch Logs Insights:  filter log_type = "llm_call"
 */
import {
  ConverseStreamCommand,
  type BedrockRuntimeClient, type ContentBlock, type Message, type SystemContentBlock, type Tool, type ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type { Logger } from '@aws-lambda-powertools/logger';
import { MetricUnit, type Metrics } from '@aws-lambda-powertools/metrics';
import { createHash } from 'node:crypto';

export interface ToolRun { name: string; ms: number; ok: boolean }

import type { ModelProfile } from './modelSelection.js';
export type { ModelProfile };

export const DEFAULT_PROFILE: ModelProfile = { thinking: 'adaptive', promptCache: true };

/** Streaming filter that removes <thinking>...</thinking> spans even when tags are split across chunks. */
export function thinkingTagFilter(tag = 'thinking') {
  const OPEN = `<${tag}>`, CLOSE = `</${tag}>`;
  let buf = '';
  let inside = false;
  const push = (chunk: string): string => {
    buf += chunk;
    let out = '';
    for (;;) {
      if (inside) {
        const j = buf.indexOf(CLOSE);
        if (j < 0) { buf = buf.slice(-(CLOSE.length - 1)); return out; }
        buf = buf.slice(j + CLOSE.length).replace(/^\s+/, '');
        inside = false;
        continue;
      }
      const i = buf.indexOf(OPEN);
      if (i >= 0) { out += buf.slice(0, i); buf = buf.slice(i + OPEN.length); inside = true; continue; }
      const lt = buf.lastIndexOf('<');
      if (lt >= 0 && OPEN.startsWith(buf.slice(lt))) { out += buf.slice(0, lt); buf = buf.slice(lt); } // possible split tag
      else { out += buf; buf = ''; }
      return out;
    }
  };
  const flush = () => { const rest = inside ? '' : buf; buf = ''; return rest; };
  return Object.assign(push, { flush });
}

export interface LoopOptions {
  app: 'owner-assist' | 'insights';
  client: BedrockRuntimeClient;
  modelId: string;
  profile?: ModelProfile;
  system: SystemContentBlock[];
  messages: Message[];
  tools: Tool[];
  question: string;
  guardrail?: { id: string; version: string };
  maxRounds?: number;
  maxTokens?: number;
  logger: Logger;
  metrics: Metrics;
  runTool: (name: string, input: any) => Promise<unknown>;
  onText: (delta: string) => void;
  onToolStart: (name: string, input: any) => void;
  onGuardrail: (text: string) => void;
}

export interface LoopResult {
  answer: string;
  guardrailText: string | null;
  toolLog: ToolRun[];
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheWriteInputTokens: number };
  firstTokenMs: number | null;
  rounds: number;
}

type Block =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string; signature?: string; redacted?: Uint8Array }
  | { kind: 'tool'; toolUseId: string; name: string; json: string };

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);

export async function runAgentLoop(o: LoopOptions): Promise<LoopResult> {
  const started = Date.now();
  const maxRounds = o.maxRounds ?? 6;
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 };
  const toolLog: ToolRun[] = [];
  const systemSha = sha(JSON.stringify(o.system.filter((b) => 'text' in b).map((b) => (b as { text: string }).text).slice(0, 1)));
  let answer = '';
  let guardrailText: string | null = null;
  let firstTokenMs: number | null = null;
  let round = 0;
  const profile = o.profile ?? DEFAULT_PROFILE;
  const makeFilter = () => {
    const fs = (profile.stripTags || []).map((t) => thinkingTagFilter(t));
    return Object.assign((t: string) => fs.reduce((acc, f) => f(acc), t),
      { flush: () => fs.reduce((acc, f) => f(acc) + f.flush(), '') });
  };
  const filter = makeFilter();
  const thinking: Record<string, any> | undefined = profile.thinking === 'adaptive' ? { thinking: { type: 'adaptive' } }
    : profile.thinking === 'budget' ? { thinking: { type: 'enabled', budget_tokens: 2048 } } : undefined;
  const system = profile.promptCache ? o.system : o.system.filter((b) => !('cachePoint' in b));

  for (; round <= maxRounds; round++) {
    const t0 = Date.now();
    const res = await o.client.send(new ConverseStreamCommand({
      modelId: o.modelId,
      system,
      messages: o.messages,
      toolConfig: { tools: (profile.toolCache ?? profile.promptCache) ? [...o.tools, { cachePoint: { type: 'default' } }] : o.tools },
      inferenceConfig: { maxTokens: o.maxTokens ?? 8000 },
      ...(thinking ? { additionalModelRequestFields: thinking } : {}),
      ...(o.guardrail ? { guardrailConfig: { guardrailIdentifier: o.guardrail.id, guardrailVersion: o.guardrail.version, trace: 'enabled', streamProcessingMode: 'async' } } : {}),
    }));

    const blocks = new Map<number, Block>();
    let held = ''; // text withheld until we know the round didn't end in a tool call (hideToolRoundText)
    let stopReason: string | undefined;
    let roundUsage: Record<string, number> = {};
    let guardrailTrace: unknown;
    for await (const ev of res.stream!) {
      if (ev.contentBlockStart?.start?.toolUse) {
        const tu = ev.contentBlockStart.start.toolUse;
        blocks.set(ev.contentBlockStart.contentBlockIndex!, { kind: 'tool', toolUseId: tu.toolUseId!, name: tu.name!, json: '' });
      } else if (ev.contentBlockDelta) {
        const i = ev.contentBlockDelta.contentBlockIndex!;
        const d = ev.contentBlockDelta.delta;
        if (d?.text) {
          const b = (blocks.get(i) as Extract<Block, { kind: 'text' }>) ?? { kind: 'text', text: '' };
          b.text += d.text;
          blocks.set(i, b);
          const visible = profile.hideToolRoundText ? (held += d.text, '') : filter(d.text);
          if (visible) {
            if (firstTokenMs == null) firstTokenMs = Date.now() - started;
            answer += visible;
            o.onText(visible);
          }
        } else if (d?.toolUse?.input) {
          const b = blocks.get(i);
          if (b?.kind === 'tool') b.json += d.toolUse.input;
        } else if (d?.reasoningContent) {
          const b = (blocks.get(i) as Extract<Block, { kind: 'reasoning' }>) ?? { kind: 'reasoning', text: '' };
          if (d.reasoningContent.text) b.text += d.reasoningContent.text;
          if (d.reasoningContent.signature) b.signature = d.reasoningContent.signature;
          if (d.reasoningContent.redactedContent) b.redacted = d.reasoningContent.redactedContent;
          blocks.set(i, b);
        }
      } else if (ev.messageStop) {
        stopReason = ev.messageStop.stopReason;
      } else if (ev.metadata) {
        const u: Partial<Record<string, number>> = (ev.metadata.usage as any) || {};
        roundUsage = { inputTokens: u.inputTokens || 0, outputTokens: u.outputTokens || 0, cacheReadInputTokens: u.cacheReadInputTokens || 0, cacheWriteInputTokens: u.cacheWriteInputTokens || 0 };
        for (const k of Object.keys(usage) as (keyof typeof usage)[]) usage[k] += roundUsage[k] || 0;
        guardrailTrace = ev.metadata.trace?.guardrail;
      }
    }

    if (profile.hideToolRoundText && held && stopReason !== 'tool_use') {
      let shown = filter(held) + filter.flush();
      // Safety net: an unclosed tag would swallow the whole answer - fall back to the raw text without tags.
      if (!shown.trim()) shown = held.replace(new RegExp(`</?(${(profile.stripTags || []).join('|') || 'x'})>`, 'g'), '').trim();
      if (shown) { if (firstTokenMs == null) firstTokenMs = Date.now() - started; answer += shown; o.onText(shown); }
    } else {
      const tail = filter.flush();
      if (tail) { answer += tail; o.onText(tail); }
    }
    const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
    const calls = ordered.filter((b): b is Extract<Block, { kind: 'tool' }> => b.kind === 'tool').map((t) => {
      let input: any = {};
      try { input = t.json ? JSON.parse(t.json) : {}; } catch { input = {}; }
      return { ...t, input };
    });
    const reasoning = ordered.filter((b) => b.kind === 'reasoning').map((b) => (b as { text: string }).text).join('\n');
    const roundText = ordered.filter((b) => b.kind === 'text').map((b) => (b as { text: string }).text).join('');

    // ---- reasoning log: one line per LLM call ----
    o.logger.info('llm_call', {
      log_type: 'llm_call',
      app: o.app,
      round,
      model_id: o.modelId,
      question: o.question.slice(0, 500),
      system_prompt_sha: systemSha,
      messages_in_context: o.messages.length,
      reasoning: reasoning.slice(0, 8000),
      reasoning_chars: reasoning.length,
      tool_calls: calls.map((c) => ({ name: c.name, input: c.input })),
      output_preview: roundText.slice(0, 1500),
      stop_reason: stopReason,
      usage: roundUsage,
      latency_ms: Date.now() - t0,
      guardrail: guardrailTrace ? JSON.stringify(guardrailTrace).slice(0, 1500) : undefined,
    });

    if (stopReason === 'guardrail_intervened') {
      guardrailText = roundText.trim() || "Sorry, I can't help with that request.";
      o.metrics.addMetric('GuardrailInterventions', MetricUnit.Count, 1);
      o.onGuardrail(guardrailText);
      break;
    }
    if (stopReason !== 'tool_use' || !calls.length) break;
    if (round === maxRounds) {
      const msg = '\n\n_I ran out of research steps for this question - please narrow it down._';
      answer += msg; o.onText(msg);
      break;
    }
    if (roundText && !roundText.endsWith('\n')) { answer += '\n\n'; o.onText('\n\n'); }

    const content: ContentBlock[] = ordered.map((b): ContentBlock => {
      if (b.kind === 'text') return { text: b.text };
      if (b.kind === 'reasoning') {
        return b.redacted
          ? { reasoningContent: { redactedContent: b.redacted } }
          : { reasoningContent: { reasoningText: { text: b.text, signature: b.signature } } };
      }
      const c = calls.find((x) => x.toolUseId === b.toolUseId)!;
      return { toolUse: { toolUseId: c.toolUseId, name: c.name, input: c.input } };
    }).filter((b) => !('text' in b) || (b as { text: string }).text.length > 0);
    o.messages.push({ role: 'assistant', content });

    const results = await Promise.all(calls.map(async (c) => {
      o.onToolStart(c.name, c.input);
      const ts = Date.now();
      try {
        const result = await o.runTool(c.name, c.input);
        toolLog.push({ name: c.name, ms: Date.now() - ts, ok: true });
        o.logger.info('tool', { log_type: 'tool', app: o.app, tool: c.name, input: c.input, ms: Date.now() - ts });
        o.metrics.addMetric(`Tool_${c.name}`, MetricUnit.Count, 1);
        return { toolUseId: c.toolUseId, status: 'success' as const, content: [{ json: result as any }] as ToolResultContentBlock[] };
      } catch (err) {
        toolLog.push({ name: c.name, ms: Date.now() - ts, ok: false });
        o.logger.warn('tool failed', { log_type: 'tool', app: o.app, tool: c.name, error: (err as Error).message });
        o.metrics.addMetric('ToolErrors', MetricUnit.Count, 1);
        return { toolUseId: c.toolUseId, status: 'error' as const, content: [{ text: `Tool error: ${(err as Error).message}. Tell the user this source is temporarily unavailable.` }] };
      }
    }));
    o.messages.push({ role: 'user', content: results.map((r) => ({ toolResult: r })) });
  }
  return { answer, guardrailText, toolLog, usage, firstTokenMs, rounds: round + 1 };
}
