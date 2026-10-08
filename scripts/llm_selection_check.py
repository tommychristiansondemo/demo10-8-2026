"""End-to-end LLM Selection test through the public site:
   evaluate with given weights -> wait -> check AppConfig switched -> ask a question -> confirm which model answered.
   .venv/bin/python scripts/llm_selection_check.py 20 40 40   [more weight triples ...]"""
import json, sys, time
sys.path.insert(0, "scripts")
from smoke_test import Client, login

c = Client("https://www.awsteach.com", login())
args = [int(x) for x in sys.argv[1:]] or [20, 40, 40]
for i in range(0, len(args), 3):
    w = dict(zip(["quality", "cost", "latency"], args[i:i + 3]))
    before = c.call("GET", "/api/llm").json()
    r = c.call("POST", "/api/llm/evaluate", {"weights": w})
    print(f"\n### weights {w}: POST -> {r.status_code} {r.text[:120]}  (live before: {before['activeModel']})")
    if r.status_code != 202:
        continue
    t0 = time.time()
    while True:
        time.sleep(4)
        s = c.call("GET", "/api/llm").json()
        if s["run"]["state"] != "running":
            break
        print(f"  {time.time()-t0:5.0f}s {s['run'].get('progress')}", flush=True)
    print(f"  done in {time.time()-t0:.0f}s: {s['lastEvaluation']['decision']}")
    for i2, rk in enumerate(s["ranking"], 1):
        m = s["measurements"][rk["key"]]
        print(f"   {i2}. {rk['label']:22} score {rk['score']:.3f}  q{rk['quality']:.2f} c{rk['cost']:.2f} l{rk['latency']:.2f}  probes {round(m['probePassRate']*len(m['probes']))}/{len(m['probes'])}  {m['medianLatencyMs']}ms")
    time.sleep(16)  # chat Lambda polls AppConfig every 15 s
    ans = c.chat("In one sentence: what does the slip indicator light mean on a 2024 Rogue?")
    print(f"  chat answered by: {ans['done'].get('model', {}).get('label')} (expected {next(x['label'] for x in s['candidates'] if x['key']==s['activeModel'])}) in {ans['secs']:.1f}s: {ans['text'][:150]!r}")
