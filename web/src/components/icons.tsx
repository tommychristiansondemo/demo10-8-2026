export const CarIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="var(--accent)" />
    <path d="M7 19l2.2-5.6A3 3 0 0 1 12 11.5h8a3 3 0 0 1 2.8 1.9L25 19v4.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V22h-11v1.5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z" fill="#fff" />
    <circle cx="11" cy="19" r="1.4" fill="var(--accent)" /><circle cx="21" cy="19" r="1.4" fill="var(--accent)" />
  </svg>
);

export const Spinner = () => <span className="spinner" aria-hidden="true" />;

export const ThumbIcon = ({ down = false }: { down?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={down ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M7 10v12" /><path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 18.4 21H7V10l4.3-7.6a1.6 1.6 0 0 1 2.9 1.1z" />
  </svg>
);
