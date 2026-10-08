/** Normalise free-text model names ("Nissan Rogue SV AWD", "LEAF", "Z Nismo") to catalogue keys. */
const KNOWN = [
  'rogue sport', 'rogue', 'versa note', 'versa', 'kicks play', 'kicks', 'sentra', 'altima', 'maxima', 'murano',
  'pathfinder', 'armada', 'frontier', 'titan xd', 'titan', 'leaf', 'ariya', 'gt-r', '370z', 'z',
];

export function canonicalModel(raw: string): string {
  const s = ` ${String(raw || '').toLowerCase().replace(/nissan/g, ' ').replace(/[^a-z0-9\- ]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const k of KNOWN) {
    if (s.includes(` ${k} `)) return k;
  }
  if (/\bgtr\b/.test(s)) return 'gt-r';
  if (/\bnissan z\b|\b400z\b/.test(s)) return 'z';
  return s.trim();
}

/** NHTSA uses upper-case model names. */
export function nhtsaModel(raw: string): string {
  return canonicalModel(raw).toUpperCase();
}

export function titleModel(raw: string): string {
  const m = canonicalModel(raw);
  if (m === 'leaf' || m === 'ariya') return m.toUpperCase();
  if (m === 'gt-r') return 'GT-R';
  return m.replace(/\b\w/g, (c) => c.toUpperCase()).replace('Xd', 'XD');
}
