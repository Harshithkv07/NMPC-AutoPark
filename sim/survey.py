"""Dev tool: planner success/time across layouts and seeds.  python -m sim.survey"""
import sys, time
from concurrent.futures import ProcessPoolExecutor
from math import degrees

from .lot import build_layout, LAYOUT_NAMES
from .collision import CollisionMap
from .planner import plan_bay


def job(args):
    import json, os
    from . import planner
    for k, v in json.loads(os.environ.get("PLN", "{}")).items():
        setattr(planner, k, v)
    name, seed, bid = args
    lay = build_layout(name, seed)
    cm = CollisionMap(lay)
    t0 = time.time()
    wp, n = plan_bay(lay, cm, lay["bays"][bid], max_expansions=6000)
    return name, seed, bid, wp is not None, n, time.time() - t0, \
        (max(abs(degrees(w["psi"])) for w in wp) if wp else 0)


if __name__ == "__main__":
    seeds = range(int(sys.argv[1]) if len(sys.argv) > 1 else 3)
    jobs = []
    for name in LAYOUT_NAMES:
        for s in seeds:
            for b in build_layout(name, s)["bays"]:
                if not b["occupied"]:
                    jobs.append((name, s, b["id"]))
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(job, jobs))
    for name in LAYOUT_NAMES:
        r = [x for x in res if x[0] == name]
        ok = [x for x in r if x[3]]
        print(f"{name:9s}: {len(ok):2d}/{len(r):2d} solved | median {sorted(x[5] for x in ok)[len(ok)//2] if ok else 0:5.1f}s "
              f"max {max((x[5] for x in ok), default=0):5.1f}s | max|psi| {max((x[6] for x in ok), default=0):.0f}deg")
        for x in r:
            if not x[3]:
                print(f"     FAIL seed {x[1]} bay {x[2]} ({x[4]} exp)")
