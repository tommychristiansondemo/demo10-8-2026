#!/usr/bin/env bash
# Removes everything this demo created. Add --with-bootstrap to also delete OwnerAssist-CDKToolkit and its
# retained (versioned) asset bucket. Never touches the shared CDKToolkit stack.
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION=us-east-1 CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ZONE=Z02882605B7GUS0L3VHX

empty_bucket() {  # delete all object versions + delete markers
  local b=$1
  aws s3api head-bucket --bucket "$b" 2>/dev/null || return 0
  python3 - "$b" <<'PY'
import sys, boto3
b = boto3.resource("s3").Bucket(sys.argv[1]); b.object_versions.delete(); b.objects.all().delete()
PY
}

echo "==> Deleting AppConfig hosted configuration versions (created at runtime by LLM Selection; they block profile deletion)"
python3 - <<'PY'
import boto3
ac = boto3.client("appconfig", region_name="us-east-1")
for app in [a for a in ac.list_applications()["Items"] if a["Name"] == "owner-assist"]:
    for prof in ac.list_configuration_profiles(ApplicationId=app["Id"])["Items"]:
        while True:
            items = ac.list_hosted_configuration_versions(ApplicationId=app["Id"], ConfigurationProfileId=prof["Id"])["Items"]
            if not items: break
            for v in items:
                ac.delete_hosted_configuration_version(ApplicationId=app["Id"], ConfigurationProfileId=prof["Id"], VersionNumber=v["VersionNumber"])
                print("deleted AppConfig version", v["VersionNumber"])
PY
echo "==> Destroying app stacks"
empty_bucket "owner-assist-kb-source-$CDK_DEFAULT_ACCOUNT"
(cd infra && for d in web insights-web; do mkdir -p ../$d/dist; [ -f ../$d/dist/index.html ] || echo "<html></html>" > ../$d/dist/index.html; done
 npx cdk destroy --all --force)

echo "==> Sweeping leftovers"
for lg in $(aws logs describe-log-groups --query "logGroups[?contains(logGroupName,'owner-assist')].logGroupName" --output text); do
  aws logs delete-log-group --log-group-name "$lg" && echo "deleted log group $lg"; done
# ACM DNS-validation CNAMEs are left behind by CloudFormation-managed certificates.
for host in www nissan insights; do
  aws route53 list-resource-record-sets --hosted-zone-id $ZONE --query "ResourceRecordSets[?Type=='CNAME' && ends_with(Name, '.$host.awsteach.com.') && starts_with(Name, '_')]" --output json |
  python3 -c "
import json,sys,subprocess
for r in json.load(sys.stdin):
    ch={'Changes':[{'Action':'DELETE','ResourceRecordSet':r}]}
    subprocess.run(['aws','route53','change-resource-record-sets','--hosted-zone-id','$ZONE','--change-batch',json.dumps(ch)],check=True,capture_output=True)
    print('deleted', r['Name'])"
done

if [[ "${1:-}" == "--with-bootstrap" ]]; then
  echo "==> Deleting OwnerAssist-CDKToolkit"
  B=$(aws cloudformation describe-stacks --stack-name OwnerAssist-CDKToolkit --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text 2>/dev/null || true)
  for repo in $(aws ecr describe-repositories --query "repositories[?contains(repositoryName,'ownassist')].repositoryName" --output text); do
    aws ecr delete-repository --repository-name "$repo" --force >/dev/null && echo "deleted ECR $repo"; done
  [ -n "$B" ] && empty_bucket "$B"
  aws cloudformation delete-stack --stack-name OwnerAssist-CDKToolkit
  aws cloudformation wait stack-delete-complete --stack-name OwnerAssist-CDKToolkit
  # The bootstrap template RETAINS its bucket - delete it explicitly.
  [ -n "$B" ] && { empty_bucket "$B"; aws s3api delete-bucket --bucket "$B" 2>/dev/null && echo "deleted bucket $B"; }
fi
echo "==> Done. Remaining owner-assist buckets:"; aws s3 ls | grep -E "owner-assist|ownassist" || echo "(none)"
