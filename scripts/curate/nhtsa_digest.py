"""Offline data curation: build per-model knowledge-base articles from public NHTSA data
(recalls + owner complaints), model years 2015-2026.

Output: data/kb/nhtsa/<model>-recalls-and-owner-reported-issues.md (+ .metadata.json sidecar for Bedrock KB filtering)
The live app ALSO calls the NHTSA API at question time; this digest gives the KB historical context
("what problems do owners report for a 2019 Rogue?") that a single live call can't summarise.
"""
import collections, concurrent.futures as cf, json, pathlib, re, time
import requests

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "data/kb/nhtsa"
YEARS = range(2015, 2027)
MODELS = ["ALTIMA", "SENTRA", "VERSA", "VERSA NOTE", "MAXIMA", "ROGUE", "ROGUE SPORT", "KICKS", "MURANO",
          "PATHFINDER", "ARMADA", "FRONTIER", "TITAN", "TITAN XD", "LEAF", "ARIYA", "370Z", "Z", "GT-R"]
S = requests.Session()
S.headers["User-Agent"] = "owner-assist-class-demo/1.0"


def get(url, params):
    for i in range(5):
        try:
            r = S.get(url, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (400, 404):
                return {}
        except requests.RequestException:
            pass
        time.sleep(2 ** i)
    return {}


def fetch(model, year):
    p = {"make": "NISSAN", "model": model, "modelYear": year}
    rec = get("https://api.nhtsa.gov/recalls/recallsByVehicle", p).get("results", [])
    com = get("https://api.nhtsa.gov/complaints/complaintsByVehicle", p).get("results", [])
    return model, year, rec, com


def clean(s, n):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def iso(d):
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", d or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else "date n/a"


def build(model, year, rec, com):
    title = model.title().replace("Gt-R", "GT-R").replace("Xd", "XD")
    lines = [f"# {year} Nissan {title}: safety recalls and owner-reported issues (NHTSA data)", "",
             "Source: U.S. National Highway Traffic Safety Administration public APIs (api.nhtsa.gov), "
             f"retrieved {time.strftime('%Y-%m-%d')}. Complaints are unverified owner reports and do not by "
             "themselves indicate a defect. Recall remedies are performed free of charge by Nissan dealers. "
             "Always confirm open recalls for a specific vehicle by VIN at nhtsa.gov/recalls or nissanusa.com/recalls-vin.", "",
             f"- {year} Nissan {title} safety recalls on record: {len(rec)}",
             f"- {year} Nissan {title} owner complaints filed with NHTSA: {len(com)}"]
    if com:
        crash = sum(1 for c in com if c.get("crash")); fire = sum(1 for c in com if c.get("fire"))
        inj = sum(int(c.get("numberOfInjuries") or 0) for c in com)
        lines.append(f"- Complaints alleging a crash: {crash}; fire: {fire}; injuries reported: {inj}")
    lines.append("")
    if rec:
        lines += [f"## {year} Nissan {title} recalls", ""]
        for r in sorted(rec, key=lambda r: iso(r.get("ReportReceivedDate")), reverse=True):
            lines.append(f"- **{year} {title} recall campaign {r['NHTSACampaignNumber']}** (reported {iso(r.get('ReportReceivedDate'))}) "
                         f"- component: {r.get('Component','').title()}. Problem: {clean(r.get('Summary'), 420)} "
                         f"Risk: {clean(r.get('Consequence'), 220)} Remedy: {clean(r.get('Remedy'), 260)}")
        lines.append("")
    if com:
        cnt = collections.Counter(x.strip() for c in com for x in (c.get("components") or "").split(",") if x.strip())
        lines += [f"## {year} Nissan {title} most-reported complaint areas", ""]
        for comp, n in cnt.most_common(6):
            ex = [c for c in com if comp in (c.get("components") or "")]
            ex.sort(key=lambda c: len(c.get("summary") or ""), reverse=True)
            quotes = "; ".join(f"\"{clean(c.get('summary'), 260)}\"" for c in ex[1:3] if c.get("summary"))
            lines.append(f"- **{year} {title} - {comp.title()}**: {n} complaints. Example owner reports: {quotes}")
        lines.append("")
    meta = {"metadataAttributes": {"doc_type": "nhtsa_digest", "model": title.lower(), "year": year,
                                   "source": "NHTSA api.nhtsa.gov", "source_url": "https://www.nhtsa.gov/recalls"}}
    return title, "\n".join(lines), meta


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data = collections.defaultdict(dict)
    with cf.ThreadPoolExecutor(8) as ex:
        for model, year, rec, com in ex.map(lambda a: fetch(*a), [(m, y) for m in MODELS for y in YEARS]):
            if rec or com:
                data[model][year] = (rec, com)
    for f in OUT.glob("*"):
        f.unlink()
    n = 0
    for model in MODELS:
        for year, (rec, com) in sorted(data[model].items()):
            title, md, meta = build(model, year, rec, com)
            slug = f"{year}-{title.lower().replace(' ', '-')}-nhtsa-recalls-complaints.md"
            (OUT / slug).write_text(md)
            (OUT / f"{slug}.metadata.json").write_text(json.dumps(meta))
            n += 1
    print(n, "model-year docs written")


if __name__ == "__main__":
    main()
