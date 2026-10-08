import { useEffect, useRef, useState } from 'react';
import { api, AuthError, streamChat, type Citation, type ToolRun, type Vehicle } from '../api';
import { Message } from './Message';

export interface UiMessage {
  id: string; role: 'user' | 'assistant'; text: string;
  status?: string[]; streaming?: boolean; citations?: Citation[]; tools?: ToolRun[];
  latencyMs?: number; guardrail?: boolean; error?: boolean; feedback?: 'up' | 'down'; model?: string;
}

interface Props {
  conversationId?: string;
  vehicles: Vehicle[];
  onConversationStarted: (id: string) => void;
  onTurnComplete: () => void;
  onAuthError: () => void;
  onAddVehicle: () => void;
}

function suggestions(vehicles: Vehicle[]) {
  const v = vehicles[0];
  if (v) {
    const name = `${v.year} ${v.model}`;
    return [
      `When is my next scheduled maintenance on my ${name}?`,
      `Is my ${name} still under warranty?`,
      `Are there any open safety recalls for the ${name}?`,
      `What oil does my ${name} take and how much?`,
      `What problems do other owners report with the ${name}?`,
      'My tire pressure light is on - what should I do?',
    ];
  }
  return [
    'How often should I change the oil on a 2024 Rogue?',
    'Is a 2019 Sentra with 70,000 miles still covered for CVT problems?',
    'Are there any recalls on the 2021 Rogue?',
    'What does the slip indicator light mean?',
    'How do I charge a Nissan LEAF on a DC fast charger?',
    'What does Nissan\'s powertrain warranty cover?',
  ];
}

export function Chat({ conversationId, vehicles, onConversationStarted, onTurnComplete, onAuthError, onAddVehicle }: Props) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState(conversationId);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load history only for the conversation this instance was opened with. App re-keys <Chat> when the user switches
  // conversations; a conversation started here must not be re-fetched mid-stream (it isn't saved until the answer ends).
  const initialConversation = useRef(conversationId);
  useEffect(() => {
    const id = initialConversation.current;
    if (!id) return;
    api.getConversation(id).then((c) => setMessages(c.turns.map((t) => ({
      id: t.id, role: t.role, text: t.text, citations: t.citations, tools: t.tools, guardrail: t.guardrail, model: t.model,
    })))).catch((e) => { if (e instanceof AuthError) onAuthError(); });
  }, [onAuthError]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);

  const patch = (id: string, f: (m: UiMessage) => UiMessage) => setMessages((ms) => ms.map((m) => (m.id === id ? f(m) : m)));

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    const tmpId = `pending-${Date.now()}`;
    setMessages((ms) => [...ms, { id: `u-${Date.now()}`, role: 'user', text: q }, { id: tmpId, role: 'assistant', text: '', status: [], streaming: true }]);
    let id = tmpId;
    abort.current = new AbortController();
    try {
      for await (const ev of streamChat(q, convId, abort.current.signal)) {
        if (ev.type === 'meta') {
          const newId = ev.messageId;
          patch(id, (m) => ({ ...m, id: newId }));
          id = newId;
          if (!convId) { setConvId(ev.conversationId); onConversationStarted(ev.conversationId); }
        } else if (ev.type === 'status') patch(id, (m) => ({ ...m, status: [...(m.status || []), ev.text] }));
        else if (ev.type === 'delta') patch(id, (m) => ({ ...m, text: m.text + ev.text }));
        else if (ev.type === 'guardrail') patch(id, (m) => ({ ...m, text: ev.text, guardrail: true }));
        else if (ev.type === 'done') patch(id, (m) => ({ ...m, streaming: false, citations: ev.citations, tools: ev.tools, latencyMs: ev.latencyMs, model: ev.model?.label }));
        else if (ev.type === 'error') patch(id, (m) => ({ ...m, streaming: false, error: true, text: m.text || ev.message }));
      }
    } catch (e) {
      if (e instanceof AuthError) { onAuthError(); return; }
      if ((e as Error).name !== 'AbortError') patch(id, (m) => ({ ...m, error: true, text: m.text || 'Connection lost. Please try again.' }));
    } finally {
      patch(id, (m) => ({ ...m, streaming: false }));
      setBusy(false);
      onTurnComplete();
      inputRef.current?.focus();
    }
  };

  const rate = async (m: UiMessage, rating: 'up' | 'down') => {
    if (!convId) return;
    patch(m.id, (x) => ({ ...x, feedback: rating }));
    try { await api.feedback(convId, m.id, rating); } catch { /* non-critical */ }
  };

  return (
    <div className="chat">
      <div className="messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="welcome">
            <h1>How can I help with your Nissan?</h1>
            <p className="muted">
              {vehicles.length
                ? <>Answers are tailored to your garage: <strong>{vehicles.map((v) => `${v.year} ${v.model}`).join(', ')}</strong>.</>
                : <>Tip: <button className="link" onClick={onAddVehicle}>add your vehicle</button> for answers about your exact model, mileage and warranty.</>}
            </p>
            <div className="chips">
              {suggestions(vehicles).map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m) => <Message key={m.id} m={m} onRate={(r) => rate(m, r)} />)}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          maxLength={2000}
          placeholder="Ask about maintenance, warning lights, warranty, recalls…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          aria-label="Your question"
        />
        {busy
          ? <button type="button" className="btn secondary" onClick={() => abort.current?.abort()}>Stop</button>
          : <button className="btn primary" disabled={!input.trim()}>Send</button>}
      </form>
      <p className="composer-note">AI answers can be wrong. Built from public sources for training - confirm with your Owner's Manual or a Nissan dealer.</p>
    </div>
  );
}
