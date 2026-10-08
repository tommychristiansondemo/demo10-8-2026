import { App } from 'aws-cdk-lib';

/** Typed view of cdk.json context so stacks don't sprinkle tryGetContext calls around. */
export interface AppConfig {
  appName: string;
  domainName: string;
  hostedZoneId: string;
  siteHostnames: string[];
  insightsHostname: string;
  alarmEmail?: string;
  chatModelId: string;
  embeddingModelId: string;
}

export function loadConfig(app: App): AppConfig {
  const ctx = (k: string) => app.node.tryGetContext(k);
  return {
    appName: 'owner-assist',
    domainName: ctx('domainName'),
    hostedZoneId: ctx('hostedZoneId'),
    siteHostnames: ctx('siteHostnames'),
    insightsHostname: ctx('insightsHostname'),
    alarmEmail: ctx('alarmEmail') || undefined,
    chatModelId: ctx('chatModelId'),
    embeddingModelId: ctx('embeddingModelId'),
  };
}
