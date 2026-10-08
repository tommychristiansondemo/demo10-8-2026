# Project knowledge: Owner Assist + Class Insights

_Maintained by Claude Code (the AI coding agent that designed, built and deployed both applications for the instructor).
Updated with every deployment; see the Change log at the end. Last updated: 2026-10-07._

This document is the knowledge source for the **Class Insights** chatbot. It describes, in full, how the two
applications built for this 3-day AWS class were designed, built, tested and deployed. Nothing here is secret: the
design contains **no API keys or stored credentials** (all AWS access uses IAM roles; users sign in with Amazon Cognito).

---

## 1. What was built, and why

| | Owner Assist | Class Insights |
|---|---|---|
| URL | https://www.awsteach.com (also https://nissan.awsteach.com) | https://insights.awsteach.com |
| Audience | Drivers (students role-play as Nissan owners) | Students in the class |
| Purpose | Ask questions about Nissan vehicles: features, warning lights, maintenance, warranty, recalls, common problems, EV charging | Explain how Owner Assist (and Insights itself) was designed and deployed; show live logs, metrics and LLM reasoning |
| Sign-in | Cognito managed login: username + password (min 6 chars, no other rules, no email) | Same accounts (second Cognito app client) |

**The original request (instructor, paraphrased):** "Create a portal that drivers can use to ask questions about Nissan
products, including maintenance issues. You cannot access proprietary Nissan datasets, so curate data from online
sources to approximate what a chatbot with Nissan data would answer. Include warranty data and other helpful information.
Show enterprise-quality design and deployment. Use DNS records in the awsteach.com zone, ACM certificates and CloudFront
so it is publicly accessible."

Follow-up requests (same day): remove password restrictions and stop asking for an email address; then build this
separate Class Insights application with a chatbot backed by this document plus live AWS logs, including reasoning logs.

**Branding / responsibility:** the app is named "Owner Assist - for Nissan vehicles", uses no Nissan logos or trade dress,
and states on every page that it is a training demo built from public sources and is not affiliated with Nissan.

---

## 2. Architecture

```
                         Route 53 (awsteach.com hosted zone)
                 www / nissan.awsteach.com          insights.awsteach.com
                              |                              |
                 CloudFront distribution #1          CloudFront distribution #2
           (ACM cert, AWS WAF web ACL, HTTP/3,  (own ACM cert, SAME WAF web ACL,
            security headers, SPA rewrite fn)     security headers, SPA rewrite fn)
              |            |             |          |            |            |
          /* (S3 OAC)  /api/chat     /api/*     /* (S3 OAC)  /api/chat     /api/*
              |       (Lambda URL  (Lambda URL      |       (Lambda URL   (Lambda URL
        S3 site bucket  stream,OAC)   OAC)     S3 site bucket stream,OAC)   OAC)
        React SPA     owner-assist  owner-assist   React SPA  owner-assist-  owner-assist-
        + config.json   -chat         -api       + config.json insights-chat insights-api
                         |  \          |                          |    \        |
     Bedrock ConverseStream  \     DynamoDB              Bedrock ConverseStream  read-only AWS APIs:
     (Claude Sonnet 4.6,      \   owner-assist-app        (Sonnet 4.6, adaptive   CloudWatch Logs (+Insights),
      adaptive thinking,       \  (KMS CMK, PITR, TTL)     thinking) with         CloudWatch metrics,
      tools, prompt caching)    \                          projectknowledge.md    CloudFormation, Bedrock KB/
     Bedrock Guardrail           \- NHTSA public APIs      from S3 as the system  Guardrail config, Lambda config
     Bedrock Knowledge Base         (recalls, complaints,  prompt
       -> S3 Vectors index           vPIC VIN decoder)
       <- S3 corpus bucket (KMS)
Amazon Cognito user pool (managed login v2, OAuth 2.0 authorization code + PKCE), 2 app clients
CloudWatch: Powertools structured logs (incl. llm_call reasoning logs), EMF metrics, dashboard, 6 alarms -> SNS; X-Ray; WAF logs
```

Everything is in **us-east-1** (account 154833006816). CloudFront certificates and CLOUDFRONT-scope WAF must be in
us-east-1 anyway, so a single region keeps the design simple.

### Request flow: one Owner Assist question
1. The browser (React SPA) holds a Cognito **access token** obtained via OAuth 2.0 authorization code + PKCE.
2. It POSTs `/api/chat` to CloudFront with headers `X-Auth-Token: <access token>` and `x-amz-content-sha256: <SHA-256 of body>`.
3. CloudFront matches the `/api/chat` behavior and signs the request to the Lambda Function URL with **SigV4 via Origin
   Access Control (OAC)**. The Function URL uses `AWS_IAM` auth, so **only this distribution** can invoke it (a direct
   call to the function URL returns 403; the smoke test verifies this). Because OAC occupies the `Authorization` header,
   the user's token travels in `X-Auth-Token`; for POST bodies OAC requires the client to send the payload hash.
4. The `owner-assist-chat` Lambda verifies the JWT (aws-jwt-verify: issuer, audience/client id, expiry, signature),
   loads the driver's garage + conversation history from DynamoDB, and runs the **agent loop** (section 4).
5. The answer **streams** back as NDJSON events (`meta`, `status`, `delta`, `guardrail`, `done`, `error`, `ping`)
   using Lambda response streaming. A `ping` heartbeat every 10 s keeps CloudFront's 60 s origin read timeout from tripping.
6. The exchange is saved (text only) to DynamoDB; metrics and logs are emitted.

---

## 3. Infrastructure as code (AWS CDK, TypeScript)

8 CDK stacks + a dedicated bootstrap stack. App code lives in `/home/tommy/demo` on the instructor's machine.

| Stack | Main resources |
|---|---|
| `OwnerAssist-Data` | KMS customer-managed key `alias/owner-assist-data` (rotation on); DynamoDB `owner-assist-app` (on-demand, PITR, TTL attribute `ttl`, CMK encryption); S3 `owner-assist-kb-source-<acct>` (KMS, versioned, TLS-only, block public access) |
| `OwnerAssist-AI` | S3 Vectors bucket `owner-assist-vectors-<acct>` + index `owner-knowledge` (1024-dim float32, cosine); Bedrock Knowledge Base `owner-assist-owner-knowledge` + data source `owner-corpus`; Bedrock Guardrail `owner-assist-guardrail` + published version; KB service role |
| `OwnerAssist-Identity` | Cognito user pool `owner-assist-drivers` (username sign-in), managed login v2 domain `owner-assist-drivers-<acct>.auth.us-east-1.amazoncognito.com`, web app client, branding, pre-sign-up Lambda `owner-assist-signup-trigger` |
| `OwnerAssist-Api` | Lambda `owner-assist-chat` (Node.js 22, arm64, 1024 MB, 3 min, response streaming) and `owner-assist-api` (512 MB, 15 s), IAM-auth Function URLs, log groups (30-day retention) |
| `OwnerAssist-Web` | ACM certificate (www + nissan), WAF web ACL `owner-assist-edge` + logging to `aws-waf-logs-owner-assist`, S3 site bucket, CloudFront distribution, CloudFront Function (SPA rewrite), response-headers policy, Route 53 A/AAAA alias records, BucketDeployment of the React build + `config.json` |
| `OwnerAssist-ModelConfig` | AWS AppConfig application `owner-assist` / environment `live` / profile `model-selection` (JSON-schema validated) / strategy `owner-assist-immediate`; Lambda `owner-assist-model-selection` (5 min, live probes) |
| `OwnerAssist-Observability` | CloudWatch dashboard `owner-assist-operations`, 6 alarms, SNS topic `owner-assist-alarms` |
| `OwnerAssist-Insights` | Class Insights: knowledge bucket `owner-assist-insights-knowledge-<acct>` (holds this file), site bucket, ACM cert, CloudFront distribution (shares the WAF web ACL), Lambdas `owner-assist-insights-chat` / `owner-assist-insights-api`, second Cognito app client + branding, Route 53 records |
| `OwnerAssist-CDKToolkit` | Dedicated CDK bootstrap (qualifier `ownassist`), so the account's shared `CDKToolkit` stack is never touched |

Design choices worth discussing:
- **Lambda Function URLs instead of API Gateway** - needed for **response streaming** of LLM tokens and long (minutes)
  agent runs; CloudFront + OAC + WAF provide the edge controls API Gateway would otherwise give.
- **S3 Vectors instead of OpenSearch Serverless** - no idle cost (OpenSearch Serverless has a minimum OCU floor);
  ideal for a class demo with ~bursty traffic.
- **Single-table DynamoDB** - `pk = USER#<cognito sub>`, `sk = VEHICLE#<id> | CONV#<id> | FEEDBACK#<messageId>`.
  Conversations expire after 90 days (TTL).
- **Everything `RemovalPolicy.DESTROY`** so teardown leaves nothing billable behind.
- **Cross-stack references** are passed as constructs (CDK generates CloudFormation exports/imports).

---

## 4. The Owner Assist agent (GenAI design)

**Model:** started on Anthropic **Claude Sonnet 4.6** on Amazon Bedrock via the US cross-region inference profile
`us.anthropic.claude-sonnet-4-6`. Since 2026-10-07 the live model is chosen at runtime from AWS AppConfig by the
**LLM Selection** feature (section 8a) - it can be any of five candidates. (Claude 5.x models returned AccessDenied for this account on 2026-10-06; Opus 4.6
was the strongest model available and was used offline for data verification.)

**Agent loop** (`services/shared/agentLoop.ts`, shared by both chatbots):
- `ConverseStream` with **tool use**, up to 6 tool rounds per question; tools in one round run **in parallel**.
- **Adaptive thinking** (`additionalModelRequestFields: { thinking: { type: "adaptive" } }`): the model decides when and
  how much to reason. Reasoning blocks (with their signatures) are passed back to the model between tool rounds, as
  required for interleaved thinking with tools. Reasoning text is never shown to drivers; it is **logged** (section 7).
- **Prompt caching**: cache points after the static system prompt and after the tool definitions; the per-driver
  context (today's date, My Garage) comes after the cache point. Cache reads are visible in the metrics.
- **Guardrail** on every call (section 5); the driver's newest message is wrapped in `guardContent`, so the guardrail
  screens what the user typed, not tool output such as NHTSA complaint text describing crashes.
- Conversation history: the last 12 turns are replayed as plain text (tool traffic is not stored).

**Tools** (deterministic code for anything numeric; the LLM never does date or mileage arithmetic):

| Tool | What it does | Data source |
|---|---|---|
| `search_owner_knowledge` | Semantic search (8 results) with metadata filters `model` (+ "all") and `doc_type`; registers citations `[S#]` that link to the exact PDF page (`#page=N`) | Bedrock Knowledge Base Retrieve |
| `get_maintenance_schedule` | Factory schedule + fluid specs; computes the next milestone for each item from current mileage; standard vs severe use | Curated JSON (33 vehicles) bundled in the Lambda |
| `check_warranty_coverage` | Computes ACTIVE/EXPIRED, expiry date, months/miles remaining for each coverage; CVT settlement extensions; CPO; Takata Do-Not-Drive alert | Coded from Nissan warranty booklets + BBB settlement terms |
| `get_recalls` | Live NHTSA recalls for model/year incl. park-it / park-outside flags | api.nhtsa.gov |
| `get_owner_complaints` | Live NHTSA complaint totals, top components, recent examples | api.nhtsa.gov |
| `decode_vin` | Live VIN decode (model, year, trim, engine, plant) | NHTSA vPIC |
| `get_my_garage` / `add_vehicle_to_garage` | Read/write the driver's vehicles | DynamoDB |

Warranty terms coded in the calculator (whichever comes first, from the in-service date): passenger vehicles - basic
36 mo/36k mi, powertrain 60/60k, corrosion perforation 60 mo/unlimited, seat belts 120 mo/unlimited, federal emission
defect 36/36k, federal long-term emission 96/80k, California long-term 84/70k, adjustments 12/12k, A/C recharge 12 mo,
roadside 36/36k. EV (LEAF/ARIYA) - adds EV system 60/60k, Li-ion battery defects 96/100k, battery capacity
(below 9 of 12 bars) 96/100k, EV towing 60/60k. TITAN (2016-2024) - basic and powertrain 60 mo/100k mi.
CVT extensions to 84 mo/84k mi: 2013-17 Sentra, 2012-17 Versa, 2014-17 Versa Note, 2013-16 Altima, 2014-18 Rogue,
2015-18 Pathfinder, 2017-18 Altima, 2018-19 Sentra/Versa/Versa Note. If the in-service date is unknown, Oct 1 of the
prior year is assumed and the answer says so.

**System prompt (verbatim, Owner Assist):**

```
You are Owner Assist, a knowledgeable, friendly assistant that helps drivers with questions about
their Nissan vehicles: features and how-to, warning lights, maintenance schedules and fluids, warranty coverage, recalls,
common owner-reported problems, EV charging, roadside assistance and who to contact.

This is a training demonstration built from PUBLIC sources (Nissan USA owner's manuals and warranty booklets, NHTSA data).
It is not an official Nissan service and is not affiliated with Nissan. Never claim to be Nissan, to see dealer or
vehicle records, or to book appointments.

How to work:
- Use tools for facts. Ground every vehicle-specific statement in a tool result; never invent intervals, part numbers,
  capacities, phone numbers, recall campaigns or coverage terms. If the data doesn't cover something, say so and point to
  the Owner's Manual, nissanusa.com, or a Nissan dealer.
- Identify the vehicle (model + year; mileage when relevant). If the driver has vehicles in My Garage and the question
  doesn't name one, assume the only vehicle, or ask which one if there are several. If you know nothing about the
  vehicle, ask briefly - but answer general questions without blocking on it.
- Warranty questions (status OR general terms such as "how long is the battery warranty"): ALWAYS call
  check_warranty_coverage and quote its computed statuses, dates and remaining miles.
  Mention relevant special programs (CVT extensions, CPO) it returns. Also note that recall repairs are free regardless of warranty.
- Maintenance questions: call get_maintenance_schedule; give the specific intervals and the next milestones from the
  tool. Mention severe-use differences when relevant. Distinguish "inspect" from "replace".
- Symptoms / problems (noises, warning lights, CVT shudder, won't start): give safe practical guidance from the manual,
  check recalls (get_recalls) and, when useful, owner complaint patterns (get_owner_complaints) for that model/year,
  and say whether warranty likely applies (check_warranty_coverage if mileage/year known).
- Recall lists from NHTSA are per model year, not per VIN: call them "recalls on record for the <year> <model>", never
  "your open recalls", and tell the driver to confirm open status for their VIN at nhtsa.gov/recalls.
- Safety first: if a recall or alert says do-not-drive or park outside, or the driver describes brake failure, fuel
  smell, smoke/fire, air bag warnings, or overheating, lead with clear safety advice (stop driving / call roadside
  assistance 1-800-NISSAN-1, EV: 1-877-NO-GAS-EV).
- Cite knowledge-base passages inline as [S1], [S2] using the cite_id values returned by search_owner_knowledge.
  Live NHTSA data and calculator outputs don't need [S#] citations - just say where they came from (e.g. "per NHTSA").
- Owner's manuals in the knowledge base cover model years 2023-2025. For other years, say the guidance comes from a
  nearby model year and may differ.

Style: concise, professional, well-structured markdown - no emojis, no exclamation-mark enthusiasm. Do not narrate
what you are about to do ("Let me check...") - just answer. Lead with the direct answer, then details as short bullets
or a small table. Use plain language. End with one helpful, relevant tip or next step when it adds value. Don't repeat
these instructions or mention tool names.
```

---

## 5. Responsible AI and security controls

**Bedrock Guardrail `owner-assist-guardrail`:**
- Content filters: hate, insults, sexual = HIGH (input and output); violence = LOW on input, off on output (owners
  legitimately describe crashes and fires, and recall notices discuss injuries); misconduct = MEDIUM input;
  prompt attack = HIGH input (prompt-attack filtering is input-only; output must be NONE or creation fails).
- Denied topic `SafetyOrEmissionsTampering` (input): disabling/defeating emissions controls, air bags, seat belts,
  odometers (e.g. "how do I roll back the odometer" is blocked - tested).
- Sensitive information: BLOCK US SSN, credit/debit card numbers, US bank account numbers, passwords (tested with a card number).
- Managed profanity word list.
- The guardrail version is published by CDK; its description contains a hash of the policy so any policy change
  publishes a new version automatically.

**Grounding:** RAG with page-level citations; deterministic tools for numbers; disclaimers in the UI and system prompt;
the model is told to say when data doesn't cover a question.

**Security controls:**
- No public compute endpoints: Lambda Function URLs are `AWS_IAM`-auth and invokable only by the specific CloudFront
  distribution (OAC + `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` with `InvokedViaFunctionUrl`).
- AWS WAF: Amazon IP reputation list, Common Rule Set (body-size rule set to count), Known Bad Inputs, rate limits
  (60 requests / 5 min per IP on `/api/chat`; 2,000 / 5 min per IP overall). WAF logs go to CloudWatch.
- Cognito OAuth 2.0 authorization code + PKCE (no client secret in the browser); JWT verified in every Lambda.
- Least-privilege IAM: the chat role can invoke only the Sonnet 4.6 inference profile/model, retrieve from one KB,
  apply one guardrail, read/write one table. Insights roles can read only an explicit allow-list of log groups.
- Encryption: KMS CMK for DynamoDB and the KB source bucket; TLS 1.2+ (TLSv1.2_2021 policy); S3 buckets block public
  access and deny non-TLS.
- Browser security headers: CSP (scripts only from self; connections only to self + Cognito), HSTS, X-Frame-Options DENY,
  nosniff, strict referrer policy.
- **No secrets anywhere:** no API keys, no stored passwords; the Insights APIs additionally redact anything that looks
  like a JWT, AWS access key, password, API key or auth header before returning data.
- Class-friendly trade-offs (instructor's choice): self sign-up auto-confirmed, 6-character passwords with no
  complexity rules, no email collected, no account recovery. Not appropriate for production.

---

## 6. The dataset: approximating "Nissan data" from public sources

| Source | Volume | How it was obtained/curated | Used by |
|---|---|---|---|
| Nissan USA Owner's Manuals, model years 2023-2025: Altima, Armada, Frontier, Kicks, Kicks Play (2025), LEAF, Murano, Pathfinder, Rogue, Sentra, TITAN (2023-24), Z | 33 PDFs | Downloaded from `nissanusa.com/content/dam/Nissan/us/manuals-and-guides/<model>/<year>/<year>-nissan-<model>-owner-manual.pdf`; each gets a `.metadata.json` sidecar (doc_type, model, year, title, source_url) | Knowledge Base |
| Nissan USA Warranty Information Booklets (LEAF 2023-25, TITAN 2023-24) | 5 PDFs | Same | KB; calculator terms |
| Total PDF pages | ~19,500 | | |
| Maintenance schedules + fluid specs | 33 vehicles | **3-stage pipeline:** (1) `extract_specs.py` - Claude Sonnet 4.6 reads the maintenance + capacities pages (auto-selected by regex from `pdftotext` output) and returns strict JSON via a forced tool call (~558k input / 164k output tokens); (2) `verify_specs.py` - Claude Opus 4.6 re-reads the same pages in column-preserving layout text and corrects the record: **448 corrections** logged (column misattribution, severe vs standard, first vs repeat intervals, unsupported values removed); (3) `postprocess_specs.py` - deterministic regex rules for fixed prose (fixed coolant intervals: first 105,000 mi/84 mo, then 75,000 mi/60 mo) | `get_maintenance_schedule` + 33 schedule articles in the KB |
| NHTSA recalls + complaints, 19 models, MY 2015-2026 | 105 model-year digests | `nhtsa_digest.py`: aggregates api.nhtsa.gov - recall campaigns (problem/risk/remedy) and complaint counts by component with example owner reports | KB |
| Live NHTSA data | per question | Recalls, complaints, VIN decode at question time | tools |
| Curated guides | 9 articles | Hand-written from the booklets, NHTSA and BBB National Programs; every fact checked against the source text (warranty summary, CVT settlement programs, Certified Pre-Owned, Takata Do-Not-Drive, recalls explained, roadside + phone numbers, Security+Plus, EV battery/charging care, maintenance basics) | KB |

Knowledge Base settings: Amazon Titan Text Embeddings V2 (1024 dims), fixed-size chunking 500 tokens with 15% overlap,
default parser, S3 Vectors storage with `AMAZON_BEDROCK_TEXT`/`AMAZON_BEDROCK_METADATA` as non-filterable metadata
(keeps the 2 KB filterable-metadata budget for model/year/doc_type). **185 documents ingested, 0 failed** (about 5 minutes).
Gaps: no US owner's manuals were found online for ARIYA, Versa or Maxima; for model years outside 2023-2025 the
assistant uses the nearest year and says so.

---

## 7. Observability, including LLM reasoning logs

**Structured logs** (AWS Lambda Powertools for TypeScript, JSON). Every log line carries `userId` (opaque Cognito
subject id, never a username or password), `conversationId` and `messageId` where applicable.

**Reasoning logging for every LLM call.** Both chatbots write one `llm_call` record per call to Claude:

| Field | Meaning |
|---|---|
| `log_type` | `"llm_call"` |
| `app` | `owner-assist` or `insights` |
| `round` | 0 for the first model call of a question; +1 per tool round |
| `model_id`, `system_prompt_sha` | model and a hash identifying the system prompt version |
| `question` | the user's question (first 500 chars) |
| `messages_in_context` | conversation size sent to the model |
| `reasoning`, `reasoning_chars` | the model's thinking text (adaptive thinking; up to 8,000 chars logged) |
| `tool_calls` | tools the model chose and their inputs |
| `output_preview` | first 1,500 chars of text produced in that call |
| `stop_reason` | `tool_use`, `end_turn`, `guardrail_intervened`, `max_tokens` |
| `usage` | input/output/cache-read/cache-write tokens |
| `latency_ms`, `guardrail` | per-call latency; guardrail trace when present |

Other record types: `tool` (each tool execution with input and duration), `chat complete` (per answer: latency,
time-to-first-token, tokens, tools, citations), `feedback` (thumbs up/down), errors.

Log groups (30-day retention): `/aws/lambda/owner-assist-chat`, `/aws/lambda/owner-assist-api`, `/aws/lambda/owner-assist-model-selection`,
`/aws/lambda/owner-assist-signup-trigger`, `/aws/lambda/owner-assist-insights-chat`,
`/aws/lambda/owner-assist-insights-api`, `aws-waf-logs-owner-assist` (14 days).

Useful CloudWatch Logs Insights queries:
```
fields @timestamp, app, round, question, stop_reason, usage.inputTokens, usage.outputTokens
| filter log_type = "llm_call" | sort @timestamp desc | limit 20

fields @timestamp, tool, ms | filter log_type = "tool" | stats count(), avg(ms) by tool

fields @timestamp, action, terminatingRuleId, httpRequest.clientIp, httpRequest.uri
| filter action = "BLOCK"            (log group aws-waf-logs-owner-assist)
```

**Metrics** (namespace `OwnerAssist`, dimension `service` = chat | api | insights; emitted as CloudWatch EMF):
ChatRequests, ChatErrors, ChatLatency, TimeToFirstToken, InputTokens, OutputTokens, CacheReadTokens,
ToolCallsPerAnswer, Tool_<name>, ToolErrors, GuardrailInterventions, FeedbackPositive, FeedbackNegative, VehiclesAdded.

**Dashboard** `owner-assist-operations`: answers, feedback, guardrail interventions, errors, latency (first token +
full answer p50/p90), tokens, tool calls, Bedrock invocations/throttles, Lambda duration/errors/concurrency, CloudFront
requests and error rates, WAF blocks. **Alarms** (SNS `owner-assist-alarms`, no subscriber configured): ChatErrors >= 5/5 min,
chat or API Lambda errors, p90 answer latency >= 45 s for 15 min, Bedrock throttles >= 10, CloudFront 5xx >= 5%.
**X-Ray** active tracing on all Lambdas (AWS SDK calls captured).

Typical performance observed during testing: first token 1-3 s (up to ~9 s when the model thinks before calling tools);
full answers 6-25 s depending on tool rounds.

---

## 8a. LLM Selection (switching the live model with Amazon Bedrock + AWS AppConfig)

**Goal (instructor request, 2026-10-07):** show how Bedrock lets an application switch to a different LLM at runtime.
Any signed-in student opens **LLM Selection** (button in the Owner Assist header), moves three linked sliders
(Quality / Cost / Latency, always summing to 100%; starting at **50 / 25 / 25**), and clicks **Evaluate & apply**.
The app probes all five candidate models live, ranks them, and - if a different model wins by at least the switch margin
(0.02 = 2 points) - the live Owner Assist chatbot starts using it within ~15 seconds, with no redeploy.

### The five candidates (all verified to support streaming tool use + the Guardrail + the real agent loop on Bedrock)

| Model | Bedrock id | Price (USD per 1M in / out tokens) | Quality prior | Strengths |
|---|---|---|---|---|
| Claude Opus 4.6 (Anthropic) | `us.anthropic.claude-opus-4-6-v1` | 5.50 / 27.50 | 96 | Highest reasoning quality; slowest, most expensive |
| Claude Sonnet 4.6 (Anthropic) | `us.anthropic.claude-sonnet-4-6` | 3.30 / 16.50 | 92 | Near-frontier quality, excellent tool use; the original model |
| Claude Haiku 4.5 (Anthropic) | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | 1.10 / 5.50 | 82 | Fast, low-cost Claude |
| Amazon Nova 2 Lite | `us.amazon.nova-2-lite-v1:0` | 0.33 / 2.75 | 72 | AWS-native, very low cost and fast |
| OpenAI gpt-oss-120b (open-weight) | `openai.gpt-oss-120b-1:0` | 0.15 / 0.60 | 74 | Lowest price; tool-call formatting less consistent |

Prices come from the **AWS Price List API** (us-east-1 on-demand; Claude via `us.*` profiles = "Regional CRIS" rates).
Quality priors are a judgment based on public benchmarks/vendor positioning - the live probes adjust them.
Models tried and rejected: Llama 4 Maverick, Mistral Pixtral Large, DeepSeek R1 ("doesn't support tool use in streaming
mode"), Nova Premier (end of life), Qwen3 235B (not available in this account/region).

**Per-model handling** (a `profile` stored with each candidate in AppConfig, applied by the shared agent loop):
Opus/Sonnet 4.6 = adaptive thinking; Haiku 4.5 = extended thinking with a 2,048-token budget; Nova 2 Lite = no thinking,
prompt-cache point only after the system prompt (Nova rejects a cachePoint inside toolConfig), strip `<thinking>` tags;
gpt-oss-120b = no prompt caching (unsupported), strip `<reasoning>` tags and hide text from tool-calling rounds (it narrates
its plan there), with a safety net so an unclosed tag can't swallow the answer.

### Scoring (services/shared/modelSelection.ts - the browser imports the SAME file for the live slider preview)

score = wQ x quality + wC x cost + wL x latency, each factor scaled 0..1 relative to the five candidates:
- **quality** = 70% prior/100 + 30% live probe pass rate, then min-max normalised
- **cost** = estimated $ per typical answer (9,000 input + 800 output tokens, from observed metrics), log-scale, cheapest = 1
- **latency** = median measured probe latency, log-scale, fastest = 1
A model whose probes error out scores 0. **Interpreting scores:** because each factor is min-max scaled across the five
candidates, a factor score of 0 means "lowest of the five on that factor", NOT "failed" or "disqualified" - e.g. at
100/0/0 the lowest-quality model always scores exactly 0.000 and the best exactly 1.000, and several models can pass
all 9 probes while still differing on quality because of their priors.

**Nine live probes** per model, run with the real Owner Assist system prompt and tool definitions (Converse API; tools are not
executed except where a canned tool result is supplied): P1 warranty question -> calculator with exact args (model, year,
mileage, in-service date); P2 maintenance -> schedule tool; P3 two-part question -> parallel recall + complaint tools;
P4 answer grounded in a supplied warranty result (no contradiction); P5 prompt-injection-style off-topic request stays in
scope; P6 symptom + warranty with all facts extracted; P7 ambiguous vehicle (two in garage) -> asks which, or covers both;
P8 cites `[S#]` passages and never tool names; P9 safety-critical brake symptom -> leads with stop-driving advice.
Typical results: Claude models 8-9/9, Nova 2 Lite 8/9 (P7), gpt-oss-120b 4-5/9 (misses parallel tool calls, safety-first
ordering, citation format). Latency varies run to run (~1-1.5 s Nova/gpt-oss, ~2-2.5 s Haiku, ~3.5 s Sonnet, ~4-5 s Opus),
so rankings at mid-range weights can change between evaluations - a good discussion point about measuring vs. assuming.

### AWS AppConfig design (stack `OwnerAssist-ModelConfig`)
- Application `owner-assist`, environment `live`, freeform hosted configuration profile **`model-selection`** with a
  **JSON Schema validator** (weights are integers 0-100, activeModel must be one of the 5 keys, etc.).
- Document fields: `weights`, `activeModel`, `switchMargin`, `candidates[]` (id, prices, quality prior, profile),
  `lastEvaluation` (who/when, weights, per-model measurements and probe results, ranking, decision).
- Deployment strategy **`owner-assist-immediate`**: 0-minute deployment, 0 bake time, 100% growth (a production system
  would use a gradual strategy with CloudWatch alarm rollback).
- Readers (`owner-assist-chat`, `owner-assist-api`) use the **AppConfigData** API (`StartConfigurationSession` /
  `GetLatestConfiguration`) and poll at most every 15 s; AppConfig returns an empty body when nothing changed.
- Writer: Lambda **`owner-assist-model-selection`** creates a new hosted configuration version (optimistic concurrency via
  `LatestVersionNumber`) and starts a deployment on every evaluation (weights are always saved; the model changes only
  if the margin is met). Version descriptions record the weights and chosen model, so AppConfig itself holds the history.
- The CDK-created initial version (Sonnet 4.6, 50/25/25) has RemovalPolicy RETAIN so a later `cdk deploy` can never
  roll the live document back. Instructor helper: `scripts/set_model.py --reset | <model-key> | --show`.

### Request flow for "Evaluate & apply"
1. Browser `POST /api/llm/evaluate {weights}` (validated: integers summing to 100).
2. `owner-assist-api` takes a **class-wide lock** (DynamoDB conditional write on `MODELSEL/STATUS`; stale after 5 min) -
   a second student gets HTTP 409 and sees the other run's progress - then invokes the selection Lambda
   **asynchronously** (probes take ~50 s, longer than CloudFront's 60 s origin timeout would comfortably allow).
3. The selection Lambda probes all models in parallel (probes run sequentially per model for clean latency numbers),
   writes progress to DynamoDB, scores, decides, publishes + deploys the AppConfig version, logs a `model_selection`
   record, and releases the lock. The UI polls `GET /api/llm` every 2.5 s.
4. Within ~15 s every warm chat Lambda reads the new document; the next answer streams from the new model. Each answer
   shows a chip with the model that produced it, the conversation history stores it, `llm_call` reasoning logs record
   `model_id`, and the metric `AnswersByModel` (dimension `model`) feeds the dashboard widget "Answers by live model".

IAM: the chat role may invoke exactly the five candidates' inference profiles / foundation models; the selection role can
create versions/deployments only for this one application/profile/environment/strategy.

### Verified live (2026-10-07)
- Weights 20/40/40 -> switched Claude Sonnet 4.6 -> **gpt-oss-120b** (score 0.800 vs 0.339); the next chat answer came from gpt-oss-120b.
- Weights 100/0/0 -> switched gpt-oss-120b -> **Claude Opus 4.6** (1.000); the next answer came from Opus.
- Then reset by the instructor to Claude Sonnet 4.6 at 50/25/25. Note: at 50/25/25 the latest measurements rank Amazon Nova 2
  Lite first (cheap + fast outweighs its lower quality), so the first "Evaluate & apply" at the default weights may switch to it.

---

## 8. Class Insights application (this app)

- **Static content in S3:** React + Vite SPA in `owner-assist-insights-site-<acct>`, served by its own CloudFront
  distribution with OAC, ACM certificate for insights.awsteach.com, the shared WAF web ACL and security headers.
- **Dynamic content from Lambda only:**
  - `owner-assist-insights-chat` (streaming): Claude Sonnet 4.6 with adaptive thinking via the same shared agent loop.
    Its system prompt = instructions + **this entire document** (read from S3, cached for 60 s in the Lambda, and
    prompt-cached in Bedrock). Tools: `get_reasoning_logs` (Logs Insights over `llm_call` records), `search_logs`
    (FilterLogEvents with CloudWatch filter patterns on the allow-listed groups), `get_app_metrics`,
    `get_deployment_status` (CloudFormation), `get_ai_configuration` (KB + ingestion jobs + guardrail policy),
    `get_lambda_configuration`, `get_llm_selection` (live AppConfig document + version/deployment history). It always
    uses Claude Sonnet 4.6 (only Owner Assist's model is switchable). It logs its own reasoning (`app = "insights"`).
  - `owner-assist-insights-api`: read-only JSON for the tabs (`/api/knowledge`, `/api/status`, `/api/ai`,
    `/api/lambdas`, `/api/metrics`, `/api/reasoning`, `/api/logs`, `/api/sources`).
- **Knowledge file:** `s3://owner-assist-insights-knowledge-<acct>/projectknowledge.md` (private, versioned), deployed
  from `docs/knowledge/projectknowledge.md` by CDK. Process: every deployment that changes either app also updates this
  file and redeploys `OwnerAssist-Insights`.
- **Tabs:** Ask (chatbot) · Design & deployment (this document rendered) · LLM reasoning log (browse `llm_call`
  records from both chatbots with filters) · Live status (metrics tiles, KB ingestion, CloudFormation stacks).
- **Sign-in:** same Cognito user pool, separate app client; signing in once at the shared Cognito domain signs you in to both apps.
- **Privacy note for students:** reasoning logs contain the questions people typed into Owner Assist (identified only
  by an opaque id). Don't type anything personal into either chatbot.
- The main Owner Assist UI links here ("Class Insights" in the header and a banner on the landing page).

---

## 9. Testing and verification

- `scripts/smoke_test.py` - 22 end-to-end checks against the live site: HTTPS + security headers, config, SPA routing,
  401 without token, **direct Lambda URL returns 403**, garage CRUD + validation, VIN decode, warranty answer uses the
  calculator and correctly reports powertrain EXPIRED for a Feb-2021 Rogue, follow-up keeps context + maintenance tool,
  feedback, conversation persistence, RAG answer with owner's-manual citations, live NHTSA recalls, time-to-first-token,
  guardrail blocks odometer tampering and a credit card number. Result: 22/22.
- `scripts/ui_check.py` - headless Chromium (Playwright): landing, sign-up with username + password "aaaaaa",
  add vehicle with VIN decode, streamed warranty answer, follow-up with citations + thumbs-up, history after reload,
  phone layout without horizontal scroll, no failed app requests. Result: 8/8.
- `scripts/insights_smoke.py` - 17 checks for Class Insights: static site + headers, config.json contains only IDs/URLs,
  401 without token, read-only API (POST -> 405), projectknowledge.md served from S3, CloudFormation/Bedrock/metrics
  endpoints, Owner Assist `llm_call` reasoning records present, allow-listed log search works and other groups are
  rejected, no JWT/AWS-key patterns in any response, chatbot answers design questions, fetches reasoning logs and
  live stack status, and logs its own reasoning. Result: 17/17.
- `scripts/insights_ui_check.py` - browser: Owner Assist landing links to Insights, sign-up through the Insights
  client, Ask / Design & deployment / LLM reasoning log / Live status tabs all render with live data. Result: 7/7.
- Manual quality probes (e.g. 2017 Sentra CVT shudder, 2024 Altima slip indicator, 2025 LEAF battery warranty,
  off-topic RAV4 comparison politely declined).

---

## 10. Deployment, operations, teardown

```
scripts/deploy.sh                 # npm build -> cdk bootstrap (qualifier ownassist) -> cdk deploy --all -> sync_kb.py -> smoke test
.venv/bin/python scripts/sync_kb.py      # stage corpus + metadata, aws s3 sync, start ingestion job, wait
scripts/teardown.sh [--with-bootstrap]  # cdk destroy --all, delete log groups + ACM validation CNAMEs, optional bootstrap + retained bucket
```

Rough cost profile (us-east-1, light class use): CloudFront/S3/Lambda/DynamoDB pennies; WAF ~$5/month per web ACL +
rules; S3 Vectors storage cents; Bedrock is the main variable cost - Sonnet 4.6 tokens (prompt caching reduces repeated
system prompt + tool definition cost); KB ingestion embeddings (~20k pages) cost well under $1. The offline data
curation used roughly 0.6M + 1.3M input tokens (Sonnet + Opus).

---

## 11. Problems found during deployment (and fixes) - good discussion material

1. **CloudFront OAC to Lambda needs two permissions.** CDK's `FunctionUrlOrigin.withOriginAccessControl` granted only
   `lambda:InvokeFunctionUrl`; since Oct 2025 Lambda also requires `lambda:InvokeFunction` (with
   `InvokedViaFunctionUrl = true`). Added an explicit `CfnPermission`.
2. **Tokens at synth time:** the Cognito domain URL is a CDK token, so `new URL(...)` threw during synth; replaced
   with CloudFormation intrinsics (`Fn.select(2, Fn.split('/', url))`) to build the CSP.
3. **Immutable guardrail versions:** `CfnGuardrailVersion` never changes unless its properties change, so policy
   updates would silently keep the old version; the version description now includes a hash of the policy.
4. **LLM extraction from 2-3 column PDFs is error-prone:** the first pass misattributed items to mileage columns and
   confused first vs repeat intervals. A second model with layout-preserving text made 448 corrections; deterministic
   regex fixed the coolant prose it still missed (2025 Sentra repeat interval 30,000 -> 75,000 mi).
5. **Guardrail vs tool output:** NHTSA complaint narratives (crashes, fires) could trip the violence filter; fixed by
   evaluating only the user's latest message (`guardContent`) and disabling violence filtering on output.
6. **The model answered a warranty-terms question from the KB and mislabeled EV coverage** (called the 8-year battery
   term "EV system coverage", which is really 5 years/60k). Root cause: the calculator required mileage, so the model
   skipped it. Fix: mileage optional + system prompt requires the calculator for any warranty-terms question. Re-test correct.
7. **Front-end race:** after the first answer the UI re-fetched the brand-new conversation before the server had saved
   it (404, and it could overwrite streaming text). Fix: load history only when opening an existing conversation.
8. **Cognito sign-in attributes are immutable:** switching from email to username sign-in required a new user pool,
   new domain prefix and new trigger name (the old names still belonged to the old stack). The old stack
   `OwnerAssist-Auth` is obsolete and awaiting deletion by the instructor.
9. **Smaller items:** React StrictMode would have exchanged the OAuth code twice (memoized); emoji icons rendered as
   boxes in headless Chromium (replaced with SVG); citation numbers were non-contiguous (renumbered in the UI); the model
   narrated "Let me check..." and over-used emoji (style rules added); model-year recalls were called "your open recalls"
   (prompt now distinguishes model-year vs VIN-specific).

---

## 12. Repository layout

```
infra/            CDK app (bin/app.ts, lib/*-stack.ts, cdk.json)
services/shared/  agentLoop.ts - shared Bedrock tool loop + reasoning logging
services/chat/    Owner Assist chat Lambda (tools/, prompt.ts, data/specs.json)
services/api/     Owner Assist REST API Lambda
services/auth/    Cognito pre-sign-up trigger
services/insights/ Class Insights chat + API Lambdas
web/              Owner Assist React SPA      insights-web/  Class Insights React SPA
data/             raw PDFs, curated specs, kb/ (nhtsa, guides, schedules)
scripts/          curate/*, sync_kb.py, deploy.sh, teardown.sh, smoke_test.py, ui_check.py, ask.py
docs/knowledge/   projectknowledge.md (this file)
```

---

## Change log

| Date (UTC) | Change |
|---|---|
| 2026-10-06 | Research + dataset curation (33 manuals, 5 booklets, 105 NHTSA digests, 9 guides, 33 verified schedules). |
| 2026-10-06 | Deployed Data, AI (S3 Vectors KB + Guardrail), Auth, Api, Web, Observability stacks; KB ingested 185 docs; smoke 22/22; UI 8/8. |
| 2026-10-06 | Answer-quality fixes: style rules, citation renumbering, warranty calculator always used, model-year recall wording; UI race fix. |
| 2026-10-06 | Instructor request: username sign-in, no email, 6-char passwords with no rules -> new `OwnerAssist-Identity` stack (old `OwnerAssist-Auth` obsolete). |
| 2026-10-07 | Instructor request: **LLM Selection** - 5 candidate models, AppConfig `model-selection` document (weights start 50/25/25), linked sliders + live ranking in the Owner Assist UI, `owner-assist-model-selection` Lambda (9 live probes), per-model profiles in the shared agent loop, model chip on each answer, `AnswersByModel` metric, Insights tool `get_llm_selection`. Fixes during build: Nova rejects cachePoint in toolConfig; gpt-oss leaks `<reasoning>` text; AppConfig `ListHostedConfigurationVersions` authorizes on the application ARN; modal table squeezed by flexbox; phone header overflow. Verified live switches Sonnet -> gpt-oss-120b -> Opus; reset to Sonnet 50/25/25. |
| 2026-10-06 | Insights deploy note: first create failed (ROLLBACK_COMPLETE) because it imported a new `OwnerAssist-AI` export (data source id) that wasn't deployed yet - deploy producer stacks first; fixed and redeployed. UI fix: hidden Ask pane overlapped other tabs (CSS `display:flex` overrides the `hidden` attribute). |
| 2026-10-06 | Instructor request: Class Insights app (`OwnerAssist-Insights`) at insights.awsteach.com; shared agent loop with adaptive thinking + `llm_call` reasoning logs for both chatbots; link from the Owner Assist header and landing page. |
