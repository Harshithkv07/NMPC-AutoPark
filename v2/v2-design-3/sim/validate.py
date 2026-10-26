"""End-to-end validation: plan + NMPC + naive on many scenarios.  python -m sim.validate [n_seeds]

A run PARKS when: no jackknife, |psi| never above psi_crit, never within 0.05 m of an obstacle,
and the final pose is within 0.8 m / 10 deg / 12 deg (hitch) of the goal.
"""
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from math import cos, sin, degrees

from .lot import build_layout, LAYOUT_NAMES
from .collision import CollisionMap
from .planner import plan_bay
from .tracker import run
from .model import wrap

TOL_POS, TOL_HDG, TOL_PSI = 0.8, 10.0, 12.0


def score(layout, bay, r):
    g, f = bay["goal"], r["final"]
    dx, dy = f["x"] - g[0], f["y"] - g[1]
    ct, st = cos(g[2]), sin(g[2])
    lon, lat = dx * ct + dy * st, -dx * st + dy * ct
    hdg, psi = degrees(wrap(f["th"] - g[2])), degrees(f["psi"])
    parked = (not r["jackknife"] and not r["psi_limit_violated"] and r["min_clearance"] > 0.05
              and abs(lon) < TOL_POS and abs(lat) < TOL_POS and abs(hdg) < TOL_HDG and abs(psi) < TOL_PSI)
    return dict(parked=parked, jackknife=r["jackknife"], violated=r["psi_limit_violated"],
                clr=r["min_clearance"], lon=lon, lat=lat, hdg=hdg, psi=psi,
                max_psi=degrees(r["max_psi"]), dur=r["duration"])


def job(args):
    from . import tracker
    for k, v in json.loads(os.environ.get("TRK", "{}")).items():
        setattr(tracker, k, v)
    name, seed, bid = args
    lay = build_layout(name, seed)
    cm = CollisionMap(lay)
    bay = lay["bays"][bid]
    t0 = time.time()
    wp, n = plan_bay(lay, cm, bay)
    if wp is None:
        return dict(job=args, planned=False)
    out = dict(job=args, planned=True, plan_s=time.time() - t0)
    for mode in ("nmpc", "naive"):
        t1 = time.time()
        r = run(lay, cm, wp, mode=mode, bay=bay)
        out[mode] = score(lay, bay, r)
        out[mode]["wall"] = time.time() - t1
    return out


if __name__ == "__main__":
    n_seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    jobs = []
    only = os.environ.get("ONLY")
    for name in LAYOUT_NAMES:
        if only and name not in only.split(","):
            continue
        for s in range(n_seeds):
            for b in build_layout(name, s)["bays"]:
                if not b["occupied"]:
                    jobs.append((name, s, b["id"]))
    print(f"{len(jobs)} scenarios", flush=True)
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(job, jobs))
    for name in [n for n in LAYOUT_NAMES if not only or n in only.split(',')]:
        rs = [x for x in res if x["job"][0] == name]
        pl = [x for x in rs if x["planned"]]
        nm_ok = sum(x["nmpc"]["parked"] for x in pl)
        nv_ok = sum(x["naive"]["parked"] for x in pl)
        nv_jk = sum(x["naive"]["jackknife"] for x in pl)
        nm_jk = sum(x["nmpc"]["jackknife"] for x in pl)
        print(f"{name:9s} planned {len(pl)}/{len(rs)} | NMPC parked {nm_ok}/{len(pl)} (jackknife {nm_jk}) | "
              f"naive parked {nv_ok}/{len(pl)} (jackknife {nv_jk})")
    print("\nNMPC failures:")
    for x in res:
        if x["planned"] and not x["nmpc"]["parked"]:
            m = x["nmpc"]
            print(f"  {x['job']}: jk={m['jackknife']} viol={m['violated']} clr={m['clr']:.2f} "
                  f"lon={m['lon']:+.2f} lat={m['lat']:+.2f} hdg={m['hdg']:+.1f} psi={m['psi']:+.1f} maxpsi={m['max_psi']:.0f}")
