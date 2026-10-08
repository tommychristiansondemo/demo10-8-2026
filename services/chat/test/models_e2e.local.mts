// Runs the real agent loop (real tools, KB, guardrail) once per candidate model.
process.env.TABLE_NAME ??= 'owner-assist-app';
process.env.KNOWLEDGE_BASE_ID ??= '7CI1PVE7WJ';
const { runAgentLoop } = await import('../../shared/agentLoop.ts');
const { CANDIDATES } = await import('../../shared/modelSelection.ts');
const { TOOL_SPECS, runTool } = await import('../src/tools/index.ts');
const { SYSTEM_PROMPT } = await import('../src/prompt.ts');
const { CitationRegistry } = await import('../src/tools/knowledge.ts');
const { bedrock, logger, metrics } = await import('../src/clients.ts');
logger.setLogLevel('ERROR' as any);
const q = process.argv[2] || 'My 2021 Rogue has 42,000 miles and went into service 2021-02-15. Is the powertrain still under warranty, and what does the manual say the slip indicator light means? Be brief.';
const only = process.argv[3];
await Promise.all(CANDIDATES.filter((c) => !only || c.key === only).map(async (c) => {
  const t0 = Date.now();
  try {
    const r = await runAgentLoop({ app: 'owner-assist', client: bedrock, modelId: c.modelId, profile: c.profile,
      system: [{ text: SYSTEM_PROMPT }, { cachePoint: { type: 'default' } }, { text: `Today's date: 2026-10-07.` }],
      messages: [{ role: 'user', content: [{ guardContent: { text: { text: q, qualifiers: ['guard_content'] } } }] }],
      tools: TOOL_SPECS, question: q, guardrail: { id: 'l0lh34n97bww', version: process.env.GV || '1' },
      logger, metrics, runTool: (n, i) => runTool(n, i, { userId: 'local-test', citations: new CitationRegistry() }),
      onText: () => {}, onToolStart: () => {}, onGuardrail: () => {} });
    console.log(`\n=== ${c.label} OK ${Date.now() - t0}ms rounds=${r.rounds} tools=${r.toolLog.map((t) => t.name)} usage=${JSON.stringify(r.usage)}\n${r.answer.slice(0, 700)}`);
  } catch (e) { console.log(`\n=== ${c.label} FAIL ${Date.now() - t0}ms ${(e as Error).name}: ${(e as Error).message.slice(0, 300)}`); }
}));
metrics.clearMetrics?.();
