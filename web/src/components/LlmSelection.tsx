import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthError, llmApi, type LlmState, type Weights } from '../api';
// Same scoring code the server uses, so the live preview always matches what "Evaluate & apply" will compute.
import { scoreModels } from '../../../services/shared/modelSelection';
import { Spinner } from './icons';

const KEYS: (keyof Weights)[] = ['quality', 'cost', 'latency'];
const LABEL: Record<keyof Weights, string> = { quality: 'Quality', cost: 'Cost', latency: 'Latency' };
const HINT: Record<keyof Weights, string> = {
  quality: 'answer accuracy, tool use, instruction following',
  cost: 'estimated $ per typical answer',
  latency: 'measured response time',
};
const DEFAULT: Weights = { quality: 50, cost: 25, latency: 25 };
const same = (a?: Weights, b?: Weights) => !!a && !!b && KEYS.every((k) => a[k] === b[k]);

/** Move one slider; redistribute the difference across the other two in proportion so the total stays exactly 100. */
export function rebalance(w: Weights, key: keyof Weights, value: number): Weights {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const others = KEYS.filter((k) => k !== key);
  const rest = 100 - v;
  const sumOthers = others.reduce((s, k) => s + w[k], 0);
  const out = { ...w, [key]: v } as Weights;
  if (sumOthers === 0) { out[others[0]] = Math.ceil(rest / 2); out[others[1]] = Math.floor(rest / 2); }
  else {
    out[others[0]] = Math.round((w[others[0]] / sumOthers) * rest);
    out[others[1]] = rest - out[others[0]];
  }
  return out;
}

export function LlmSelection({ onClose, onAuthError }: { onClose: () => void; onAuthError: () => void }) {
  const [state, setState] = useState<LlmState>();
  const [weights, setWeights] = useState<Weights>(DEFAULT);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const poll = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const s = await llmApi.state();
      setState(s);
      if (!touched) setWeights(s.weights);
      return s;
    } catch (e) { if (e instanceof AuthError) onAuthError(); else setError((e as Error).message); }
  }, [touched, onAuthError]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    window.clearInterval(poll.current);
    if (state?.run.state === 'running') poll.current = window.setInterval(load, 2500);
    return () => window.clearInterval(poll.current);
  }, [state?.run.state, load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preview = !!state && !same(weights, state.weights);
  const ranking = useMemo(() => (state ? scoreModels(state as any, weights, state.measurements) : []), [state, weights]);
  const running = state?.run.state === 'running';
  const byKey = Object.fromEntries((state?.candidates || []).map((c) => [c.key, c]));

  const evaluate = async () => {
    setError(undefined); setSubmitting(true);
    try {
      await llmApi.evaluate(weights);
      setTouched(false);
      await load();
    } catch (e) { if (e instanceof AuthError) onAuthError(); else setError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal llm" role="dialog" aria-label="LLM Selection">
        <div className="llm-head">
          <div>
            <h2>LLM Selection</h2>
            <p className="muted small">Amazon Bedrock lets this app switch foundation models without a code change. Your weights are stored in
              AWS AppConfig; evaluating runs live probes against all five models and, if a different model wins by at least
              {' '}{Math.round((state?.switchMargin ?? 0.02) * 100)} points, the live app switches to it within about 15 seconds.</p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        {!state ? <p className="muted"><Spinner /> Loading…</p> : (
          <>
            <div className="active-model">
              <span>Live model</span>
              <strong>{byKey[state.activeModel]?.label}</strong>
              <span className="muted small">{byKey[state.activeModel]?.provider} · <code>{byKey[state.activeModel]?.modelId}</code></span>
            </div>

            <div className="sliders">
              {KEYS.map((k) => (
                <label key={k} className="slider">
                  <span className="slider-top"><b>{LABEL[k]}</b><span className="pct">{weights[k]}%</span></span>
                  <input type="range" min={0} max={100} step={1} value={weights[k]} disabled={running}
                    aria-label={`${LABEL[k]} weight`}
                    onChange={(e) => { setTouched(true); setWeights((w) => rebalance(w, k, Number(e.target.value))); }} />
                  <span className="muted small">{HINT[k]}</span>
                </label>
              ))}
              <div className="sum">Total: <b>{weights.quality + weights.cost + weights.latency}%</b>
                {' · '}configured in AppConfig: {state.weights.quality}/{state.weights.cost}/{state.weights.latency}
                <button className="link" disabled={running} onClick={() => { setTouched(true); setWeights(DEFAULT); }}>Reset to 50/25/25</button>
              </div>
            </div>

            <div className="llm-actions">
              <button className="btn primary" disabled={running || submitting} onClick={evaluate}>
                {running || submitting ? <><Spinner /> Evaluating…</> : 'Evaluate & apply'}
              </button>
              {running && <span className="muted small">{state.run.progress} (live probes take about a minute)</span>}
              {!running && state.run.lastError && <span className="error-text small">Last run failed: {state.run.lastError}</span>}
              {error && <span className="error-text small">{error}</span>}
            </div>

            {state.lastEvaluation && (
              <div className="decision">
                <b>Last evaluation</b> ({new Date(state.lastEvaluation.at).toLocaleString()}, weights {state.lastEvaluation.weights.quality}/{state.lastEvaluation.weights.cost}/{state.lastEvaluation.weights.latency}): {state.lastEvaluation.decision}
              </div>
            )}

            <h3>Ranking {preview ? <span className="tag">preview with your sliders - not applied yet</span> : <span className="tag ok">at the configured weights</span>}</h3>
            <div className="table-wrap">
              <table className="rank">
                <thead><tr><th>#</th><th>Model</th><th>Score</th><th>Quality</th><th>Cost</th><th>Latency</th><th>Probes</th><th>Median latency</th><th>$ / answer</th></tr></thead>
                <tbody>
                  {ranking.map((r, i) => {
                    const c = byKey[r.key]; const m = state.measurements[r.key];
                    return [
                      <tr key={r.key} className={r.key === state.activeModel ? 'is-active' : ''} onClick={() => setOpen(open === r.key ? null : r.key)} title="Show probe details">
                        <td>{i + 1}</td>
                        <td><b>{r.label}</b>{r.key === state.activeModel && <span className="tag ok">live</span>}<div className="muted small">{c?.strengths}</div></td>
                        <td><div className="bar"><span style={{ width: `${Math.round(r.score * 100)}%` }} /></div><span className="small">{(r.score * 100).toFixed(1)}</span></td>
                        <td className="num">{(r.quality * 100).toFixed(0)}</td>
                        <td className="num">{(r.cost * 100).toFixed(0)}</td>
                        <td className="num">{(r.latency * 100).toFixed(0)}</td>
                        <td className="num">{m ? (m.error ? 'error' : `${Math.round(m.probePassRate * m.probes.length)}/${m.probes.length}`) : '-'}</td>
                        <td className="num">{m && !m.error ? `${(m.medianLatencyMs / 1000).toFixed(1)} s` : '-'}</td>
                        <td className="num">{m ? `$${m.estCostPerAnswerUsd.toFixed(4)}` : '-'}</td>
                      </tr>,
                      open === r.key && m && (
                        <tr key={`${r.key}-d`} className="probe-row"><td /><td colSpan={8}>
                          <div className="muted small">Bedrock model id <code>{c?.modelId}</code> · ${c?.priceInPerM}/M input, ${c?.priceOutPerM}/M output · quality prior {c?.qualityPrior} · thinking: {c?.thinking}</div>
                          {m.error ? <p className="error-text small">{m.error}</p> : (
                            <ul className="probes">{m.probes.map((p) => <li key={p.id}><span className={p.pass ? 'pass' : 'fail'}>{p.pass ? 'PASS' : 'FAIL'}</span> {p.id} · {(p.ms / 1000).toFixed(1)} s{p.note ? ` · ${p.note}` : ''}</li>)}</ul>
                          )}
                        </td></tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted small formula">
              Score = Quality weight × quality + Cost weight × cost + Latency weight × latency. Each factor is scaled 0-100 relative to these five models:
              quality = 70% published-benchmark prior + 30% live probe pass rate (9 Owner Assist probes: tool selection and arguments, grounding,
              citations, scope, safety); cost = estimated price of a typical answer (9k input + 800 output tokens, AWS Price List on-demand rates,
              log scale); latency = median measured probe time (log scale). Click a row for probe details.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
