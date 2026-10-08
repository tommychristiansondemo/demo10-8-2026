"""Headless browser walkthrough of the real UI: landing -> Cognito managed-login sign-up -> add vehicle -> chat.
   .venv/bin/python scripts/ui_check.py [--base https://www.awsteach.com] [--shots data/shots]
Creates a throwaway user uicheck<random> with password 'aaaaaa' (deleted at the end)."""
import argparse, pathlib, secrets, sys
import boto3
from playwright.sync_api import sync_playwright, expect

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="https://www.awsteach.com")
ap.add_argument("--shots", default="data/shots")
a = ap.parse_args()
shots = pathlib.Path(a.shots); shots.mkdir(parents=True, exist_ok=True)
username = f"uicheck{secrets.token_hex(3)}"
password = "aaaaaa"  # proves the relaxed policy: 6 chars, no classes required
ok = True


def step(name, fn):
    global ok
    try:
        fn(); print("PASS ", name, flush=True)
    except Exception as e:  # noqa: BLE001
        ok = False; print("FAIL ", name, "--", str(e).splitlines()[0][:300], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1366, "height": 900})
    errors = []
    page.on("response", lambda r: errors.append(f"{r.status} {r.request.method} {r.url}") if r.status >= 400 and r.url.startswith(a.base) else None)

    def landing():
        page.goto(a.base)
        expect(page.get_by_role("heading", name="Your Nissan questions, answered with sources.")).to_be_visible(timeout=20000)
        page.screenshot(path=str(shots / "1-landing.png"))
    step("landing page renders", landing)

    def signup():
        page.get_by_role("button", name="Create a free account").click()
        page.wait_for_url("**amazoncognito.com/**", timeout=20000)
        page.screenshot(path=str(shots / "2-managed-login.png"))
        page.get_by_placeholder("Enter username", exact=True).fill(username)
        page.get_by_placeholder("Enter password", exact=True).fill(password)
        page.get_by_placeholder("Reenter password", exact=True).fill(password)
        page.get_by_role("button", name="Sign up", exact=True).click()
        page.wait_for_url(f"{a.base}/**", timeout=30000)
        expect(page.get_by_text("How can I help with your Nissan?")).to_be_visible(timeout=20000)
        page.screenshot(path=str(shots / "3-signed-in.png"))
    step("self sign-up with username + 6-char password, no email (auto-confirmed)", signup)

    def add_vehicle():
        page.get_by_role("button", name="Add", exact=True).click()
        page.get_by_placeholder("17 characters, e.g. 5N1AT2MV...").fill("5N1AT2MV0LC712345")
        page.get_by_role("button", name="Decode").click()
        expect(page.get_by_text("Decoded by NHTSA")).to_be_visible(timeout=15000)
        page.get_by_placeholder("e.g. 42000").fill("48000")
        page.locator("input[type=date]").fill("2020-03-01")
        page.get_by_placeholder("e.g. Family SUV").fill("Daily driver")
        page.screenshot(path=str(shots / "4-add-vehicle.png"))
        page.get_by_role("button", name="Save vehicle").click()
        expect(page.get_by_text("Daily driver")).to_be_visible(timeout=10000)
    step("add vehicle with live VIN decode", add_vehicle)

    def chat():
        page.get_by_role("button", name="Is my 2020 Rogue still under warranty?").click()
        expect(page.locator(".msg.assistant .answer")).to_be_visible(timeout=30000)
        expect(page.locator(".msg-foot")).to_be_visible(timeout=90000)
        txt = page.locator(".msg.assistant .answer").inner_text()
        assert "Rogue" in txt and "xpired" in txt, txt[:200]
        page.screenshot(path=str(shots / "5-warranty-answer.png"), full_page=True)
    step("suggested question streams a warranty answer", chat)

    def rag():
        page.get_by_label("Your question").fill("How do I reset the tire pressure warning on my Rogue?")
        page.keyboard.press("Enter")
        expect(page.locator(".msg.assistant").nth(1).locator(".sources .source").first).to_be_visible(timeout=90000)
        page.locator(".msg.assistant").nth(1).locator(".msg-foot button[aria-label=Helpful]").click()
        page.screenshot(path=str(shots / "6-rag-citations.png"), full_page=True)
    step("follow-up answer shows manual citations; feedback click", rag)

    def history():
        page.reload()
        expect(page.locator(".history .conv").first).to_be_visible(timeout=20000)
        page.locator(".history .conv").first.click()
        expect(page.locator(".msg.assistant")).to_have_count(2, timeout=20000)
    step("conversation history persists across reload", history)

    def mobile():
        m = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
        m.goto(a.base)
        expect(m.get_by_role("button", name="Create a free account")).to_be_visible(timeout=20000)
        assert m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "horizontal overflow on phone"
        m.screenshot(path=str(shots / "7-mobile-landing.png"))
    step("phone layout without horizontal scroll", mobile)

    step("no console errors", lambda: (_ for _ in ()).throw(AssertionError("; ".join(errors[:3]))) if errors else None)
    b.close()

pool = {o["OutputKey"]: o["OutputValue"] for o in boto3.client("cloudformation", region_name="us-east-1").describe_stacks(StackName="OwnerAssist-Identity")["Stacks"][0]["Outputs"]}["UserPoolId"]
try:
    boto3.client("cognito-idp", region_name="us-east-1").admin_delete_user(UserPoolId=pool, Username=username)
except Exception:  # noqa: BLE001
    pass
print("ALL PASS" if ok else "SOME FAILED", "| screenshots in", shots)
sys.exit(0 if ok else 1)
