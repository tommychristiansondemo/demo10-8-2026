"""Headless walkthrough: Owner Assist landing shows the Class Insights link -> Insights sign-in (new username) -> all tabs."""
import secrets, sys
import boto3
from playwright.sync_api import sync_playwright, expect

user, pw, ok = f"insights{secrets.token_hex(3)}", "aaaaaa", True
def step(name, fn):
    global ok
    try: fn(); print("PASS ", name, flush=True)
    except Exception as e: ok = False; print("FAIL ", name, "--", str(e).splitlines()[0][:250], flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page(viewport={"width": 1366, "height": 900})
    bad = []
    page.on("response", lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 and "awsteach.com" in r.url else None)
    def link():
        page.goto("https://www.awsteach.com")
        expect(page.get_by_text("Students: see how this app was built →")).to_be_visible(timeout=20000)
        assert page.locator("a.insights-link").get_attribute("href") == "https://insights.awsteach.com"
        page.screenshot(path="data/shots/i1-owner-landing-link.png")
    step("Owner Assist landing links to Class Insights", link)
    def signin():
        page.goto("https://insights.awsteach.com")
        page.get_by_role("button", name="Create one").click()
        page.wait_for_url("**amazoncognito.com/**", timeout=20000)
        page.get_by_placeholder("Enter username", exact=True).fill(user)
        page.get_by_placeholder("Enter password", exact=True).fill(pw)
        page.get_by_placeholder("Reenter password", exact=True).fill(pw)
        page.get_by_role("button", name="Sign up", exact=True).click()
        expect(page.get_by_text("Ask anything about how Owner Assist was built")).to_be_visible(timeout=30000)
    step("sign up via Insights client and land on Ask tab", signin)
    def ask():
        page.get_by_role("button", name="Show me the reasoning from the last 3 questions students asked Owner Assist.").click()
        expect(page.locator(".msg.assistant .meta")).to_be_visible(timeout=120000)
        page.screenshot(path="data/shots/i2-ask.png", full_page=True)
    step("chatbot answers a reasoning-log question", ask)
    def docs():
        page.get_by_role("tab", name="Design & deployment").click()
        expect(page.get_by_role("heading", name="Project knowledge: Owner Assist + Class Insights")).to_be_visible(timeout=20000)
        page.screenshot(path="data/shots/i3-docs.png")
    step("design doc tab renders projectknowledge.md", docs)
    def reasoning():
        page.get_by_role("tab", name="LLM reasoning log").click()
        expect(page.locator(".call").first).to_be_visible(timeout=40000)
        expect(page.locator(".call-body pre").first).to_be_visible()
        page.screenshot(path="data/shots/i4-reasoning.png")
    step("reasoning log tab lists llm_call records", reasoning)
    def status():
        page.get_by_role("tab", name="Live status").click()
        expect(page.get_by_text("OwnerAssist-Insights")).to_be_visible(timeout=30000)
        page.screenshot(path="data/shots/i5-status.png", full_page=True)
    step("live status tab shows stacks + metrics", status)
    step("no failed requests to our domains", lambda: (_ for _ in ()).throw(AssertionError("; ".join(bad[:3]))) if bad else None)
    b.close()
pool = {o["OutputKey"]: o["OutputValue"] for o in boto3.client("cloudformation", region_name="us-east-1").describe_stacks(StackName="OwnerAssist-Identity")["Stacks"][0]["Outputs"]}["UserPoolId"]
boto3.client("cognito-idp", region_name="us-east-1").admin_delete_user(UserPoolId=pool, Username=user)
print("ALL PASS" if ok else "SOME FAILED"); sys.exit(0 if ok else 1)
