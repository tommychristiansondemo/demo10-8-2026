import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
const c = new BedrockRuntimeClient({ region: 'us-east-1' });
const tools = [{ toolSpec: { name: 'get_recalls', description: 'Get NHTSA recalls for a Nissan model/year', inputSchema: { json: { type: 'object', properties: { model: { type: 'string' }, year: { type: 'integer' } }, required: ['model', 'year'] } } } }];
const models = process.argv.slice(2);
await Promise.all(models.map(async (m) => {
  const t0 = Date.now();
  try {
    const r = await c.send(new ConverseStreamCommand({ modelId: m, messages: [{ role: 'user', content: [{ text: 'Any recalls on a 2021 Nissan Rogue? Use the tool.' }] }],
      toolConfig: { tools: tools as any }, inferenceConfig: { maxTokens: 1000 } }));
    let args = '', name = '', first = 0;
    for await (const ev of r.stream!) {
      if (ev.contentBlockStart?.start?.toolUse) name = ev.contentBlockStart.start.toolUse.name!;
      if (ev.contentBlockDelta?.delta?.toolUse?.input) { args += ev.contentBlockDelta.delta.toolUse.input; first ||= Date.now() - t0; }
    }
    console.log(name ? 'OK  ' : 'NOTOOL', String(Date.now() - t0).padStart(6), 'ms', m, name, args);
  } catch (e) { console.log('FAIL', String(Date.now() - t0).padStart(6), 'ms', m, (e as Error).name, (e as Error).message.slice(0, 120)); }
}));
