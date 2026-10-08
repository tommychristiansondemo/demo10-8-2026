"""Second-pass verification of extracted specs (LLM-as-reviewer).

A different, stronger model (Claude Opus 4.6) re-reads the SAME manual pages -- this time the column-preserving
`pdftotext -layout` rendering -- together with the first-pass JSON, and returns a corrected record plus a list of
the corrections it made. Corrections are logged to data/curated/verification_report.md for human review.
"""
import concurrent.futures as cf, json, pathlib, subprocess, sys, time
import boto3
from botocore.config import Config

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from extract_specs import SCHEMA  # noqa: E402
from select_pages import select  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW, PLAIN, SPECS = ROOT / "data/raw", ROOT / "data/plain", ROOT / "data/curated/specs"
MODEL_ID = "us.anthropic.claude-opus-4-6-v1"
brt = boto3.client("bedrock-runtime", region_name="us-east-1",
                   config=Config(read_timeout=900, retries={"max_attempts": 6, "mode": "adaptive"}))

OUT_SCHEMA = {"type": "object", "properties": {
    "corrected": SCHEMA,
    "corrections": {"type": "array", "items": {"type": "string"},
                    "description": "one line per change: field, old -> new, page evidence"}},
    "required": ["corrected", "corrections"]}

PROMPT = """You are reviewing a dataset record extracted from the {year} Nissan {model} Owner's Manual (USA).
Below: (1) the FIRST-PASS JSON, (2) the source pages rendered with column layout preserved.
Check every maintenance interval, first-service mileage, schedule (standard vs severe), engine applicability,
and fluid spec/capacity against the pages. Typical errors to look for: an item attributed to the wrong mileage
column, a 'severe use' item recorded as standard (or vice-versa), a repeat interval confused with a first
interval, missing spark plug / coolant / air filter / cabin filter intervals that ARE in the pages, and facts
not supported by the pages (remove them). Keep correct values unchanged. Call record_review exactly once.

FIRST-PASS JSON:
{first}

PAGES (layout text):
{pages}"""


def layout_pages(stem, numbers):
    pdf = RAW / f"{stem}.pdf"
    out = []
    for n in numbers:
        t = subprocess.run(["pdftotext", "-layout", "-f", str(n), "-l", str(n), str(pdf), "-"],
                           capture_output=True, text=True).stdout
        out.append(f"=== PAGE {n} ===\n{t}")
    return "\n".join(out)


def verify(stem):
    key = stem.replace("-nissan", "").replace("-owner-manual", "")
    first = json.loads((SPECS / f"{key}.json").read_text())
    if first.get("verified_with"):
        return f"{key}: already verified"
    nums = [n for n, _ in select(str(PLAIN / f"{stem}.txt"))]
    slim = {k: v for k, v in first.items() if k in SCHEMA["properties"]}
    resp = brt.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [{"text": PROMPT.format(
            year=first["year"], model=first["model"], first=json.dumps(slim, indent=1), pages=layout_pages(stem, nums))}]}],
        toolConfig={"tools": [{"toolSpec": {"name": "record_review", "description": "Record the reviewed record",
                                            "inputSchema": {"json": OUT_SCHEMA}}}],
                    "toolChoice": {"tool": {"name": "record_review"}}},
        inferenceConfig={"maxTokens": 20000, "temperature": 0},
    )
    out = next(c["toolUse"]["input"] for c in resp["output"]["message"]["content"] if "toolUse" in c)
    rec = {**first, **out["corrected"]}
    rec.update(verified_with=MODEL_ID, corrections=out["corrections"], model=first["model"], year=first["year"])
    (SPECS / f"{key}.json").write_text(json.dumps(rec, indent=2))
    return f"{key}: {len(out['corrections'])} corrections"


def main():
    stems = sorted(p.stem for p in PLAIN.glob("*-owner-manual.txt") if len(sys.argv) < 2 or sys.argv[1] in p.stem)
    with cf.ThreadPoolExecutor(5) as ex:
        for r in ex.map(verify, stems):
            print(r, flush=True)
    rep = ["# Spec extraction verification report", "",
           f"First pass: Claude Sonnet 4.6 on plain text. Review pass: {MODEL_ID} on layout text. Generated {time.strftime('%Y-%m-%d')}.", ""]
    for f in sorted(SPECS.glob("*.json")):
        d = json.loads(f.read_text())
        rep += [f"## {d['year']} {d['model']}", ""] + [f"- {c}" for c in d.get("corrections", [])] + [""]
    (ROOT / "data/curated/verification_report.md").write_text("\n".join(rep))


if __name__ == "__main__":
    main()
