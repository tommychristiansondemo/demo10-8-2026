# Owner Assist: a GenAI owner portal for Nissan vehicles (AWS class demo)

**Live:** https://www.awsteach.com (also https://nissan.awsteach.com) · account 154833006816 · us-east-1

Drivers sign up, save their vehicles to **My Garage**, and ask questions about features, warning lights, maintenance,
warranty coverage, recalls, owner-reported problems and EV charging. Answers stream token by token, show which
tools/data sources were used, and cite the owner's manual page or guide they came from.

> Training demonstration built from **public** sources. Not affiliated with or endorsed by Nissan. The UI says so on every page.

## Architecture

```
Browser (React SPA)
  │  OAuth 2.0 code + PKCE ───────────────► Amazon Cognito Managed Login (username + password only, auto-confirm trigger)
  ▼
Route 53 ─► CloudFront (ACM TLS, AWS WAF, security headers, HTTP/3)
              ├─ /*         ─► S3 (private, OAC)                          React build + config.json
              ├─ /api/chat  ─► Lambda Function URL (IAM auth via OAC, RESPONSE_STREAM)  "chat" agent
              └─ /api/*     ─► Lambda Function URL (IAM auth via OAC)                    REST API
chat Lambda (Node 22, arm64, Powertools logs/metrics/traces)
  ├─ Amazon Bedrock ConverseStream: Claude Sonnet 4.6, tool use, prompt caching
  ├─ Bedrock Guardrail: content filters, prompt-attack, denied topic (tampering), PII blocking
  ├─ Bedrock Knowledge Base ─► Amazon S3 Vectors (Titan Text Embeddings v2, metadata filters)
  ├─ Deterministic tools: warranty calculator, maintenance schedule (curated JSON)
  ├─ Live public APIs: NHTSA recalls, NHTSA complaints, NHTSA vPIC VIN decoder
  └─ DynamoDB single table (KMS CMK, PITR): garage, conversations (TTL), feedback
CloudWatch dashboard "owner-assist-operations" + alarms ─► SNS · WAF logs · X-Ray
```

| Stack | Contents |
|---|---|
| `OwnerAssist-Data` | KMS CMK, DynamoDB `owner-assist-app`, KB source bucket |
| `OwnerAssist-AI` | S3 Vectors bucket/index, Bedrock Knowledge Base + data source, Guardrail + version |
| `OwnerAssist-Identity` | Cognito user pool (username sign-in, no email, 6-char password with no character rules), managed login (v2) domain, auto-confirm sign-up Lambda |
| `OwnerAssist-Api` | `owner-assist-chat` (streaming agent) and `owner-assist-api` Lambdas + Function URLs |
| `OwnerAssist-Web` | ACM cert, WAF web ACL (+logs), CloudFront, S3 site, Route 53 A/AAAA records |
| `OwnerAssist-Observability` | Dashboard, alarms, SNS topic |
| `OwnerAssist-Insights` | Class Insights app: S3 site + CloudFront (insights.awsteach.com), knowledge bucket with `projectknowledge.md`, chatbot + dashboard Lambdas, second Cognito app client |
| `OwnerAssist-CDKToolkit` | Dedicated CDK bootstrap (qualifier `ownassist`), so the shared `CDKToolkit` is never touched |

## The dataset (how we approximated "Nissan data" from public sources)

| Source | Volume | How it was curated | Where it's used |
|---|---|---|---|
| Nissan USA **Owner's Manuals** 2023-2025 (Altima, Armada, Frontier, Kicks, Kicks Play, LEAF, Murano, Pathfinder, Rogue, Sentra, TITAN, Z) | 33 PDFs, ~19,000 pages | Downloaded from nissanusa.com; metadata sidecars (model, year, source URL) | Knowledge Base (citations link to the exact PDF page) |
| Nissan USA **Warranty Information Booklets** (LEAF 2023-25, TITAN 2023-24) | 5 PDFs | Same | Knowledge Base; source for warranty calculator terms |
| **Maintenance schedules & fluid specs** | 33 vehicles | `scripts/curate/extract_specs.py`: Claude Sonnet 4.6 extracts JSON from the manual's maintenance chapter; `verify_specs.py`: Claude Opus 4.6 re-checks against column-preserving text (≈450 corrections logged in `data/curated/verification_report.md`); `postprocess_specs.py`: regex rules for fixed prose (coolant intervals) | `get_maintenance_schedule` tool + KB |
| **NHTSA recalls & complaints** 2015-2026, 19 models | 105 model-year digests | `scripts/curate/nhtsa_digest.py` aggregates api.nhtsa.gov | KB (history/patterns) |
| **Live NHTSA** recalls, complaints, VIN decode | n/a | Called at question time | `get_recalls`, `get_owner_complaints`, `decode_vin` |
| **Curated guides** (warranty summary, CVT settlement extensions, CPO, Takata Do-Not-Drive, recalls explained, roadside & phone numbers, Security+Plus, EV battery/charging, maintenance basics) | 9 articles | Hand-written from the booklets, NHTSA, BBB National Programs; each fact checked against source text | KB + warranty calculator |

Not covered (no public US manual found): ARIYA, Versa, Maxima. The assistant uses the nearest data and says so.

## Teaching map: enterprise features to point at

- **Security:** no public compute endpoints (Lambda URLs are IAM-only and reachable only through CloudFront OAC); WAF managed rules + per-IP rate limits (chat: 60 per 5 min); OAuth PKCE; JWT verification in every Lambda; least-privilege IAM (model ARNs, KB ARN, guardrail ARN); KMS CMK; TLS 1.2+; CSP/HSTS headers; Guardrails (input/output).
- **Responsible AI:** grounding + citations; deterministic tools for anything numeric (warranty dates, mileage math); disclaimers; denied topic for safety/emissions tampering; PII blocking; thumbs-up/down feedback loop.
- **Reliability & performance:** response streaming (first token in ~1-3 s), 10-second heartbeats under CloudFront's 60 s origin timeout, SDK retries, NHTSA timeouts + caching, graceful tool errors, prompt caching.
- **Observability:** Powertools structured logs (per user/conversation/message), EMF metrics (latency, time-to-first-token, tokens, tool calls, guardrail interventions, feedback), X-Ray, dashboard, alarms, WAF logs.
- **Data engineering for GenAI:** metadata-filtered retrieval, LLM extraction with a second-model verification pass and rule-based post-processing.
- **IaC/ops:** 6 CDK TypeScript stacks, one-command deploy (`scripts/deploy.sh`), smoke test, clean teardown.

## LLM Selection (button in the Owner Assist header)

Students move three linked sliders (Quality/Cost/Latency, always 100%, starting 50/25/25) and click **Evaluate & apply**.
The `owner-assist-model-selection` Lambda runs 9 live probes against 5 Bedrock models (Claude Opus 4.6, Sonnet 4.6,
Haiku 4.5, Amazon Nova 2 Lite, OpenAI gpt-oss-120b), ranks them and, if another model wins by at least 2 points, deploys a
new version of the AWS AppConfig `model-selection` document; the chat Lambda switches models within ~15 s. Each answer
shows which model produced it. Instructor helper: `.venv/bin/python scripts/set_model.py --reset | <model-key> | --show`;
end-to-end test: `scripts/llm_selection_check.py 20 40 40`. Teardown deletes runtime-created AppConfig versions first.

## Class Insights (https://insights.awsteach.com)

A separate app that explains how everything was built. Students sign in with their Owner Assist account. It has 4 tabs:
an **Ask** chatbot (Claude Sonnet 4.6 + `projectknowledge.md` + read-only tools over CloudWatch logs, Logs Insights,
metrics, CloudFormation, and the Bedrock KB, Guardrail and Lambda config), **Design & deployment** (the knowledge doc),
**LLM reasoning log** (the `llm_call` records that both chatbots write for every model call, including the model's thinking),
and **Live status**. The knowledge file lives at `docs/knowledge/projectknowledge.md` and is deployed to
`s3://owner-assist-insights-knowledge-<acct>/`. **Update it with every deployment** and redeploy `OwnerAssist-Insights`.

## Operate

```bash
scripts/deploy.sh                 # build + deploy all stacks + load KB + smoke test
scripts/deploy.sh --skip-kb       # code/infra only
.venv/bin/python scripts/sync_kb.py      # re-sync corpus and re-ingest
.venv/bin/python scripts/smoke_test.py   # end-to-end checks against the live site (22)
.venv/bin/python scripts/insights_smoke.py   # Class Insights checks (17); insights_ui_check.py / ui_check.py = browser tests
scripts/teardown.sh [--with-bootstrap]  # remove everything
```

Rebuild the dataset from scratch: `scripts/curate/nhtsa_digest.py`, `extract_specs.py`, `verify_specs.py`, `postprocess_specs.py` (needs PDFs in `data/raw`, text in `data/plain` via `pdftotext`).

## Demo script (suggested)

1. Landing page → **Create a free account**: just a username and a password of 6+ characters (no email, no complexity rules, no verification code).
2. Ask *"What does the slip indicator light mean on a 2024 Altima?"*: watch the KB search, then click a source chip to open the manual page.
3. Add a vehicle: VIN `5N1AT2MV0LC712345` → **Decode** (live NHTSA) → set mileage 48,000 and in-service date 2020-03-01.
4. *"Is my Rogue still under warranty?"*: warranty calculator, exact expiry dates, and CVT note.
5. *"When is my next service and what oil does it take?"*: maintenance tool.
6. *"Any recalls?"*: live NHTSA, including the 2025 VC-Turbo engine-bearing recall on 2021-2024 Rogues.
7. Guardrail: *"How do I roll back my odometer?"* is blocked.
8. CloudWatch dashboard `owner-assist-operations`, X-Ray trace of the chat Lambda, WAF logs.
