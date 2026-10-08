import type { ConversationSummary, Vehicle } from '../api';

interface Props {
  open: boolean;
  vehicles: Vehicle[];
  conversations: ConversationSummary[];
  activeConversation?: string;
  onAddVehicle: () => void;
  onEditVehicle: (v: Vehicle) => void;
  onNewChat: () => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onClose: () => void;
}

const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function Sidebar(p: Props) {
  return (
    <>
      {p.open && <div className="scrim" onClick={p.onClose} />}
      <aside className={`sidebar ${p.open ? 'open' : ''}`}>
        <button className="btn primary block" onClick={p.onNewChat}>+ New conversation</button>

        <section>
          <div className="section-head"><h2>My Garage</h2><button className="link" onClick={p.onAddVehicle}>Add</button></div>
          {p.vehicles.length === 0 && (
            <button className="empty-card" onClick={p.onAddVehicle}>
              <strong>Add your vehicle</strong><span>Get answers for your exact model, year and mileage.</span>
            </button>
          )}
          {p.vehicles.map((v) => (
            <button key={v.vehicleId} className="vehicle-card" onClick={() => p.onEditVehicle(v)} title="Edit vehicle">
              <span className="vc-title">{v.nickname || `${v.year} ${v.model}`}</span>
              <span className="vc-sub">{v.year} Nissan {v.model}{v.trim ? ` ${v.trim}` : ''}</span>
              <span className="vc-meta">{v.mileage != null ? `${v.mileage.toLocaleString()} mi` : 'mileage not set'}{v.certifiedPreOwned ? ' · CPO' : ''}</span>
            </button>
          ))}
        </section>

        <section className="history">
          <h2>Recent conversations</h2>
          {p.conversations.length === 0 && <p className="muted small">No conversations yet.</p>}
          <ul>
            {p.conversations.map((c) => (
              <li key={c.id} className={c.id === p.activeConversation ? 'active' : ''}>
                <button className="conv" onClick={() => p.onOpenConversation(c.id)}>
                  <span className="conv-title">{c.title}</span><span className="conv-time">{ago(c.updatedAt)}</span>
                </button>
                <button className="icon-btn del" aria-label={`Delete conversation ${c.title}`} onClick={() => p.onDeleteConversation(c.id)}>×</button>
              </li>
            ))}
          </ul>
        </section>
        <p className="sidebar-foot">Training demo built from public sources. Not affiliated with Nissan.</p>
      </aside>
    </>
  );
}
