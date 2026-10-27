"""Timing benchmark for one bay's full pipeline:  python -m sim.bench [--profile]

Runs plan -> NMPC closed loop -> unaided run -> certify on three library scenarios, one at a time on an
otherwise idle core, and prints where the time goes. With --profile it also prints the top cProfile entries.
"""
import cProfile
import pstats
import sys
import time

from .collision import CollisionMap
from .export import certify
from .lot import build_layout
from .planner import plan_bay
from .tracker import run

SCENARIOS = [("cross", 0, 5), ("angled", 0, 5), ("parallel", 0, 1)]


def one(name, seed, bid):
    lay = build_layout(name, seed)
    cm = CollisionMap(lay)
    bay = lay["bays"][bid]
    t0 = time.perf_counter()
    wp, _ = plan_bay(lay, cm, bay)
    t1 = time.perf_counter()
    nm = run(lay, cm, wp, mode="nmpc", bay=bay)
    t2 = time.perf_counter()
    nv = run(lay, cm, wp, mode="naive", bay=bay)
    t3 = time.perf_counter()
    ok, final = certify(bay, nm)
    st = nm["solver"]
    return {"scenario": f"{name} {seed} bay {bid + 1}", "plan_s": t1 - t0, "nmpc_s": t2 - t1, "naive_s": t3 - t2,
            "total_s": t3 - t0, "solves": st["solves"], "ms_per_solve": st["ms"] / max(1, st["solves"]),
            "fail": st["fail"], "relaxed": st.get("relaxed", 0), "certified": ok, "final": final,
            "max_psi_deg": nm["max_psi"] * 57.29578, "duration": nm["duration"],
            "unaided_jackknife": nv["jackknife"]}


def main():
    prof = "--profile" in sys.argv
    rows = []
    for sc in SCENARIOS:
        if prof:
            p = cProfile.Profile()
            r = p.runcall(one, *sc)
            pstats.Stats(p).sort_stats("cumulative").print_stats(18)
        else:
            r = one(*sc)
        rows.append(r)
        print(f"{r['scenario']:18s} total {r['total_s']:6.1f} s  (plan {r['plan_s']:5.1f}, NMPC {r['nmpc_s']:6.1f}, "
              f"unaided {r['naive_s']:4.1f})  {r['solves']} solves x {r['ms_per_solve']:5.1f} ms  "
              f"fail {r['fail']} relaxed {r['relaxed']}  certified {r['certified']}  peak psi {r['max_psi_deg']:.1f}  "
              f"final {r['final']}  unaided jackknife {r['unaided_jackknife']}", flush=True)
    tot = sum(r["total_s"] for r in rows)
    print(f"\nmean per bay {tot / len(rows):.1f} s")


if __name__ == "__main__":
    main()
