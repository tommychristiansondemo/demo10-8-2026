/**
 * LLM selection: the model catalog, the AppConfig document shape, and the scoring formula.
 * (web/src/components/modelScore.ts mirrors scoreModels() for live slider previews - keep them in sync.)
 *
 * Score = wQ * quality + wC * cost + wL * latency, each normalised 0..1 RELATIVE TO THE CANDIDATE SET:
 *   quality  = 70% published-benchmark prior + 30% live probe pass rate, min-max normalised
 *   cost     = estimated $ per typical Owner Assist answer, log-scale normalised (cheapest = 1)
 *   latency  = median live probe latency, log-scale normalised (fastest = 1)
 */
/** Per-model behaviour switches (stored in AppConfig with the model catalog). */
export interface ModelProfile {
  /** adaptive = Claude 4.6 adaptive thinking; budget = extended thinking with a token budget (Claude Haiku 4.5); none */
  thinking: 'adaptive' | 'budget' | 'none';
  /** Bedrock prompt caching: cachePoint after the system prompt */
  promptCache: boolean;
  /** cachePoint after tool definitions (Amazon Nova rejects it there) - defaults to promptCache */
  toolCache?: boolean;
  /** Tags whose content some models write into visible text (e.g. Nova <thinking>, gpt-oss <reasoning>) */
  stripTags?: string[];
  /** Don't stream text produced in rounds that end in a tool call (gpt-oss narrates its plan there) */
  hideToolRoundText?: boolean;
}

export interface CandidateModel {
  key: string;
  label: string;
  provider: string;
  modelId: string;              // Bedrock model / inference-profile id used for inference
  strengths: string;
  priceInPerM: number;          // USD per 1M input tokens (AWS Price List API, us-east-1, on-demand)
  priceOutPerM: number;         // USD per 1M output tokens
  qualityPrior: number;         // 0-100, from public benchmarks / vendor positioning (see knowledge doc)
  profile: ModelProfile;
}

export interface Measurement {
  probePassRate: number;        // 0..1
  probes: { id: string; pass: boolean; ms: number; note?: string }[];
  medianLatencyMs: number;
  estCostPerAnswerUsd: number;
  error?: string;
}

export interface RankedModel { key: string; label: string; score: number; quality: number; cost: number; latency: number }

export interface ModelSelectionConfig {
  schemaVersion: 1;
  weights: { quality: number; cost: number; latency: number }; // integers, sum 100
  activeModel: string;            // CandidateModel.key
  switchMargin: number;           // min score advantage (0..1) needed to switch models
  candidates: CandidateModel[];
  lastEvaluation?: {
    at: string; by: string; weights: { quality: number; cost: number; latency: number };
    measurements: Record<string, Measurement>;
    ranking: RankedModel[];
    decision: string;
    previousModel: string;
  };
}

export const TYPICAL_ANSWER = { inputTokens: 9000, outputTokens: 800 }; // ~2 model calls with tool results (from metrics)

export const CANDIDATES: CandidateModel[] = [
  { key: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'Anthropic', modelId: 'us.anthropic.claude-opus-4-6-v1',
    strengths: 'Highest reasoning quality and instruction following; slowest and most expensive.',
    priceInPerM: 5.5, priceOutPerM: 27.5, qualityPrior: 96, profile: { thinking: 'adaptive', promptCache: true } },
  { key: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', modelId: 'us.anthropic.claude-sonnet-4-6',
    strengths: 'Near-frontier quality and excellent tool use at mid-range price; the original model.',
    priceInPerM: 3.3, priceOutPerM: 16.5, qualityPrior: 92, profile: { thinking: 'adaptive', promptCache: true } },
  { key: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'Anthropic', modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    strengths: 'Fast, low-cost Claude with solid tool use; good default for high-volume chat.',
    priceInPerM: 1.1, priceOutPerM: 5.5, qualityPrior: 82, profile: { thinking: 'budget', promptCache: true } },
  { key: 'nova-2-lite', label: 'Amazon Nova 2 Lite', provider: 'Amazon', modelId: 'us.amazon.nova-2-lite-v1:0',
    strengths: 'AWS-native, very low cost and fast; weaker on nuanced instructions.',
    priceInPerM: 0.33, priceOutPerM: 2.75, qualityPrior: 72, profile: { thinking: 'none', promptCache: true, toolCache: false, stripTags: ['thinking'] } },
  { key: 'gpt-oss-120b', label: 'OpenAI gpt-oss-120b', provider: 'OpenAI (open-weight)', modelId: 'openai.gpt-oss-120b-1:0',
    strengths: 'Open-weight reasoning model; lowest token price on Bedrock; tool-call formatting less consistent.',
    priceInPerM: 0.15, priceOutPerM: 0.6, qualityPrior: 74, profile: { thinking: 'none', promptCache: false, stripTags: ['reasoning'], hideToolRoundText: true } },
];

export const DEFAULT_CONFIG: ModelSelectionConfig = {
  schemaVersion: 1,
  weights: { quality: 50, cost: 25, latency: 25 },
  activeModel: 'claude-sonnet-4-6',
  switchMargin: 0.02,
  candidates: CANDIDATES,
};

export const estCost = (c: CandidateModel) =>
  (TYPICAL_ANSWER.inputTokens * c.priceInPerM + TYPICAL_ANSWER.outputTokens * c.priceOutPerM) / 1e6;

export function qualityOf(c: CandidateModel, m?: Measurement) {
  return m && !m.error ? 0.7 * (c.qualityPrior / 100) + 0.3 * m.probePassRate : c.qualityPrior / 100 * 0.7;
}

export function scoreModels(cfg: Pick<ModelSelectionConfig, 'candidates'>, weights: ModelSelectionConfig['weights'],
  measurements: Record<string, Measurement> = {}): RankedModel[] {
  const rows = cfg.candidates.map((c) => {
    const m = measurements[c.key];
    return { c, q: qualityOf(c, m), cost: m?.estCostPerAnswerUsd ?? estCost(c), lat: m && !m.error ? m.medianLatencyMs : NaN };
  });
  const qs = rows.map((r) => r.q), cs = rows.map((r) => Math.log(r.cost));
  const ls = rows.filter((r) => Number.isFinite(r.lat)).map((r) => Math.log(r.lat));
  const norm = (v: number, lo: number, hi: number) => (hi - lo < 1e-9 ? 1 : (v - lo) / (hi - lo));
  const total = weights.quality + weights.cost + weights.latency || 1;
  return rows.map((r) => {
    const quality = norm(r.q, Math.min(...qs), Math.max(...qs));
    const cost = 1 - norm(Math.log(r.cost), Math.min(...cs), Math.max(...cs));
    const latency = Number.isFinite(r.lat) && ls.length ? 1 - norm(Math.log(r.lat), Math.min(...ls), Math.max(...ls)) : 0;
    const failed = !!measurements[r.c.key]?.error;
    const score = failed ? 0 : (weights.quality * quality + weights.cost * cost + weights.latency * latency) / total;
    return { key: r.c.key, label: r.c.label, score: +score.toFixed(4), quality: +quality.toFixed(3), cost: +cost.toFixed(3), latency: +latency.toFixed(3) };
  }).sort((a, b) => b.score - a.score);
}

export function validWeights(w: unknown): w is ModelSelectionConfig['weights'] {
  const x = w as Record<string, unknown>;
  return !!x && ['quality', 'cost', 'latency'].every((k) => Number.isInteger(x[k]) && (x[k] as number) >= 0 && (x[k] as number) <= 100)
    && (x.quality as number) + (x.cost as number) + (x.latency as number) === 100;
}
