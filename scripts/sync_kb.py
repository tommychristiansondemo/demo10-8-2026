"""Stage the knowledge-base corpus with Bedrock metadata sidecars, sync to S3, and run an ingestion job.

  owner-manuals/<year>-nissan-<model>-owner-manual.pdf      (+ .metadata.json: doc_type=owner_manual, model, year, source_url)
  warranty/<year>-nissan-<model>-warranty-booklet.pdf       (doc_type=warranty_booklet)
  nhtsa/, guides/, schedules/                                (markdown + sidecars written by scripts/curate/*)

Usage: python3 scripts/sync_kb.py [--no-wait]
"""
import argparse, json, pathlib, re, shutil, subprocess, sys, time
import boto3

ROOT = pathlib.Path(__file__).resolve().parents[1]
STAGE = ROOT / "data/kb_stage"
REGION = "us-east-1"


def outputs():
    cf = boto3.client("cloudformation", region_name=REGION)
    out = {}
    for stack in ("OwnerAssist-Data", "OwnerAssist-AI"):
        for o in cf.describe_stacks(StackName=stack)["Stacks"][0].get("Outputs", []):
            out[o["OutputKey"]] = o["OutputValue"]
    return out


def stage():
    if STAGE.exists():
        shutil.rmtree(STAGE)
    for sub in ("owner-manuals", "warranty"):
        (STAGE / sub).mkdir(parents=True)
    for pdf in sorted((ROOT / "data/raw").glob("*.pdf")):
        m = re.match(r"(\d{4})-nissan-(.+)-(owner-manual|warranty-booklet)\.pdf$", pdf.name)
        if not m:
            continue
        year, model_slug, kind = int(m[1]), m[2], m[3]
        model = model_slug.replace("-", " ")
        sub = "owner-manuals" if kind == "owner-manual" else "warranty"
        doc_type = "owner_manual" if kind == "owner-manual" else "warranty_booklet"
        title = f"{year} Nissan {model.title().replace('Leaf', 'LEAF')} {'Owner' + chr(39) + 's Manual' if kind == 'owner-manual' else 'Warranty Information Booklet'}"
        dst = STAGE / sub / pdf.name
        shutil.copy2(pdf, dst)
        (STAGE / sub / f"{pdf.name}.metadata.json").write_text(json.dumps({"metadataAttributes": {
            "doc_type": doc_type, "model": model, "year": year, "title": title,
            "source_url": f"https://www.nissanusa.com/content/dam/Nissan/us/manuals-and-guides/{model_slug}/{year}/{pdf.name}"}}))
    for sub in ("nhtsa", "guides", "schedules"):
        shutil.copytree(ROOT / "data/kb" / sub, STAGE / sub)
    n = sum(1 for p in STAGE.rglob("*") if p.is_file() and not p.name.endswith(".metadata.json"))
    print(f"staged {n} documents in {STAGE}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-wait", action="store_true")
    a = ap.parse_args()
    o = outputs()
    bucket = f"owner-assist-kb-source-{boto3.client('sts').get_caller_identity()['Account']}"
    stage()
    subprocess.run(["aws", "s3", "sync", str(STAGE), f"s3://{bucket}/", "--delete", "--only-show-errors", "--region", REGION], check=True)
    print(f"synced to s3://{bucket}")
    ba = boto3.client("bedrock-agent", region_name=REGION)
    job = ba.start_ingestion_job(knowledgeBaseId=o["KnowledgeBaseId"], dataSourceId=o["DataSourceId"],
                                 description="sync_kb.py")["ingestionJob"]
    print("ingestion job", job["ingestionJobId"], job["status"])
    if a.no_wait:
        return
    while True:
        time.sleep(30)
        j = ba.get_ingestion_job(knowledgeBaseId=o["KnowledgeBaseId"], dataSourceId=o["DataSourceId"],
                                 ingestionJobId=job["ingestionJobId"])["ingestionJob"]
        print(time.strftime("%H:%M:%S"), j["status"], json.dumps(j.get("statistics", {})), flush=True)
        if j["status"] in ("COMPLETE", "FAILED", "STOPPED"):
            for r in j.get("failureReasons", [])[:10]:
                print("  failure:", r[:400])
            sys.exit(0 if j["status"] == "COMPLETE" else 1)


if __name__ == "__main__":
    main()
