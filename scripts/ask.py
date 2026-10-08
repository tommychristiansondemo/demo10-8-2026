"""Ask the live assistant a question as the smoke-test user and print the streamed answer + tools/citations.
   python3 scripts/ask.py "question" ["follow-up" ...]"""
import sys
sys.path.insert(0, "scripts")
from smoke_test import Client, login

c = Client("https://www.awsteach.com", login())
conv = None
for q in sys.argv[1:]:
    r = c.chat(q, conv)
    conv = r["meta"].get("conversationId")
    print(f"\n### Q: {q}\n[{r['secs']:.1f}s, first token {r['done'].get('firstTokenMs')} ms, tools={[t['name'] for t in r['done'].get('tools', [])]}]")
    print(r["guardrail"] or r["text"] or r["error"])
    for x in r["done"].get("citations", []):
        print(f"  {x['id']}: {x['title']} -> {x.get('url')}")
