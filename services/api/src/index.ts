/**
 * Owner Assist REST API (Lambda Function URL behind CloudFront /api/*).
 *   GET    /api/garage                      list vehicles
 *   POST   /api/garage                      add vehicle
 *   PUT    /api/garage/{id}                 update vehicle
 *   DELETE /api/garage/{id}                 delete vehicle
 *   GET    /api/conversations               list conversations (newest first)
 *   GET    /api/conversations/{id}          full conversation
 *   DELETE /api/conversations/{id}
 *   POST   /api/feedback                    { conversationId, messageId, rating: up|down, comment? }
 *   GET    /api/vin/{vin}                   NHTSA vPIC decode (for the add-vehicle form)
 *   GET    /api/health                      unauthenticated liveness probe
 */
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { getModelConfig } from '../../shared/appConfig.js';
import { scoreModels, validWeights } from '../../shared/modelSelection.js';

const logger = new Logger({ serviceName: 'owner-assist-api' });
const metrics = new Metrics({ namespace: 'OwnerAssist', serviceName: 'api' });
const tracer = new Tracer({ serviceName: 'owner-assist-api' });
const ddb = DynamoDBDocumentClient.from(tracer.captureAWSv3Client(new DynamoDBClient({})), { marshallOptions: { removeUndefinedValues: true } });
const TABLE = process.env.TABLE_NAME!;
const verifier = CognitoJwtVerifier.create({ userPoolId: process.env.USER_POOL_ID!, clientId: process.env.USER_POOL_CLIENT_ID!, tokenUse: 'access' });

const lambda = tracer.captureAWSv3Client(new LambdaClient({}));
const EVAL_STALE_MS = 5 * 60_000; // a run older than this is considered dead (lets a new one start)

/** LLM Selection state: live AppConfig document + ranking at the configured weights + run status/lock. */
async function modelsState() {
  const [cfg, status] = await Promise.all([
    getModelConfig(true),
    ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: 'MODELSEL', sk: 'STATUS' } })).then((r) => r.Item),
  ]);
  const measurements = cfg.lastEvaluation?.measurements || {};
  return {
    weights: cfg.weights,
    activeModel: cfg.activeModel,
    switchMargin: cfg.switchMargin,
    candidates: cfg.candidates.map(({ profile, ...c }) => ({ ...c, thinking: profile.thinking })),
    measurements,
    ranking: scoreModels(cfg, cfg.weights, measurements),
    lastEvaluation: cfg.lastEvaluation ? { at: cfg.lastEvaluation.at, weights: cfg.lastEvaluation.weights, decision: cfg.lastEvaluation.decision, previousModel: cfg.lastEvaluation.previousModel } : null,
    run: status ? { state: status.state === 'running' && Date.now() - Date.parse(status.startedAt) > EVAL_STALE_MS ? 'idle' : status.state,
      startedAt: status.startedAt, finishedAt: status.finishedAt, progress: status.progress, weights: status.weights,
      lastDecision: status.lastDecision, lastError: status.lastError } : { state: 'idle' },
  };
}

const MODELS = ['Altima', 'Ariya', 'Armada', 'Frontier', 'GT-R', 'Kicks', 'Kicks Play', 'LEAF', 'Maxima', 'Murano', 'Pathfinder',
  'Rogue', 'Rogue Sport', 'Sentra', 'Titan', 'Titan XD', 'Versa', 'Versa Note', 'Z', '370Z'];

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body),
});

function parseVehicle(b: any, partial = false) {
  const errs: string[] = [];
  const year = Number(b.year);
  const model = MODELS.find((m) => m.toLowerCase() === String(b.model || '').toLowerCase());
  if (!partial || b.model !== undefined) if (!model) errs.push(`model must be one of: ${MODELS.join(', ')}`);
  if (!partial || b.year !== undefined) if (!Number.isInteger(year) || year < 1990 || year > new Date().getFullYear() + 1) errs.push('year is invalid');
  if (b.mileage != null && (!Number.isFinite(Number(b.mileage)) || Number(b.mileage) < 0 || Number(b.mileage) > 1_000_000)) errs.push('mileage is invalid');
  if (b.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(b.vin)) errs.push('VIN must be 17 characters (no I, O or Q)');
  if (b.inServiceDate && !/^\d{4}-\d{2}-\d{2}$/.test(b.inServiceDate)) errs.push('inServiceDate must be YYYY-MM-DD');
  if (errs.length) throw new HttpError(400, errs.join('; '));
  return {
    ...(model ? { model } : {}), ...(b.year !== undefined ? { year } : {}),
    nickname: b.nickname ? String(b.nickname).slice(0, 40) : undefined,
    trim: b.trim ? String(b.trim).slice(0, 40) : undefined,
    vin: b.vin ? String(b.vin).toUpperCase() : undefined,
    mileage: b.mileage != null && b.mileage !== '' ? Math.round(Number(b.mileage)) : undefined,
    inServiceDate: b.inServiceDate || undefined,
    certifiedPreOwned: !!b.certifiedPreOwned,
  };
}

async function route(method: string, path: string, user: string, body: any) {
  const pk = `USER#${user}`;
  let m: RegExpMatchArray | null;

  if (method === 'GET' && path === '/api/garage') {
    const r = await ddb.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)', ExpressionAttributeValues: { ':p': pk, ':s': 'VEHICLE#' } }));
    return json(200, { vehicles: (r.Items || []).map(({ pk: _p, sk: _s, ...v }) => v) });
  }
  if (method === 'POST' && path === '/api/garage') {
    const count = await ddb.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)', ExpressionAttributeValues: { ':p': pk, ':s': 'VEHICLE#' }, Select: 'COUNT' }));
    if ((count.Count || 0) >= 10) throw new HttpError(409, 'Garage is limited to 10 vehicles');
    const v = { vehicleId: randomUUID(), ...parseVehicle(body), updatedAt: new Date().toISOString() };
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk, sk: `VEHICLE#${v.vehicleId}`, ...v } }));
    metrics.addMetric('VehiclesAdded', MetricUnit.Count, 1);
    return json(201, v);
  }
  if ((m = path.match(/^\/api\/garage\/([\w-]{36})$/))) {
    const key = { pk, sk: `VEHICLE#${m[1]}` };
    if (method === 'DELETE') {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: key }));
      return json(204, {});
    }
    if (method === 'PUT') {
      const cur = await ddb.send(new GetCommand({ TableName: TABLE, Key: key }));
      if (!cur.Item) throw new HttpError(404, 'Vehicle not found');
      const v = { ...cur.Item, ...parseVehicle({ ...cur.Item, ...body }), vehicleId: m[1], updatedAt: new Date().toISOString() };
      await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...v, ...key } }));
      const { pk: _p, sk: _s, ...out } = v as any;
      return json(200, out);
    }
  }
  if (method === 'GET' && path === '/api/conversations') {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE, KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)', ExpressionAttributeValues: { ':p': pk, ':s': 'CONV#' },
      ProjectionExpression: 'id, title, createdAt, updatedAt',
    }));
    const items = (r.Items || []).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 50);
    return json(200, { conversations: items });
  }
  if ((m = path.match(/^\/api\/conversations\/([\w-]{8,64})$/))) {
    const key = { pk, sk: `CONV#${m[1]}` };
    if (method === 'GET') {
      const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: key }));
      if (!r.Item) throw new HttpError(404, 'Conversation not found');
      const { pk: _p, sk: _s, ttl: _t, ...c } = r.Item;
      return json(200, c);
    }
    if (method === 'DELETE') {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: key }));
      return json(204, {});
    }
  }
  if (method === 'POST' && path === '/api/feedback') {
    const rating = body.rating === 'up' || body.rating === 'down' ? body.rating : null;
    if (!rating || !/^[\w-]{8,64}$/.test(String(body.messageId || ''))) throw new HttpError(400, 'messageId and rating (up|down) are required');
    await ddb.send(new PutCommand({ TableName: TABLE, Item: {
      pk, sk: `FEEDBACK#${body.messageId}`, conversationId: body.conversationId, messageId: body.messageId, rating,
      comment: body.comment ? String(body.comment).slice(0, 1000) : undefined, at: new Date().toISOString(),
    } }));
    metrics.addMetric(rating === 'up' ? 'FeedbackPositive' : 'FeedbackNegative', MetricUnit.Count, 1);
    logger.info('feedback', { rating, messageId: body.messageId, conversationId: body.conversationId, comment: body.comment });
    return json(200, { ok: true });
  }
  if (method === 'GET' && (m = path.match(/^\/api\/vin\/([A-Za-z0-9]{17})$/))) {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${m[1].toUpperCase()}?format=json`, { signal: AbortSignal.timeout(8000) });
    const r = ((await res.json()) as any).Results?.[0] || {};
    const model = MODELS.find((x) => x.toLowerCase() === String(r.Model || '').toLowerCase());
    return json(200, { make: r.Make, model: model || r.Model, year: Number(r.ModelYear) || undefined, trim: r.Trim || r.Series || undefined, supported: String(r.Make).toUpperCase() === 'NISSAN' && !!model });
  }
  if (method === 'GET' && path === '/api/models') return json(200, { models: MODELS });
  if (method === 'GET' && path === '/api/llm') return json(200, await modelsState());
  if (method === 'POST' && path === '/api/llm/evaluate') {
    const weights = { quality: Number(body.weights?.quality), cost: Number(body.weights?.cost), latency: Number(body.weights?.latency) };
    if (!validWeights(weights)) throw new HttpError(400, 'weights must be whole numbers 0-100 that add up to 100');
    const now = new Date().toISOString();
    try { // one evaluation at a time across the whole class (conditional write = distributed lock)
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: { pk: 'MODELSEL', sk: 'STATUS', state: 'running', startedAt: now, weights, requestedBy: user, progress: 'Starting…' },
        ConditionExpression: 'attribute_not_exists(pk) OR #s <> :running OR startedAt < :stale',
        ExpressionAttributeNames: { '#s': 'state' },
        ExpressionAttributeValues: { ':running': 'running', ':stale': new Date(Date.now() - EVAL_STALE_MS).toISOString() },
      }));
    } catch (e) {
      if ((e as Error).name === 'ConditionalCheckFailedException') throw new HttpError(409, 'Another student is running an evaluation right now - watch the progress and try again when it finishes.');
      throw e;
    }
    await lambda.send(new InvokeCommand({ FunctionName: process.env.MODEL_SELECTION_FN!, InvocationType: 'Event',
      Payload: new TextEncoder().encode(JSON.stringify({ weights, requestedBy: user })) }));
    metrics.addMetric('ModelEvaluationsRequested', MetricUnit.Count, 1);
    logger.info('model evaluation requested', { weights });
    return json(202, { started: true, weights });
  }
  throw new HttpError(404, 'Not found');
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/+$/, '');
  try {
    if (path === '/api/health') return json(200, { ok: true, at: new Date().toISOString() });
    const token = event.headers?.['x-auth-token'];
    let sub: string;
    try {
      sub = (await verifier.verify(token || '')).sub;
    } catch {
      return json(401, { error: 'Unauthorized' });
    }
    logger.appendKeys({ userId: sub });
    const body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : {};
    return await route(method, path, sub, body);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    if (err instanceof SyntaxError) return json(400, { error: 'Invalid JSON' });
    logger.error('api error', err as Error);
    return json(500, { error: 'Internal error' });
  } finally {
    metrics.publishStoredMetrics();
  }
};
