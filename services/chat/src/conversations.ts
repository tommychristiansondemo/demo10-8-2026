/** Conversation persistence: one item per conversation holding the recent turns (plain text only). */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Message } from '@aws-sdk/client-bedrock-runtime';
import { ddb, TABLE } from './clients.js';
import type { Citation } from './tools/knowledge.js';

export interface Turn {
  id: string; role: 'user' | 'assistant'; text: string; at: string;
  citations?: Citation[]; tools?: { name: string; ms: number; ok: boolean }[]; guardrail?: boolean; model?: string;
}
export interface Conversation { id: string; title: string; createdAt: string; updatedAt: string; turns: Turn[] }

const MAX_TURNS_STORED = 40;
const MAX_TURNS_TO_MODEL = 12;
const TTL_DAYS = 90;

export async function loadConversation(userId: string, id: string): Promise<Conversation | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: `USER#${userId}`, sk: `CONV#${id}` } }));
  if (!res.Item) return undefined;
  const { pk, sk, ttl, ...c } = res.Item;
  return c as Conversation;
}

export async function saveConversation(userId: string, c: Conversation) {
  c.turns = c.turns.slice(-MAX_TURNS_STORED);
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `USER#${userId}`, sk: `CONV#${c.id}`, ...c, ttl: Math.floor(Date.now() / 1000) + TTL_DAYS * 86400 },
  }));
}

/** Replay recent history to the model as text-only messages (tool traffic isn't needed for follow-ups). */
export function historyMessages(c: Conversation | undefined): Message[] {
  if (!c) return [];
  const turns = c.turns.filter((t) => !t.guardrail).slice(-MAX_TURNS_TO_MODEL);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const msgs: Message[] = [];
  for (const t of turns) {
    const last = msgs[msgs.length - 1];
    if (last && last.role === t.role) {
      last.content!.push({ text: t.text });
    } else {
      msgs.push({ role: t.role, content: [{ text: t.text || '(no answer)' }] });
    }
  }
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop(); // unanswered user turn
  return msgs;
}
