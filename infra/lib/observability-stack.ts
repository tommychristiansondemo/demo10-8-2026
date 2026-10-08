import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { AppConfig } from './config';

interface ObservabilityProps extends StackProps {
  chatFn: lambda.IFunction;
  apiFn: lambda.IFunction;
  distributionId: string;
  webAclName: string;
  modelId: string;
}

/** Operational dashboard + alarms (application metrics come from Powertools EMF in the Lambdas). */
export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, cfg: AppConfig, props: ObservabilityProps) {
    super(scope, id, props);

    const topic = new sns.Topic(this, 'Alarms', { topicName: `${cfg.appName}-alarms`, displayName: 'Owner Assist alarms' });
    if (cfg.alarmEmail) topic.addSubscription(new subs.EmailSubscription(cfg.alarmEmail));
    const action = new cwActions.SnsAction(topic);

    const app = (name: string, stat = 'Sum', service = 'chat', label?: string) => new cw.Metric({
      namespace: 'OwnerAssist', metricName: name, dimensionsMap: { service }, statistic: stat, period: Duration.minutes(5), label: label ?? name,
    });
    const tools = ['search_owner_knowledge', 'get_maintenance_schedule', 'check_warranty_coverage', 'get_recalls',
      'get_owner_complaints', 'decode_vin', 'get_my_garage', 'add_vehicle_to_garage'];
    const cf = (metricName: string, stat = 'Sum') => new cw.Metric({
      namespace: 'AWS/CloudFront', metricName, region: 'us-east-1', statistic: stat, period: Duration.minutes(5),
      dimensionsMap: { DistributionId: props.distributionId, Region: 'Global' },
    });
    const waf = (rule: string) => new cw.Metric({
      namespace: 'AWS/WAFV2', metricName: 'BlockedRequests', statistic: 'Sum', period: Duration.minutes(5), label: rule,
      dimensionsMap: { WebACL: props.webAclName, Rule: rule },
    });
    const bedrockModel = props.modelId;
    const br = (metricName: string, stat = 'Sum') => new cw.Metric({
      namespace: 'AWS/Bedrock', metricName, statistic: stat, period: Duration.minutes(5), dimensionsMap: { ModelId: bedrockModel },
    });

    const dash = new cw.Dashboard(this, 'Dashboard', { dashboardName: `${cfg.appName}-operations`, defaultInterval: Duration.hours(3) });
    dash.addWidgets(
      new cw.TextWidget({ width: 24, height: 2, markdown: '# Owner Assist - operations\nChat quality, latency, cost drivers, tool usage, safety (Guardrail/WAF), and edge health.' }),
    );
    dash.addWidgets(
      new cw.SingleValueWidget({ title: 'Answers (period)', width: 6, metrics: [app('ChatRequests')], setPeriodToTimeRange: true }),
      new cw.SingleValueWidget({ title: 'Feedback', width: 6, metrics: [app('FeedbackPositive', 'Sum', 'api', 'Thumbs up'), app('FeedbackNegative', 'Sum', 'api', 'Thumbs down')], setPeriodToTimeRange: true }),
      new cw.SingleValueWidget({ title: 'Guardrail interventions', width: 6, metrics: [app('GuardrailInterventions')], setPeriodToTimeRange: true }),
      new cw.SingleValueWidget({ title: 'Chat errors', width: 6, metrics: [app('ChatErrors'), app('ToolErrors')], setPeriodToTimeRange: true }),
    );
    dash.addWidgets(
      new cw.GraphWidget({ title: 'Latency (ms): first token & full answer', width: 12, left: [
        app('TimeToFirstToken', 'p50', 'chat', 'First token p50'), app('TimeToFirstToken', 'p90', 'chat', 'First token p90'),
        app('ChatLatency', 'p50', 'chat', 'Answer p50'), app('ChatLatency', 'p90', 'chat', 'Answer p90')] }),
      new cw.GraphWidget({ title: 'Tokens (cost driver)', width: 12, left: [app('InputTokens'), app('OutputTokens'), app('CacheReadTokens', 'Sum', 'chat', 'Prompt-cache reads')] }),
    );
    dash.addWidgets(
      new cw.GraphWidget({ title: 'Tool calls', width: 12, stacked: true, left: tools.map((t) => app(`Tool_${t}`, 'Sum', 'chat', t)) }),
      new cw.GraphWidget({ title: 'Bedrock model (Sonnet 4.6) invocations / throttles', width: 12, left: [br('Invocations'), br('InvocationThrottles'), br('InvocationServerErrors')] }),
    );
    dash.addWidgets(
      new cw.GraphWidget({ title: 'Answers by live model (LLM Selection)', width: 16, stacked: true, left: [new cw.MathExpression({
        expression: `SEARCH('{OwnerAssist,model,service} MetricName="AnswersByModel"', 'Sum', 300)`, label: '', period: Duration.minutes(5) })] }),
      new cw.SingleValueWidget({ title: 'Model evaluations requested', width: 8, metrics: [app('ModelEvaluationsRequested', 'Sum', 'api')], setPeriodToTimeRange: true }),
    );
    dash.addWidgets(
      new cw.GraphWidget({ title: 'Lambda duration p90 (ms)', width: 8, left: [props.chatFn.metricDuration({ statistic: 'p90' }), props.apiFn.metricDuration({ statistic: 'p90' })] }),
      new cw.GraphWidget({ title: 'Lambda errors / throttles', width: 8, left: [props.chatFn.metricErrors(), props.apiFn.metricErrors(), props.chatFn.metricThrottles(), props.apiFn.metricThrottles()] }),
      new cw.GraphWidget({ title: 'Lambda concurrency', width: 8, left: [props.chatFn.metric('ConcurrentExecutions', { statistic: 'Maximum' })] }),
    );
    dash.addWidgets(
      new cw.GraphWidget({ title: 'CloudFront requests', width: 8, left: [cf('Requests')] }),
      new cw.GraphWidget({ title: 'CloudFront error rate (%)', width: 8, left: [cf('4xxErrorRate', 'Average'), cf('5xxErrorRate', 'Average')] }),
      new cw.GraphWidget({ title: 'WAF blocked requests', width: 8, stacked: true, left: ['ChatRateLimit', 'GlobalRateLimit', 'AWSManagedRulesCommonRuleSet', 'AWSManagedRulesKnownBadInputsRuleSet', 'AWSManagedRulesAmazonIpReputationList'].map(waf) }),
    );

    const alarm = (id: string, metric: cw.IMetric, threshold: number, desc: string, periods = 1) => {
      const a = new cw.Alarm(this, id, {
        alarmName: `${cfg.appName}-${id}`, alarmDescription: desc, metric, threshold, evaluationPeriods: periods,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD, treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });
      a.addAlarmAction(action);
      return a;
    };
    alarm('ChatErrors', app('ChatErrors'), 5, '5+ failed chat answers in 5 minutes');
    alarm('ChatLambdaErrors', props.chatFn.metricErrors({ period: Duration.minutes(5) }), 3, 'Chat Lambda invocation errors');
    alarm('ApiLambdaErrors', props.apiFn.metricErrors({ period: Duration.minutes(5) }), 5, 'API Lambda invocation errors');
    alarm('SlowAnswers', app('ChatLatency', 'p90'), 45_000, 'p90 answer latency >= 45 s for 15 minutes', 3);
    alarm('BedrockThrottles', br('InvocationThrottles'), 10, 'Bedrock throttling the chat model');
    alarm('Edge5xx', cf('5xxErrorRate', 'Average'), 5, 'CloudFront 5xx error rate >= 5%', 2);
  }
}
