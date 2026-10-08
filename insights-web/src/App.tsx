import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AuthError, getJson, getText, streamChat } from './api';
import { initSession, loadConfig, signOut, startLogin, type Session } from './auth';

type Tab = 'ask' | 'docs' | 'reasoning' | 'status';
const Md = ({ children }: { children: string }) => (
  <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children: c }) => <a href={href} target="_blank" rel="noreferrer">{c}</a>,
    table: ({ children: c }) => <div className="table-wrap"><table>{c}</table></div>,
  }}>{children}</ReactMarkdown></div>
);
const Logo = () => (
  <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent)" />
    <path d="M8 22V12M13 22V8M18 22v-6M23 22V11" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>
);

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('ask');
  const [ownerUrl, setOwnerUrl] = useState<string>();
  useEffect(() => { initSession().then(setSession).catch(() => setSession(null)); loadConfig().then((c) => setOwnerUrl(c.ownerAssistUrl)).catch(() => {}); }, []);
  const onAuthError = useCallback(() => setSession(null), []);

  if (session === undefined) return <div className="splash">Loading…</div>;
  if (!session) {
    return (
      <div className="signin">
        <Logo />
        <h1>Class Insights</h1>
        <p>How the Owner Assist demo was designed, built and deployed on AWS - with a chatbot that reads the project
          documentation and live AWS logs, including the reasoning behind every LLM call.</p>
        <button className="btn primary lg" onClick={() => startLogin('login')}>Sign in with your Owner Assist account</button>
        <p className="muted small">No account yet? <button className="link" onClick={() => startLogin('signup')}>Create one</button> (username + password).</p>
        {ownerUrl && <a href={ownerUrl}>← Back to Owner Assist</a>}
      </div>
    );
  }
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><Logo /><div><strong>Class Insights</strong><span>Owner Assist under the hood</span></div></div>
        <nav className="tabs" role="tablist">
          {([['ask', 'Ask'], ['docs', 'Design & deployment'], ['reasoning', 'LLM reasoning log'], ['status', 'Live status']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="spacer" />
        {ownerUrl && <a className="btn ghost" href={ownerUrl} target="_blank" rel="noreferrer">Owner Assist ↗</a>}
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </header>
      <main className="main">
        <div hidden={tab !== 'ask'} className="pane"><Ask onAuthError={onAuthError} /></div>
        {tab === 'docs' && <Docs onAuthError={onAuthError} />}
        {tab === 'reasoning' && <Reasoning onAuthError={onAuthError} />}
        {tab === 'status' && <Status onAuthError={onAuthError} />}
      </main>
    </div>
  );
}

/* ---------------- Ask (chatbot) ---------------- */
interface Msg { role: 'user' | 'assistant'; text: string; status: string[]; streaming?: boolean; meta?: string; error?: boolean }
const SUGGESTIONS = [
  'Draw the architecture of Owner Assist and explain each AWS service.',
  'Show me the reasoning from the last 3 questions students asked Owner Assist.',
  'How was the dataset curated from public sources?',
  'Which LLM is live right now, and how did the last LLM Selection evaluation decide?',
  'Why are the Lambda function URLs not publicly reachable?',
  'What did the Guardrail block today?',
  'How many answers were served in the last 24 hours and what was the p90 latency?',
  'What bugs were found during deployment and how were they fixed?',
  'What is the Knowledge Base chunking strategy and how many documents were ingested?',
];

function Ask({ onAuthError }: { onAuthError: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);

  const send = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: 'user', text: q, status: [] }, { role: 'assistant', text: '', status: [], streaming: true }]);
    setInput(''); setBusy(true);
    const patch = (f: (m: Msg) => Msg) => setMsgs((ms) => [...ms.slice(0, -1), f(ms[ms.length - 1])]);
    abort.current = new AbortController();
    try {
      for await (const ev of streamChat(q, history, abort.current.signal)) {
        if (ev.type === 'status') patch((m) => ({ ...m, status: [...m.status, ev.text] }));
        else if (ev.type === 'delta') patch((m) => ({ ...m, text: m.text + ev.text }));
        else if (ev.type === 'done') patch((m) => ({ ...m, streaming: false, meta: `${(ev.latencyMs / 1000).toFixed(1)} s · ${ev.usage.inputTokens + (ev.usage.cacheReadInputTokens || 0)} in / ${ev.usage.outputTokens} out tokens${ev.tools.length ? ` · tools: ${[...new Set(ev.tools.map((t) => t.name))].join(', ')}` : ''}` }));
        else if (ev.type === 'error') patch((m) => ({ ...m, error: true, text: m.text || ev.message }));
      }
    } catch (e) {
      if (e instanceof AuthError) return onAuthError();
      if ((e as Error).name !== 'AbortError') patch((m) => ({ ...m, error: true, text: m.text || 'Connection lost.' }));
    } finally { patch((m) => ({ ...m, streaming: false })); setBusy(false); }
  };

  return (
    <div className="chat">
      <div className="messages">
        {!msgs.length && (
          <div className="welcome">
            <h1>Ask anything about how Owner Assist was built</h1>
            <p className="muted">Answers come from the project knowledge document plus live AWS data: CloudWatch logs and metrics,
              LLM reasoning logs, CloudFormation and Bedrock configuration.</p>
            <div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => m.role === 'user'
          ? <div key={i} className="msg user"><div className="bubble">{m.text}</div></div>
          : (
            <div key={i} className={`msg assistant ${m.error ? 'error' : ''}`}>
              {m.status.length > 0 && <ul className="steps">{m.status.map((s, j) => <li key={j}>{m.streaming && j === m.status.length - 1 && !m.text ? <span className="spinner" /> : <span className="tick">✓</span>}{s}</li>)}</ul>}
              {m.streaming && !m.text && !m.status.length && <div className="muted"><span className="spinner" /> Thinking…</div>}
              {m.text && <Md>{m.text}</Md>}
              {m.meta && <div className="meta">{m.meta}</div>}
            </div>
          ))}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea value={input} rows={1} maxLength={2000} placeholder="Ask about the architecture, data, security, logs, reasoning…" aria-label="Question"
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        {busy ? <button type="button" className="btn secondary" onClick={() => abort.current?.abort()}>Stop</button>
          : <button className="btn primary" disabled={!input.trim()}>Ask</button>}
      </form>
    </div>
  );
}

/* ---------------- Docs ---------------- */
function Docs({ onAuthError }: { onAuthError: () => void }) {
  const [md, setMd] = useState<string>();
  const [err, setErr] = useState<string>();
  useEffect(() => { getText('/api/knowledge').then(setMd).catch((e) => (e instanceof AuthError ? onAuthError() : setErr(String(e)))); }, [onAuthError]);
  return (
    <div className="doc-page">
      <p className="muted small">This is <code>projectknowledge.md</code>, read live from a private S3 bucket. It is the same document the chatbot answers from, and it is updated with every deployment.</p>
      {err && <p className="error-text">{err}</p>}
      {md ? <Md>{md}</Md> : !err && <p className="muted"><span className="spinner" /> Loading…</p>}
    </div>
  );
}

/* ---------------- Reasoning log ---------------- */
interface LlmCall { time: string; app: string; round: number; question: string; reasoning?: string; tool_calls?: { name: string; input: unknown }[];
  output_preview?: string; stop_reason?: string; usage?: Record<string, number>; latency_ms?: number; conversation_id?: string }
function Reasoning({ onAuthError }: { onAuthError: () => void }) {
  const [app, setApp] = useState('all');
  const [minutes, setMinutes] = useState(1440);
  const [contains, setContains] = useState('');
  const [data, setData] = useState<{ query: string; llm_calls: LlmCall[] }>();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  const load = useCallback(() => {
    setLoading(true);
    getJson(`/api/reasoning?app=${app}&minutes=${minutes}&limit=40&contains=${encodeURIComponent(contains)}`)
      .then((d) => { setData(d); setOpen(0); }).catch((e) => e instanceof AuthError && onAuthError()).finally(() => setLoading(false));
  }, [app, minutes, contains, onAuthError]);
  useEffect(() => { load(); }, [app, minutes]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="doc-page wide">
      <div className="toolbar">
        <select value={app} onChange={(e) => setApp(e.target.value)} aria-label="Application">
          <option value="all">Both chatbots</option><option value="owner-assist">Owner Assist</option><option value="insights">Class Insights</option>
        </select>
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Time window">
          <option value={60}>Last hour</option><option value={1440}>Last 24 hours</option><option value={10080}>Last 7 days</option>
        </select>
        <input value={contains} placeholder="Contains text (e.g. warranty)" onChange={(e) => setContains(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      <p className="muted small">Each row is one call to Claude Sonnet 4.6 (adaptive thinking on). A question that uses tools produces several rounds:
        the model reasons, picks tools, reads the results, then reasons again and answers. Query: <code>{data?.query}</code></p>
      {data && !data.llm_calls.length && <p className="muted">No LLM calls in this window yet - ask something in Owner Assist or the Ask tab.</p>}
      <div className="calls">
        {data?.llm_calls.map((c, i) => (
          <div key={i} className={`call ${open === i ? 'open' : ''}`}>
            <button className="call-head" onClick={() => setOpen(open === i ? null : i)}>
              <span className={`pill ${c.app}`}>{c.app}</span>
              <span className="call-q">{c.question}</span>
              <span className="muted small">round {c.round} · {c.stop_reason} · {c.latency_ms} ms · {new Date(c.time.replace(' ', 'T') + 'Z').toLocaleTimeString()}</span>
            </button>
            {open === i && (
              <div className="call-body">
                <h4>Reasoning (model's thinking)</h4>
                <pre>{c.reasoning || '(no reasoning emitted for this call - adaptive thinking decided none was needed)'}</pre>
                {!!c.tool_calls?.length && (<><h4>Tool calls chosen</h4><pre>{JSON.stringify(c.tool_calls, null, 2)}</pre></>)}
                {c.output_preview && (<><h4>Text output (preview)</h4><pre>{c.output_preview}</pre></>)}
                <h4>Usage</h4><pre>{JSON.stringify(c.usage)}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Live status ---------------- */
function Status({ onAuthError }: { onAuthError: () => void }) {
  const [status, setStatus] = useState<any>();
  const [metrics, setMetrics] = useState<any>();
  const [ai, setAi] = useState<any>();
  useEffect(() => {
    const h = (e: unknown) => e instanceof AuthError && onAuthError();
    getJson('/api/status').then(setStatus).catch(h);
    getJson('/api/metrics?hours=24').then(setMetrics).catch(h);
    getJson('/api/ai').then(setAi).catch(h);
  }, [onAuthError]);
  const m = metrics?.metrics || {};
  const tile = (label: string, key: string, unit = '') => (
    <div className="tile"><span>{label}</span><strong>{m[key] == null ? '-' : `${Math.round(m[key]).toLocaleString()}${unit}`}</strong></div>
  );
  const job = ai?.knowledge_base?.recent_ingestion_jobs?.[0];
  return (
    <div className="doc-page wide">
      <h2>Last 24 hours</h2>
      <div className="tiles">
        {tile('Owner Assist answers', 'chat.ChatRequests.Sum')}{tile('Insights answers', 'insights.ChatRequests.Sum')}
        {tile('p90 time to first token', 'chat.TimeToFirstToken.p90', ' ms')}{tile('p90 full answer', 'chat.ChatLatency.p90', ' ms')}
        {tile('Input tokens', 'chat.InputTokens.Sum')}{tile('Output tokens', 'chat.OutputTokens.Sum')}
        {tile('Guardrail blocks', 'chat.GuardrailInterventions.Sum')}{tile('Thumbs up', 'api.FeedbackPositive.Sum')}
      </div>
      <h2>Knowledge Base</h2>
      {ai ? (
        <p>{ai.knowledge_base.name} · {ai.knowledge_base.status} · storage {ai.knowledge_base.storage?.type} · last ingestion {job?.status}
          {job && ` (${job.statistics?.numberOfDocumentsScanned} documents scanned, ${job.statistics?.numberOfDocumentsFailed} failed)`}</p>
      ) : <p className="muted">Loading…</p>}
      <h2>CloudFormation stacks</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Stack</th><th>Status</th><th>Resources</th><th>Last updated</th><th>Purpose</th></tr></thead>
        <tbody>{status?.stacks.map((s: any) => (
          <tr key={s.stack}><td><code>{s.stack}</code></td><td className={String(s.status).includes('COMPLETE') ? 'ok' : 'warn'}>{s.status}</td>
            <td>{s.resource_count ?? '-'}</td><td>{s.last_updated ? new Date(s.last_updated).toLocaleString() : '-'}</td><td>{s.description}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
