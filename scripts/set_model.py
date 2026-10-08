"""Instructor helper: set the live LLM directly via AppConfig (no evaluation).
   .venv/bin/python scripts/set_model.py --reset            # Claude Sonnet 4.6, weights 50/25/25 (keeps last measurements)
   .venv/bin/python scripts/set_model.py claude-haiku-4-5   # any candidate key
   .venv/bin/python scripts/set_model.py --show
"""
import json, sys, time
import boto3

REGION = "us-east-1"
cf = boto3.client("cloudformation", region_name=REGION)
ac = boto3.client("appconfig", region_name=REGION)
out = {o["OutputKey"]: o["OutputValue"] for o in cf.describe_stacks(StackName="OwnerAssist-ModelConfig")["Stacks"][0]["Outputs"]}
APP, ENV, PROFILE = out["AppConfigApplicationId"], out["AppConfigEnvironmentId"], out["AppConfigProfileId"]


def current():
    latest = ac.list_hosted_configuration_versions(ApplicationId=APP, ConfigurationProfileId=PROFILE, MaxResults=1)["Items"][0]["VersionNumber"]
    v = ac.get_hosted_configuration_version(ApplicationId=APP, ConfigurationProfileId=PROFILE, VersionNumber=latest)
    return latest, json.loads(v["Content"].read())


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "--show"
    latest, doc = current()
    if arg == "--show":
        print(f"version {latest}: active={doc['activeModel']} weights={doc['weights']}")
        if doc.get("lastEvaluation"):
            print("last evaluation:", doc["lastEvaluation"]["at"], doc["lastEvaluation"]["decision"])
        return
    keys = [c["key"] for c in doc["candidates"]]
    if arg == "--reset":
        doc["activeModel"], doc["weights"], note = "claude-sonnet-4-6", {"quality": 50, "cost": 25, "latency": 25}, "reset by instructor"
    elif arg in keys:
        doc["activeModel"], note = arg, f"set to {arg} by instructor"
    else:
        sys.exit(f"unknown model; choose one of {keys}")
    if doc.get("lastEvaluation"):  # keep measurements, but make clear the live model was changed afterwards
        doc["lastEvaluation"]["decision"] = doc["lastEvaluation"]["decision"].split(" | Later:")[0] + \
            f" | Later: {note} ({time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}): live model {doc['activeModel']}, weights {doc['weights']['quality']}/{doc['weights']['cost']}/{doc['weights']['latency']}."
    v = ac.create_hosted_configuration_version(ApplicationId=APP, ConfigurationProfileId=PROFILE, Content=json.dumps(doc).encode(),
                                               ContentType="application/json", Description=note, LatestVersionNumber=latest)
    strategy = next(s["Id"] for s in ac.list_deployment_strategies()["Items"] if s["Name"] == "owner-assist-immediate")
    d = ac.start_deployment(ApplicationId=APP, EnvironmentId=ENV, ConfigurationProfileId=PROFILE, ConfigurationVersion=str(v["VersionNumber"]),
                            DeploymentStrategyId=strategy, Description=note)
    while ac.get_deployment(ApplicationId=APP, EnvironmentId=ENV, DeploymentNumber=d["DeploymentNumber"])["State"] not in ("COMPLETE", "ROLLED_BACK"):
        time.sleep(1)
    print(f"version {v['VersionNumber']} deployed: active={doc['activeModel']} weights={doc['weights']} (live within ~15 s)")


if __name__ == "__main__":
    main()
