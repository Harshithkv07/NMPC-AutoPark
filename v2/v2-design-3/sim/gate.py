"""Regression gate for engine changes:  python -m sim.gate <new_library_dir> [<reference_library_dir>]

Compares a freshly exported library (EXPORT_OUT=<dir> python -m sim.export 6) with a reference one
(default: this folder's viewer/public/data, i.e. the version-1 results) and fails unless
  * at least as many bays are certified as in the reference,
  * no certified run ever exceeds the 60 deg hitch limit,
  * the unaided driver still jackknifes on every certified reversing bay.
Per-bay status changes and per-layout median parking errors are printed for the record.
"""
import json
import os
import statistics
import sys

REF = os.path.join(os.path.dirname(__file__), "..", "viewer", "public", "data")


def load(d):
    man = json.load(open(os.path.join(d, "manifest.json")))
    lots = {}
    for lay in man["layouts"]:
        for s in lay["seeds"]:
            lots[(lay["name"], s["seed"])] = json.load(open(os.path.join(d, s["file"])))
    return lots


def summary(lots):
    out = {"ok": 0, "free": 0, "reverse_ok": 0, "reverse_jack": 0, "max_psi": 0.0, "status": {}, "errors": {}}
    for (name, seed), lot in lots.items():
        for b in lot["layout"]["bays"]:
            if b["status"] == "occupied":
                continue
            out["free"] += 1
            out["status"][(name, seed, b["id"])] = b["status"]
            if b["status"] != "ok":
                continue
            out["ok"] += 1
            plan = lot["plans"][str(b["id"])]
            out["max_psi"] = max(out["max_psi"], plan["metrics"]["max_psi_deg"])
            f = plan["metrics"]["final"]
            out["errors"].setdefault(name, []).append((abs(f["lat"]), abs(f["hdg"])))
            if b["approach"] == "reverse":
                out["reverse_ok"] += 1
                out["reverse_jack"] += bool(plan["baseline"]["jackknife"])
    return out


def main():
    new_dir = sys.argv[1]
    ref_dir = sys.argv[2] if len(sys.argv) > 2 else REF
    new, ref = summary(load(new_dir)), summary(load(ref_dir))
    print(f"certified        new {new['ok']}/{new['free']}   reference {ref['ok']}/{ref['free']}")
    print(f"peak hitch angle new {new['max_psi']:.1f} deg   reference {ref['max_psi']:.1f} deg   (limit 60)")
    print(f"unaided jackknife on certified reversing bays: new {new['reverse_jack']}/{new['reverse_ok']}"
          f"   reference {ref['reverse_jack']}/{ref['reverse_ok']}")
    for name in sorted(set(new["errors"]) | set(ref["errors"])):
        def med(e):
            return (statistics.median(x for x, _ in e), statistics.median(y for _, y in e)) if e else (float("nan"),) * 2
        a, b = med(new["errors"].get(name, [])), med(ref["errors"].get(name, []))
        print(f"  {name:9s} median parked error  new {a[0]:.2f} m {a[1]:.1f} deg   reference {b[0]:.2f} m {b[1]:.1f} deg")
    changed = [(k, ref["status"].get(k), v) for k, v in sorted(new["status"].items()) if ref["status"].get(k) != v]
    print(f"bays whose status changed: {len(changed)}")
    for k, was, now in changed:
        print(f"  {k[0]} fill {k[1] + 1} bay {k[2] + 1}: {was} -> {now}")        # numbered as in the viewer
    ok = (new["ok"] >= ref["ok"] and new["max_psi"] <= 60.0 and new["reverse_jack"] == new["reverse_ok"])
    print("GATE", "PASSED" if ok else "FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
