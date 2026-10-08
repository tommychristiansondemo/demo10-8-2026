import { useCallback, useEffect, useState } from 'react';
import { api, AuthError, type ConversationSummary, type Vehicle } from './api';
import { initSession, loadConfig, signOut, startLogin, type Session } from './auth';
import { Chat } from './components/Chat';
import { Landing } from './components/Landing';
import { Sidebar } from './components/Sidebar';
import { VehicleForm } from './components/VehicleForm';
import { LlmSelection } from './components/LlmSelection';
import { CarIcon } from './components/icons';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | undefined>();
  const [chatKey, setChatKey] = useState(0);
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llmOpen, setLlmOpen] = useState(false);

  const [insightsUrl, setInsightsUrl] = useState<string | undefined>();
  useEffect(() => { initSession().then(setSession).catch(() => setSession(null)); }, []);
  useEffect(() => { loadConfig().then((c) => setInsightsUrl(c.insightsUrl)).catch(() => {}); }, []);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof AuthError) { setSession(null); return; }
    setError(e instanceof Error ? e.message : String(e));
    setTimeout(() => setError(null), 6000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [v, c] = await Promise.all([api.listVehicles(), api.listConversations()]);
      setVehicles(v); setConversations(c);
    } catch (e) { handleError(e); }
  }, [handleError]);

  useEffect(() => { if (session) refresh(); }, [session, refresh]);

  if (session === undefined) return <div className="splash"><CarIcon size={40} /><span>Loading…</span></div>;
  if (!session) return <Landing insightsUrl={insightsUrl} onSignIn={() => startLogin('login')} onSignUp={() => startLogin('signup')} />;

  const newChat = () => { setActiveConversation(undefined); setChatKey((k) => k + 1); setDrawer(false); };

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn menu" aria-label="Open garage and history" onClick={() => setDrawer(!drawer)}>☰</button>
        <div className="brand"><CarIcon size={26} /><div><strong>Owner Assist</strong><span>for Nissan vehicles</span></div></div>
        <span className="demo-pill" title="Built for an AWS class from public sources. Not affiliated with Nissan.">Training demo</span>
        <div className="spacer" />
        <button className="btn ghost llm-btn" onClick={() => setLlmOpen(true)} title="Choose which Bedrock LLM powers the assistant">
          <span className="long">LLM Selection</span><span className="short">LLM</span></button>
        {insightsUrl && <a className="btn ghost insights-link" href={insightsUrl} target="_blank" rel="noreferrer" title="How this app was designed and deployed, with live logs"><span className="long">Class Insights ↗</span><span className="short">Insights ↗</span></a>}
        <span className="who">{session.name || session.username || session.email}</span>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </header>
      <div className="layout">
        <Sidebar
          open={drawer}
          vehicles={vehicles}
          conversations={conversations}
          activeConversation={activeConversation}
          onAddVehicle={() => setEditing('new')}
          onEditVehicle={(v) => setEditing(v)}
          onNewChat={newChat}
          onOpenConversation={(id) => { setActiveConversation(id); setChatKey((k) => k + 1); setDrawer(false); }}
          onDeleteConversation={async (id) => {
            try { await api.deleteConversation(id); if (id === activeConversation) newChat(); refresh(); } catch (e) { handleError(e); }
          }}
          onClose={() => setDrawer(false)}
        />
        <main className="main">
          <Chat
            key={chatKey}
            conversationId={activeConversation}
            vehicles={vehicles}
            onConversationStarted={(id) => { setActiveConversation(id); }}
            onTurnComplete={refresh}
            onAuthError={() => setSession(null)}
            onAddVehicle={() => setEditing('new')}
          />
        </main>
      </div>
      {editing && (
        <VehicleForm
          vehicle={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
          onError={handleError}
        />
      )}
      {llmOpen && <LlmSelection onClose={() => setLlmOpen(false)} onAuthError={() => setSession(null)} />}
      {error && <div className="toast" role="alert">{error}</div>}
    </div>
  );
}
