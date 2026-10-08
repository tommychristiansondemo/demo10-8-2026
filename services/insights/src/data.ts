/** Read-only data sources for the Insights chatbot tools and dashboard API. Every result passes through redact(). */
import { GetGuardrailCommand } from '@aws-sdk/client-bedrock';
import { GetDataSourceCommand, GetKnowledgeBaseCommand, ListIngestionJobsCommand } from '@aws-sdk/client-bedrock-agent';
import { DescribeStacksCommand, ListStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import { GetMetricDataCommand, type MetricDataQuery } from '@aws-sdk/client-cloudwatch';
import { FilterLogEventsCommand, GetQueryResultsCommand, StartQueryCommand } from '@aws-sdk/client-cloudwatch-logs';
import { GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { GetHostedConfigurationVersionCommand, ListDeploymentsCommand, ListHostedConfigurationVersionsCommand } from '@aws-sdk/client-appconfig';
import { appconfig, bedrock, bedrockAgent, cfn, cw, cwl, lambda, LOG_SOURCES, redact, STACKS } from './common.js';

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : dflt));
const tryJson = (s: string) => { try { return JSON.parse(s); } catch { return s; } };

export async function searchLogs(input: { source: string; filter_pattern?: string; minutes?: number; limit?: number }) {
  const src = LOG_SOURCES[input.source];
  if (!src) return { error: `Unknown source. Allowed: ${Object.keys(LOG_SOURCES).join(', ')}` };
  const minutes = clamp(input.minutes, 1, 7 * 24 * 60, 60);
  const limit = clamp(input.limit, 1, 50, 20);
  const r = await cwl.send(new FilterLogEventsCommand({
    logGroupName: src.group,
    startTime: Date.now() - minutes * 60_000,
    filterPattern: input.filter_pattern || undefined,
    limit: 200,
  }));
  const events = (r.events || []).slice(-limit).reverse().map((e) => {
    const m = tryJson(e.message || '');
    if (m && typeof m === 'object') {
      // Trim bulky fields so one tool result can't blow the model's context
      for (const k of ['reasoning', 'output_preview']) if (typeof m[k] === 'string' && m[k].length > 1200) m[k] = `${m[k].slice(0, 1200)}…`;
    }
    return { time: new Date(e.timestamp!).toISOString(), message: typeof m === 'string' ? m.slice(0, 1500) : m };
  });
  return redact({ source: input.source, log_group: src.group, window_minutes: minutes, filter_pattern: input.filter_pattern || null, returned: events.length, events });
}

/** CloudWatch Logs Insights over the structured `llm_call` lines written by services/shared/agentLoop.ts. */
export async function reasoningLogs(input: { app?: string; minutes?: number; limit?: number; contains?: string }) {
  const minutes = clamp(input.minutes, 5, 7 * 24 * 60, 24 * 60);
  const limit = clamp(input.limit, 1, 50, 15);
  const groups = input.app === 'insights' ? [LOG_SOURCES['insights-chat'].group]
    : input.app === 'owner-assist' ? [LOG_SOURCES['owner-assist-chat'].group]
      : [LOG_SOURCES['owner-assist-chat'].group, LOG_SOURCES['insights-chat'].group];
  const contains = (input.contains || '').replace(/[^\w\s.,?'-]/g, '').slice(0, 80);
  const query = `fields @timestamp, @message | filter log_type = "llm_call"${contains ? ` and @message like /(?i)${contains}/` : ''} | sort @timestamp desc | limit ${limit}`;
  const { queryId } = await cwl.send(new StartQueryCommand({
    logGroupNames: groups, startTime: Math.floor((Date.now() - minutes * 60_000) / 1000), endTime: Math.floor(Date.now() / 1000), queryString: query,
  }));
  let res;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    res = await cwl.send(new GetQueryResultsCommand({ queryId }));
    if (['Complete', 'Failed', 'Cancelled', 'Timeout'].includes(String(res.status))) break;
  }
  const calls = (res?.results || []).map((row) => {
    const msg = tryJson(row.find((f) => f.field === '@message')?.value || '{}');
    return {
      time: row.find((f) => f.field === '@timestamp')?.value,
      app: msg.app, round: msg.round, model_id: msg.model_id, question: msg.question,
      conversation_id: msg.conversationId, message_id: msg.messageId,
      reasoning: msg.reasoning, tool_calls: msg.tool_calls, output_preview: msg.output_preview,
      stop_reason: msg.stop_reason, usage: msg.usage, latency_ms: msg.latency_ms, guardrail: msg.guardrail ? 'trace present' : undefined,
    };
  });
  return redact({ query, log_groups: groups, window_minutes: minutes, status: res?.status, returned: calls.length, llm_calls: calls });
}

export async function appMetrics(input: { hours?: number }) {
  const hours = clamp(input.hours, 1, 24 * 14, 24);
  const period = hours <= 24 ? 3600 : 86400;
  const defs: [string, string, string][] = [
    ['ChatRequests', 'chat', 'Sum'], ['ChatErrors', 'chat', 'Sum'], ['GuardrailInterventions', 'chat', 'Sum'],
    ['ChatLatency', 'chat', 'p50'], ['ChatLatency', 'chat', 'p90'], ['TimeToFirstToken', 'chat', 'p50'], ['TimeToFirstToken', 'chat', 'p90'],
    ['InputTokens', 'chat', 'Sum'], ['OutputTokens', 'chat', 'Sum'], ['CacheReadTokens', 'chat', 'Sum'], ['ToolCallsPerAnswer', 'chat', 'Average'],
    ['ModelEvaluationsRequested', 'api', 'Sum'], ['FeedbackPositive', 'api', 'Sum'], ['FeedbackNegative', 'api', 'Sum'], ['VehiclesAdded', 'api', 'Sum'],
    ['ChatRequests', 'insights', 'Sum'], ['InputTokens', 'insights', 'Sum'], ['OutputTokens', 'insights', 'Sum'],
  ];
  const tools = ['search_owner_knowledge', 'get_maintenance_schedule', 'check_warranty_coverage', 'get_recalls', 'get_owner_complaints', 'decode_vin', 'get_my_garage', 'add_vehicle_to_garage'];
  const all: [string, string, string][] = [...defs, ...tools.map((t) => [`Tool_${t}`, 'chat', 'Sum'] as [string, string, string])];
  const queries: MetricDataQuery[] = all.map(([name, service, stat], i) => ({
    Id: `m${i}`, Label: `${service}.${name}.${stat}`,
    MetricStat: { Metric: { Namespace: 'OwnerAssist', MetricName: name, Dimensions: [{ Name: 'service', Value: service }] }, Period: period, Stat: stat },
  }));
  const r = await cw.send(new GetMetricDataCommand({ MetricDataQueries: queries, StartTime: new Date(Date.now() - hours * 3600_000), EndTime: new Date() }));
  const summary: Record<string, number | null> = {};
  for (const m of r.MetricDataResults || []) {
    const v = m.Values || [];
    const stat = m.Label!.split('.').pop()!;
    summary[m.Label!] = !v.length ? null : stat === 'Sum' ? v.reduce((a, b) => a + b, 0)
      : Math.round(stat === 'Average' ? v.reduce((a, b) => a + b, 0) / v.length : Math.max(...v));
  }
  return { window_hours: hours, note: 'Percentiles are the worst period value in the window. Source: CloudWatch namespace OwnerAssist (Powertools EMF).', metrics: summary };
}

export async function deploymentStatus() {
  const stacks = await Promise.all(STACKS.map(async (name) => {
    try {
      const s = (await cfn.send(new DescribeStacksCommand({ StackName: name }))).Stacks![0];
      const res = await cfn.send(new ListStackResourcesCommand({ StackName: name }));
      const types: Record<string, number> = {};
      for (const r of res.StackResourceSummaries || []) types[r.ResourceType!] = (types[r.ResourceType!] || 0) + 1;
      return {
        stack: name, status: s.StackStatus, description: s.Description,
        created: s.CreationTime?.toISOString(), last_updated: (s.LastUpdatedTime || s.CreationTime)?.toISOString(),
        outputs: (s.Outputs || []).filter((o) => !o.OutputKey!.startsWith('ExportsOutput')).map((o) => ({ key: o.OutputKey, value: o.OutputValue })),
        resource_count: res.StackResourceSummaries?.length, resource_types: types,
      };
    } catch {
      return { stack: name, status: 'NOT_DEPLOYED' };
    }
  }));
  return redact({ region: 'us-east-1', stacks });
}

export async function aiConfig() {
  const kbId = process.env.KNOWLEDGE_BASE_ID!;
  const [kb, ds, jobs, gr] = await Promise.all([
    bedrockAgent.send(new GetKnowledgeBaseCommand({ knowledgeBaseId: kbId })),
    bedrockAgent.send(new GetDataSourceCommand({ knowledgeBaseId: kbId, dataSourceId: process.env.DATA_SOURCE_ID! })),
    bedrockAgent.send(new ListIngestionJobsCommand({ knowledgeBaseId: kbId, dataSourceId: process.env.DATA_SOURCE_ID!, maxResults: 5, sortBy: { attribute: 'STARTED_AT', order: 'DESCENDING' } })),
    bedrock.send(new GetGuardrailCommand({ guardrailIdentifier: process.env.GUARDRAIL_ID!, guardrailVersion: process.env.GUARDRAIL_VERSION! })),
  ]);
  const k = kb.knowledgeBase!;
  return redact({
    knowledge_base: {
      id: k.knowledgeBaseId, name: k.name, status: k.status, description: k.description,
      embedding: k.knowledgeBaseConfiguration?.vectorKnowledgeBaseConfiguration, storage: k.storageConfiguration,
      data_source: { name: ds.dataSource?.name, chunking: ds.dataSource?.vectorIngestionConfiguration?.chunkingConfiguration, bucket: ds.dataSource?.dataSourceConfiguration?.s3Configuration?.bucketArn },
      recent_ingestion_jobs: (jobs.ingestionJobSummaries || []).map((j) => ({ id: j.ingestionJobId, status: j.status, started: j.startedAt, updated: j.updatedAt, statistics: j.statistics })),
    },
    guardrail: {
      id: gr.guardrailId, version: gr.version, name: gr.name, status: gr.status,
      blocked_input_message: gr.blockedInputMessaging, blocked_output_message: gr.blockedOutputsMessaging,
      content_filters: gr.contentPolicy?.filters, denied_topics: gr.topicPolicy?.topics, pii: gr.sensitiveInformationPolicy?.piiEntities,
      word_policy: gr.wordPolicy?.managedWordLists,
    },
  });
}

export async function lambdaConfig() {
  const names = ['owner-assist-chat', 'owner-assist-api', 'owner-assist-model-selection', 'owner-assist-signup-trigger', 'owner-assist-insights-chat', 'owner-assist-insights-api'];
  const fns = await Promise.all(names.map(async (n) => {
    try {
      const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: n }));
      return { name: n, description: c.Description, runtime: c.Runtime, architecture: c.Architectures, memory_mb: c.MemorySize, timeout_s: c.Timeout,
        tracing: c.TracingConfig?.Mode, last_modified: c.LastModified, code_size_bytes: c.CodeSize, environment: c.Environment?.Variables };
    } catch { return { name: n, status: 'not found' }; }
  }));
  return redact({ functions: fns, note: 'No API keys or secrets exist in this application: AWS access is via IAM roles; users authenticate with Cognito.' });
}

/** LLM Selection: the live AppConfig document plus version/deployment history (who switched what, when). */
export async function llmSelection(input: { history?: number }) {
  const ids = { ApplicationId: process.env.APPCONFIG_APP_ID!, ConfigurationProfileId: process.env.APPCONFIG_PROFILE_ID! };
  const n = clamp(input.history, 1, 30, 10);
  const versions = (await appconfig.send(new ListHostedConfigurationVersionsCommand({ ...ids, MaxResults: n }))).Items || [];
  const latest = versions[0];
  const doc = latest ? JSON.parse(new TextDecoder().decode((await appconfig.send(new GetHostedConfigurationVersionCommand({ ...ids, VersionNumber: latest.VersionNumber! }))).Content)) : null;
  const deployments = ((await appconfig.send(new ListDeploymentsCommand({ ApplicationId: ids.ApplicationId, EnvironmentId: process.env.APPCONFIG_ENV_ID!, MaxResults: n }))).Items || [])
    .map((d) => ({ number: d.DeploymentNumber, version: d.ConfigurationVersion, state: d.State, started: d.StartedAt, completed: d.CompletedAt, percent: d.PercentageComplete }));
  return redact({
    appconfig: { application: ids.ApplicationId, environment: process.env.APPCONFIG_ENV_ID, profile: ids.ConfigurationProfileId, strategy: 'owner-assist-immediate (0 min, 0 bake, 100%)' },
    live: doc && { activeModel: doc.activeModel, weights: doc.weights, switchMargin: doc.switchMargin,
      candidates: doc.candidates.map((c: any) => ({ key: c.key, label: c.label, modelId: c.modelId, priceInPerM: c.priceInPerM, priceOutPerM: c.priceOutPerM, qualityPrior: c.qualityPrior, profile: c.profile })),
      lastEvaluation: doc.lastEvaluation },
    version_history: versions.map((v) => ({ version: v.VersionNumber, description: v.Description })),
    deployments,
  });
}
