"""Pick the maintenance-schedule and capacities pages out of an owner's manual text dump (pages split on \f)."""
import re, sys

SCHED = re.compile(r"(\d{1,3},\d{3} ?(Miles|miles) ?/ ?\d|MAINTENANCE SCHEDULE|Maintenance schedule|Severe use maintenance|severe operating|Oil control system|OIL CONTROL SYSTEM)")
CAPS = re.compile(r"(CAPACITIES AND RECOMMENDED|Capacities and recommended|Recommended Fluids|recommended fluids/lubricants|SAE viscosity|Engine oil viscosity|Genuine NISSAN CVT Fluid|Matic S|Antifreeze/Coolant \(blue\))", re.I)

def pages(path):
    return open(path, encoding="utf-8", errors="ignore").read().split("\f")

def select(path, max_pages=60):
    ps = pages(path)
    keep = []
    for i, p in enumerate(ps):
        s = len(SCHED.findall(p)); c = len(CAPS.findall(p))
        if s >= 2 or c >= 2:
            keep.append(i)
    # fill gaps of 1 page inside runs so tables that span pages stay together
    keep = sorted(set(keep) | {k + 1 for k in keep if k + 2 in keep})
    return [(i + 1, ps[i]) for i in keep][:max_pages]

if __name__ == "__main__":
    for f in sys.argv[1:]:
        sel = select(f)
        print(f, len(sel), [n for n, _ in sel][:80], sum(len(t) for _, t in sel))
