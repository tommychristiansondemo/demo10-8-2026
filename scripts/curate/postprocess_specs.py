"""Deterministic cross-checks + publishing for the extracted specs.

1. Rule-based corrections where the manual states a fact in fixed prose (regex beats LLM here), e.g. the engine
   coolant note "First replacement interval is 105,000 miles ... or 84 months. After first replacement, replace every
   75,000 miles ... or 60 months."
2. Writes services/chat/src/data/specs.json (bundled into the chat Lambda for the maintenance tool).
3. Writes data/kb/schedules/<year>-<model>-maintenance-schedule.md (+ metadata) so the knowledge base can answer too.
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPECS, PLAIN = ROOT / "data/curated/specs", ROOT / "data/plain"
BUNDLE = ROOT / "services/chat/src/data/specs.json"
KB = ROOT / "data/kb/schedules"

COOLANT = re.compile(r"First\s+replacement\s+interval\s+is\s+([\d,]+) miles.{0,40}?or (\d+) months\.\s*After first replacement,\s*replace every\s+([\d,]+) miles.{0,40}?or (\d+) months", re.S)
num = lambda s: int(s.replace(",", ""))


def fix(d, text, log):
    m = COOLANT.search(re.sub(r"repla-\s*cement", "replacement", text))
    if m:
        f_mi, f_mo, r_mi, r_mo = num(m[1]), int(m[2]), num(m[3]), int(m[4])
        for it in d["maintenance_items"]:
            if "coolant" in it["item"].lower() and "intercooler" not in it["item"].lower() and it["action"] == "replace":
                new = dict(first_at_miles=f_mi, first_at_months=f_mo, interval_miles=r_mi, interval_months=r_mo)
                if any(it.get(k) != v for k, v in new.items()):
                    log.append(f"{d['year']} {d['model']}: coolant {it.get('first_at_miles')}/{it.get('interval_miles')} -> {f_mi}/{r_mi} (manual text)")
                    it.update(new)


def md(d):
    L = [f"# {d['year']} Nissan {d['model']} maintenance schedule and fluid specifications", "",
         f"Source: {d['source_document']} ({d['source_url']}), chapter 'Maintenance and schedules' and 'Capacities and "
         "recommended fluids/lubricants'. Machine-extracted and independently re-verified; the Owner's Manual is authoritative.", ""]
    L += ["## Powertrains", ""] + [f"- {p['engine_code']}: {p['description']}" for p in d["powertrains"]] + [""]
    if d.get("oil_life_monitor"):
        L += ["## Oil change reminder", "", d["oil_life_monitor"], ""]
    L += [f"## {d['year']} {d['model']} scheduled maintenance items", "",
          "| Item | Action | Schedule | Interval | First service | Applies to | Notes |", "|---|---|---|---|---|---|---|"]
    for i in d["maintenance_items"]:
        iv = " / ".join(x for x in [f"{i['interval_miles']:,} mi" if i.get("interval_miles") else "", f"{i['interval_months']} mo" if i.get("interval_months") else ""] if x) or "-"
        first = f"{i['first_at_miles']:,} mi" if i.get("first_at_miles") else "-"
        L.append(f"| {i['item']} | {i['action']} | {i['schedule']} | {iv} | {first} | {i.get('applies_to','all')} | {(i.get('notes') or '').replace('|','/')[:220]} |")
    L += ["", f"## {d['year']} {d['model']} fluids and capacities", "", "| Fluid | Specification | Capacity | Applies to |", "|---|---|---|---|"]
    for f in d["fluids"]:
        L.append(f"| {f['fluid']} | {f['specification'].replace('|','/')} | {f.get('capacity','-')} | {f.get('applies_to','all')} |")
    if d.get("severe_conditions"):
        L += ["", "## Severe driving conditions", ""] + [f"- {c}" for c in d["severe_conditions"]]
    return "\n".join(L) + "\n"


def main():
    log, bundle = [], []
    KB.mkdir(parents=True, exist_ok=True)
    BUNDLE.parent.mkdir(parents=True, exist_ok=True)
    for f in sorted(SPECS.glob("*.json")):
        d = json.loads(f.read_text())
        stem = f"{d['year']}-nissan-{f.stem.split('-', 1)[1]}-owner-manual"
        fix(d, (PLAIN / f"{stem}.txt").read_text(errors="ignore"), log)
        f.write_text(json.dumps(d, indent=2))
        keep = ["model", "year", "powertrains", "oil_life_monitor", "severe_conditions", "maintenance_items", "fluids",
                "source_url", "source_document"]
        bundle.append({k: d.get(k) for k in keep})
        name = f"{d['year']}-{f.stem.split('-', 1)[1]}-maintenance-schedule.md"
        (KB / name).write_text(md(d))
        (KB / f"{name}.metadata.json").write_text(json.dumps({"metadataAttributes": {
            "doc_type": "maintenance_schedule", "model": f.stem.split("-", 1)[1].replace("-", " "), "year": d["year"],
            "source_url": d["source_url"], "title": f"{d['year']} Nissan {d['model']} maintenance schedule"}}))
    BUNDLE.write_text(json.dumps(bundle, separators=(",", ":")))
    print("\n".join(log) or "no rule corrections")
    print(f"{len(bundle)} specs -> {BUNDLE} ({BUNDLE.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
