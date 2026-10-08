/**
 * Class Insights dashboard API (GET only, all read-only, all redacted):
 *   /api/health  /api/knowledge  /api/status  /api/ai  /api/lambdas  /api/metrics?hours=  /api/reasoning?app=&minutes=&limit=&contains=
 *   /api/logs?source=&filter=&minutes=&limit=   /api/sources
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { authenticate, logger, LOG_SOURCES, lowerHeaders, metrics, projectKnowledge } from './common.js';
import { aiConfig, appMetrics, deploymentStatus, lambdaConfig, llmSelection, reasoningLogs, searchLogs } from './data.js';

const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body),
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  const path = event.rawPath.replace(/\/+$/, '');
  const q = event.queryStringParameters || {};
  try {
    if (path === '/api/health') return json(200, { ok: true });
    if (!(await authenticate(lowerHeaders(event.headers)))) return json(401, { error: 'Unauthorized' });
    if (event.requestContext.http.method !== 'GET') return json(405, { error: 'Read-only API' });
    switch (path) {
      case '/api/knowledge': return { statusCode: 200, headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' }, body: await projectKnowledge() };
      case '/api/status': return json(200, await deploymentStatus());
      case '/api/ai': return json(200, await aiConfig());
      case '/api/lambdas': return json(200, await lambdaConfig());
      case '/api/llm': return json(200, await llmSelection({ history: Number(q.history) || undefined }));
      case '/api/metrics': return json(200, await appMetrics({ hours: Number(q.hours) || 24 }));
      case '/api/reasoning': return json(200, await reasoningLogs({ app: q.app, minutes: Number(q.minutes) || undefined, limit: Number(q.limit) || undefined, contains: q.contains }));
      case '/api/logs': return json(200, await searchLogs({ source: q.source || '', filter_pattern: q.filter, minutes: Number(q.minutes) || undefined, limit: Number(q.limit) || undefined }));
      case '/api/sources': return json(200, Object.entries(LOG_SOURCES).map(([key, v]) => ({ key, ...v })));
      default: return json(404, { error: 'Not found' });
    }
  } catch (err) {
    logger.error('insights api error', err as Error);
    return json(500, { error: 'Internal error' });
  } finally {
    metrics.publishStoredMetrics();
  }
};
