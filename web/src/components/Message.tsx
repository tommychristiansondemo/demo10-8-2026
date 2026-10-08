import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation } from '../api';
import type { UiMessage } from './Chat';
import { Spinner, ThumbIcon } from './icons';

const TOOL_LABELS: Record<string, string> = {
  search_owner_knowledge: 'Knowledge base', get_maintenance_schedule: 'Maintenance schedule', check_warranty_coverage: 'Warranty calculator',
  get_recalls: 'NHTSA recalls', get_owner_complaints: 'NHTSA complaints', decode_vin: 'VIN decoder', get_my_garage: 'My Garage', add_vehicle_to_garage: 'My Garage',
};

/** Number citations 1..n in order of first appearance and turn [S3] markers into badge links. */
function orderCitations(text: string, citations: Citation[] = []) {
  const known = new Map(citations.map((c) => [c.id, c]));
  const order: string[] = [];
  for (const m of text.matchAll(/\[(S\d+)\]/g)) if (known.has(m[1]) && !order.includes(m[1])) order.push(m[1]);
  const num = new Map(order.map((id, i) => [id, i + 1]));
  const linked = text.replace(/\[(S\d+)\]/g, (all, id) => (num.has(id) ? `[${num.get(id)}](#cite-${id})` : all));
  return { linked, ordered: order.map((id) => ({ ...known.get(id)!, n: num.get(id)! })) };
}

export function Message({ m, onRate }: { m: UiMessage; onRate: (r: 'up' | 'down') => void }) {
  if (m.role === 'user') return <div className="msg user"><div className="bubble">{m.text}</div></div>;
  const { linked, ordered: cites } = orderCitations(m.text, m.citations);
  const byId = Object.fromEntries(cites.map((c) => [c.id, c]));
  const toolNames = [...new Set((m.tools || []).map((t) => TOOL_LABELS[t.name] || t.name))];

  return (
    <div className={`msg assistant ${m.error ? 'error' : ''} ${m.guardrail ? 'guarded' : ''}`}>
      {m.status && m.status.length > 0 && (
        <ul className="steps">
          {m.status.map((s, i) => (
            <li key={i}>{m.streaming && i === m.status!.length - 1 && !m.text ? <Spinner /> : <span className="tick">✓</span>}{s}</li>
          ))}
        </ul>
      )}
      {m.streaming && !m.text && !(m.status && m.status.length) && <div className="thinking"><Spinner /> Thinking…</div>}
      {m.guardrail && <div className="guard-note">Blocked by content safety policy (Amazon Bedrock Guardrails)</div>}
      {m.text && (
        <div className="answer">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith('#cite-')) {
                  const c = byId[href.slice(6)];
                  return <a className="cite" href={c?.url || '#'} target="_blank" rel="noreferrer" title={c ? `${c.title}\n\n${c.snippet}` : ''}>{children}</a>;
                }
                return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
              },
              table: ({ children }) => <div className="table-wrap"><table>{children}</table></div>,
            }}
          >
            {linked}
          </ReactMarkdown>
          {m.streaming && <span className="caret" />}
        </div>
      )}
      {cites.length > 0 && (
        <div className="sources">
          <span className="sources-label">Sources</span>
          {cites.map((c) => (
            <a key={c.id} className="source" href={c.url || undefined} target="_blank" rel="noreferrer" title={c.snippet}>
              <b>{c.n}</b> {c.title}
            </a>
          ))}
        </div>
      )}
      {!m.streaming && !m.error && !m.guardrail && m.text && (
        <div className="msg-foot">
          {toolNames.length > 0 && <span className="muted small">Used: {toolNames.join(' · ')}</span>}
          {m.latencyMs != null && <span className="muted small">{(m.latencyMs / 1000).toFixed(1)} s</span>}
          {m.model && <span className="model-chip" title="Bedrock model that generated this answer">{m.model}</span>}
          <span className="spacer" />
          <button className={`icon-btn ${m.feedback === 'up' ? 'on' : ''}`} aria-label="Helpful" onClick={() => onRate('up')}><ThumbIcon /></button>
          <button className={`icon-btn ${m.feedback === 'down' ? 'on' : ''}`} aria-label="Not helpful" onClick={() => onRate('down')}><ThumbIcon down /></button>
        </div>
      )}
    </div>
  );
}
