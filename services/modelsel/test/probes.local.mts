process.env.TABLE_NAME = 'x';
const { measure } = await import('../src/index.ts');
const { CANDIDATES, scoreModels, DEFAULT_CONFIG } = await import('../../shared/modelSelection.ts');
const ms = Object.fromEntries(await Promise.all(CANDIDATES.map(async (c) => [c.key, await measure(c)] as const)));
for (const [k, m] of Object.entries(ms)) console.log(k.padEnd(18), 'pass', m.probePassRate, 'median', m.medianLatencyMs, 'ms  $', m.estCostPerAnswerUsd, m.error || '', m.probes.filter((p) => !p.pass).map((p) => `${p.id}:${p.note}`).join(' | '));
for (const w of [{ quality: 50, cost: 25, latency: 25 }, { quality: 100, cost: 0, latency: 0 }, { quality: 20, cost: 40, latency: 40 }, { quality: 0, cost: 50, latency: 50 }])
  console.log(JSON.stringify(w), scoreModels(DEFAULT_CONFIG, w, ms).map((r) => `${r.key}=${r.score.toFixed(3)}`).join('  '));
