"""Offline data curation: extract a structured maintenance schedule + fluid specs from each
public Nissan USA owner's manual using Claude on Amazon Bedrock (forced tool output = strict JSON).

Input : data/plain/<year>-nissan-<model>-owner-manual.txt  (pdftotext, pages split on \f)
Output: data/curated/specs/<year>-<model>.json

Run:  python3 scripts/curate/extract_specs.py [--only 2024-nissan-rogue]
"""
import argparse, concurrent.futures as cf, json, pathlib, re, sys, time
import boto3
from botocore.config import Config

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from select_pages import select  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
PLAIN, OUT = ROOT / "data/plain", ROOT / "data/curated/specs"
MODEL_ID = "us.anthropic.claude-sonnet-4-6"
brt = boto3.client("bedrock-runtime", region_name="us-east-1",
                   config=Config(read_timeout=600, retries={"max_attempts": 6, "mode": "adaptive"}))

ITEM = {
    "type": "object",
    "properties": {
        "item": {"type": "string", "description": "e.g. 'Engine oil and filter', 'Tire rotation', 'Spark plugs', 'Engine coolant', 'CVT fluid', 'In-cabin microfilter', 'Air cleaner filter', 'Brake fluid', 'Intelligent Key battery'"},
        "action": {"type": "string", "enum": ["replace", "inspect", "rotate", "check", "lubricate"]},
        "schedule": {"type": "string", "enum": ["standard", "severe", "both"]},
        "interval_miles": {"type": ["integer", "null"]},
        "interval_months": {"type": ["integer", "null"]},
        "first_at_miles": {"type": ["integer", "null"], "description": "only if the first service differs from the repeat interval (e.g. coolant first at 105,000)"},
        "first_at_months": {"type": ["integer", "null"]},
        "applies_to": {"type": "string", "description": "engine code / drivetrain qualifier, or 'all'"},
        "notes": {"type": "string"},
    },
    "required": ["item", "action", "schedule", "interval_miles", "interval_months", "applies_to"],
}
SCHEMA = {
    "type": "object",
    "properties": {
        "model": {"type": "string"},
        "year": {"type": "integer"},
        "powertrains": {"type": "array", "items": {"type": "object", "properties": {
            "engine_code": {"type": "string"}, "description": {"type": "string"},
            "transmission": {"type": "string"}}, "required": ["engine_code", "description"]}},
        "oil_life_monitor": {"type": "string", "description": "how the oil change reminder / oil control system works, if described; else ''"},
        "severe_conditions": {"type": "array", "items": {"type": "string"}},
        "maintenance_items": {"type": "array", "items": ITEM},
        "fluids": {"type": "array", "items": {"type": "object", "properties": {
            "fluid": {"type": "string"}, "specification": {"type": "string"},
            "capacity": {"type": "string", "description": "US measure, with qualifier e.g. 'with filter'"},
            "applies_to": {"type": "string"}}, "required": ["fluid", "specification"]}},
        "source_pages": {"type": "array", "items": {"type": "integer"}},
        "extraction_caveats": {"type": "string"},
    },
    "required": ["model", "year", "powertrains", "maintenance_items", "fluids", "source_pages", "extraction_caveats"],
}

PROMPT = """You are curating a vehicle-maintenance dataset. Below are pages (with page numbers) from the
public {year} Nissan {model} Owner's Manual (USA). Extract the factory maintenance schedule and fluid
specifications EXACTLY as published. Rules:
- Only use facts in the text. Never infer intervals from other vehicles. If something is absent, omit it.
- The text came from a 2-3 column PDF so columns may be interleaved; reconstruct carefully. Recurring items
  appear at regular mileage columns (e.g. every 7,500 miles) -- report the repeat interval, not each column.
- Mark items that appear only under 'Severe use maintenance' as schedule='severe'.
- Electric vehicles have no engine oil/spark plugs; capture battery/reduction gear/coolant items instead.
- Use the record_specs tool exactly once.

{pages}"""


def extract(stem: str) -> dict:
    m = re.match(r"(\d{4})-nissan-(.+)-owner-manual", stem)
    year, model = int(m.group(1)), m.group(2).replace("-", " ").title()
    pages = select(str(PLAIN / f"{stem}.txt"))
    body = "\n\n".join(f"=== PAGE {n} ===\n{t.strip()}" for n, t in pages)
    resp = brt.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [{"text": PROMPT.format(year=year, model=model, pages=body)}]}],
        toolConfig={"tools": [{"toolSpec": {"name": "record_specs", "description": "Record extracted specs",
                                            "inputSchema": {"json": SCHEMA}}}],
                    "toolChoice": {"tool": {"name": "record_specs"}}},
        inferenceConfig={"maxTokens": 16000, "temperature": 0},
    )
    data = next(c["toolUse"]["input"] for c in resp["output"]["message"]["content"] if "toolUse" in c)
    data.update(model=model, year=year, source_document=f"{year} Nissan {model} Owner's Manual (USA)",
                source_url=f"https://www.nissanusa.com/content/dam/Nissan/us/manuals-and-guides/{m.group(2)}/{year}/{stem}.pdf",
                extracted_with=MODEL_ID, usage=resp["usage"])
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    stems = sorted(p.stem for p in PLAIN.glob("*-owner-manual.txt") if not a.only or a.only in p.stem)
    todo = [s for s in stems if a.force or not (OUT / f"{s.replace('-nissan', '').replace('-owner-manual', '')}.json").exists()]

    def run(s):
        t = time.time()
        d = extract(s)
        (OUT / f"{s.replace('-nissan', '').replace('-owner-manual', '')}.json").write_text(json.dumps(d, indent=2))
        return f"{s}: {len(d['maintenance_items'])} items, {len(d['fluids'])} fluids, {time.time()-t:.0f}s"

    with cf.ThreadPoolExecutor(6) as ex:
        for r in ex.map(run, todo):
            print(r, flush=True)


if __name__ == "__main__":
    main()
