/**
 * Read the live model-selection document from AWS AppConfig (AppConfigData API).
 * One configuration session per Lambda execution environment; polls at most every POLL_MS, and AppConfig returns an
 * empty body when nothing changed, so steady-state cost is one tiny call per 15 s per warm Lambda.
 */
import { AppConfigDataClient, GetLatestConfigurationCommand, StartConfigurationSessionCommand } from '@aws-sdk/client-appconfigdata';
import { DEFAULT_CONFIG, type CandidateModel, type ModelSelectionConfig } from './modelSelection.js';

const client = new AppConfigDataClient({});
const POLL_MS = 15_000;
let token: string | undefined;
let cached: ModelSelectionConfig | undefined;
let lastPoll = 0;

export async function getModelConfig(force = false): Promise<ModelSelectionConfig> {
  if (!process.env.APPCONFIG_APP_ID) return DEFAULT_CONFIG;
  if (!force && cached && Date.now() - lastPoll < POLL_MS) return cached;
  try {
    if (!token) {
      token = (await client.send(new StartConfigurationSessionCommand({
        ApplicationIdentifier: process.env.APPCONFIG_APP_ID, EnvironmentIdentifier: process.env.APPCONFIG_ENV_ID,
        ConfigurationProfileIdentifier: process.env.APPCONFIG_PROFILE_ID, RequiredMinimumPollIntervalInSeconds: 15,
      }))).InitialConfigurationToken;
    }
    const r = await client.send(new GetLatestConfigurationCommand({ ConfigurationToken: token }));
    token = r.NextPollConfigurationToken;
    lastPoll = Date.now();
    if (r.Configuration && r.Configuration.length) cached = JSON.parse(new TextDecoder().decode(r.Configuration));
  } catch (err) {
    token = undefined; // start a new session next time
    if (!cached) console.warn('AppConfig unavailable, using defaults', (err as Error).message);
  }
  return cached ?? DEFAULT_CONFIG;
}

export function activeCandidate(cfg: ModelSelectionConfig): CandidateModel {
  return cfg.candidates.find((c) => c.key === cfg.activeModel) ?? DEFAULT_CONFIG.candidates.find((c) => c.key === DEFAULT_CONFIG.activeModel)!;
}
