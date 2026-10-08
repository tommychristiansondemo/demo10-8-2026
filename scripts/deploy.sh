#!/usr/bin/env bash
# One-command deploy: build web, deploy all stacks, load the knowledge base, run the smoke test.
#   scripts/deploy.sh            full deploy
#   scripts/deploy.sh --skip-kb  infrastructure/code only
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION=us-east-1 CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

[ -d node_modules ] || npm install --no-audit --no-fund
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -q boto3 requests; }

echo "==> Building web apps"; npm run build -w web; npm run build -w insights-web
echo "==> Bootstrapping (idempotent, own qualifier)"
(cd infra && npx cdk bootstrap "aws://$CDK_DEFAULT_ACCOUNT/us-east-1" --qualifier ownassist --toolkit-stack-name OwnerAssist-CDKToolkit >/dev/null)
echo "==> Deploying stacks"
(cd infra && npx cdk deploy --all --require-approval never --concurrency 3 --outputs-file ../cdk-outputs.json)

if [[ "${1:-}" != "--skip-kb" ]]; then
  echo "==> Loading knowledge base (owner manuals, warranty booklets, NHTSA digests, guides, schedules)"
  .venv/bin/python scripts/sync_kb.py
fi
echo "==> Smoke tests"; .venv/bin/python scripts/smoke_test.py; .venv/bin/python scripts/insights_smoke.py
