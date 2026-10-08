"""Smoke test for Class Insights (https://insights.awsteach.com): auth, every API route, redaction, chatbot + tools.
   .venv/bin/python scripts/insights_smoke.py"""
import hashlib, json, re, secrets, sys, time
import boto3, requests

BASE = "https://insights.awsteach.com"
REGION = "us-east-1"
ok_all = []


def check(name, ok, detail=""):
    ok = bool(ok)
    ok_all.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  -- ' + detail) if detail else ''}", flush=True)


def outputs(stack):
    cf = boto3.client("cloudformation", region_name=REGION)
    return {o["OutputKey"]: o["OutputValue"] for o in cf.describe_stacks(StackName=stack)["Stacks"][0].get("Outputs", [])}


pool = outputs("OwnerAssist-Identity")["UserPoolId"]
cfg = requests.get(f"{BASE}/config.json", timeout=30).json()
idp = boto3.client("cognito-idp", region_name=REGION)
pw = secrets.token_hex(4)
try:
    idp.admin_create_user(UserPoolId=pool, Username="smoketest", MessageAction="SUPPRESS")
except idp.exceptions.UsernameExistsException:
    pass
idp.admin_set_user_password(UserPoolId=pool, Username="smoketest", Password=pw, Permanent=True)
token = idp.admin_initiate_auth(UserPoolId=pool, ClientId=cfg["userPoolClientId"], AuthFlow="ADMIN_USER_PASSWORD_AUTH",
                                AuthParameters={"USERNAME": "smoketest", "PASSWORD": pw})["AuthenticationResult"]["AccessToken"]


def call(method, path, body=None, auth=True, stream=False):
    payload = json.dumps(body) if body is not None else ""
    h = {"x-amz-content-sha256": hashlib.sha256(payload.encode()).hexdigest()}
    if payload: h["content-type"] = "application/json"
    if auth: h["x-auth-token"] = token
    return requests.request(method, BASE + path, data=payload or None, headers=h, stream=stream, timeout=180)


r = requests.get(BASE + "/", timeout=30)
check("site served from S3 via CloudFront", r.ok and 'id="root"' in r.text)
check("security headers", "content-security-policy" in r.headers and "strict-transport-security" in r.headers)
check("config.json has no secrets (ids + URLs only)", set(cfg) <= {"region", "userPoolId", "userPoolClientId", "cognitoDomain", "ownerAssistUrl"}, str(sorted(cfg)))
check("API requires auth (401)", call("GET", "/api/status", auth=False).status_code == 401)
check("API is read-only (POST -> 405)", call("POST", "/api/status", {}).status_code == 405)
md = call("GET", "/api/knowledge")
check("projectknowledge.md served from S3", md.ok and "# Project knowledge" in md.text, f"{len(md.text)} chars")
st = call("GET", "/api/status").json()
check("CloudFormation status for all stacks", all(s["status"].endswith("COMPLETE") for s in st["stacks"] if s["status"] != "NOT_DEPLOYED") and len(st["stacks"]) >= 7,
      ", ".join(f"{s['stack']}={s['status']}" for s in st["stacks"]))
ai = call("GET", "/api/ai").json()
check("Bedrock KB + guardrail config", ai["knowledge_base"]["status"] == "ACTIVE" and ai["guardrail"]["denied_topics"], ai["knowledge_base"]["storage"]["type"])
check("metrics endpoint", call("GET", "/api/metrics?hours=24").ok)
rs = call("GET", "/api/reasoning?app=owner-assist&minutes=1440&limit=5").json()
check("reasoning logs (llm_call) from Owner Assist", rs["returned"] > 0 and any(c.get("reasoning") for c in rs["llm_calls"]), f"{rs['returned']} calls")
lg = call("GET", "/api/logs?source=owner-assist-chat&minutes=240&limit=10&filter=" + requests.utils.quote('{ $.log_type = "tool" }'))
check("raw log search on allow-listed group", lg.ok and lg.json()["returned"] > 0, f"{lg.json().get('returned')} events")
check("non-allow-listed log source rejected", "error" in call("GET", "/api/logs?source=/aws/lambda/something-else").json())
blob = json.dumps([st, ai, rs, lg.json()])
check("no JWTs / AWS keys in any response", not re.search(r"eyJ[\w-]{10,}\.[\w-]{10,}\.|AKIA[A-Z0-9]{16}", blob))


def chat(q):
    t0 = time.time()
    r = call("POST", "/api/chat", {"message": q, "history": []}, stream=True)
    ev = [json.loads(l) for l in r.iter_lines() if l.strip()]
    done = next((e for e in ev if e["type"] == "done"), {})
    return "".join(e.get("text", "") for e in ev if e["type"] == "delta"), [t["name"] for t in done.get("tools", [])], time.time() - t0


t, tools, s = chat("In two sentences: why are the Lambda function URLs not publicly reachable?")
check("chatbot answers design question from projectknowledge.md", "OAC" in t or "Origin Access" in t, f"{s:.1f}s")
t, tools, s = chat("Show the reasoning of the most recent Owner Assist LLM call - just the question, round and a one-line summary of the reasoning.")
check("chatbot fetches reasoning logs", "get_reasoning_logs" in tools, f"{s:.1f}s tools={tools}")
t, tools, s = chat("Is every CloudFormation stack healthy right now? One line per stack.")
check("chatbot reads live stack status", "get_deployment_status" in tools, f"{s:.1f}s")
time.sleep(8)
rs = call("GET", "/api/reasoning?app=insights&minutes=30&limit=5").json()
check("Insights chatbot logs its own reasoning", rs["returned"] > 0, f"{rs['returned']} insights llm_calls")
print(f"\n{sum(ok_all)}/{len(ok_all)} checks passed")
sys.exit(0 if all(ok_all) else 1)
