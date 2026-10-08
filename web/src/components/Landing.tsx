import { CarIcon } from './icons';

const FEATURES = [
  { t: 'Maintenance, by the book', d: 'Factory schedules and fluid specs from 2023-2025 owner\'s manuals, with your next service computed from your mileage.' },
  { t: 'Warranty, calculated', d: 'See which coverages are still active - basic, powertrain, EV battery, CVT extensions and CPO - with exact dates and miles left.' },
  { t: 'Live recall checks', d: 'Safety recalls and owner-reported issues pulled live from NHTSA, plus Takata "Do Not Drive" alerts.' },
  { t: 'Answers with sources', d: 'Every answer cites the owner\'s manual page or guide it came from, so you can verify it.' },
];

export function Landing({ onSignIn, onSignUp, insightsUrl }: { onSignIn: () => void; onSignUp: () => void; insightsUrl?: string }) {
  return (
    <div className="landing">
      <header className="topbar landing-bar">
        <div className="brand"><CarIcon size={26} /><div><strong>Owner Assist</strong><span>for Nissan vehicles</span></div></div>
        <div className="spacer" />
        {insightsUrl && <a className="btn ghost insights-link" href={insightsUrl} target="_blank" rel="noreferrer">Class Insights ↗</a>}
        <button className="btn ghost" onClick={onSignIn}>Sign in</button>
      </header>
      <section className="hero">
        <h1>Your Nissan questions, answered with sources.</h1>
        <p>Ask about warning lights, maintenance, warranty coverage, recalls, EV charging and more. Save your vehicles to My Garage for answers tailored to your car.</p>
        <div className="hero-actions">
          <button className="btn primary lg" onClick={onSignUp}>Create a free account</button>
          <button className="btn secondary lg" onClick={onSignIn}>Sign in</button>
        </div>
      </section>
      {insightsUrl && (
        <a className="insights-banner" href={insightsUrl} target="_blank" rel="noreferrer">
          <strong>Students: see how this app was built →</strong>
          <span>Class Insights explains the architecture, data pipeline and deployment, and shows live logs and the LLM's reasoning.</span>
        </a>
      )}
      <section className="features">
        {FEATURES.map((f) => (
          <div className="feature" key={f.t}><h3>{f.t}</h3><p>{f.d}</p></div>
        ))}
      </section>
      <footer className="disclaimer">
        Training demonstration for an AWS course, built from public sources (Nissan USA owner's manuals and warranty booklets,
        NHTSA). Not affiliated with, endorsed by, or operated by Nissan. Always confirm with your Owner's Manual or a Nissan dealer.
      </footer>
    </div>
  );
}
