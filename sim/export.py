"""Batch-generate the demo library:  python -m sim.export [n_seeds]

For every (layout, fill seed, free bay): plan -> NMPC closed-loop run -> naive baseline run ->
certify -> JSON for the viewer. A bay is only offered ("ok") if the NMPC run is certified:
no jackknife, |psi| never over psi_crit, never within 0.10 m of an obstacle, and parked within
0.8 m / 10 deg / 12 deg (hitch) of the goal. Anything else is shipped as "infeasible", never as a
guidance the professor could watch fail.
"""
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from math import cos, sin, degrees, radians

from .advisor import advise
from .collision import CollisionMap
from .custom import build_custom
from .lot import build_layout, LAYOUT_NAMES
from .model import VEH, vehicle_json, wrap
from .planner import CLEAR, plan_bay
from .tracker import DWELL, run

OUT = os.environ.get("EXPORT_OUT") or os.path.join(os.path.dirname(__file__), "..", "viewer", "public", "data")
TOL_POS, TOL_HDG, TOL_PSI, MIN_CLR = 0.8, 10.0, 12.0, 0.10
ABORT_CLR = 0.15       # a retry attempt stops and re-plans when the rig gets this close to anything (certification needs > MIN_CLR)
FRAME_DT = 0.2

# The deep pass (live server, and the library with EXPORT_DEEP=1): a bay that fails its first attempt is tried again
# like a driver would. The planner settings of each fresh attempt (the first is the ordinary one, so this pass never
# changes a bay that certifies at once), and after an attempt that ends SAFE but not parked well (no jackknife, hitch
# limit kept, nothing touched) the rig pulls forward and parks again from where it stopped. Every attempt, and the
# whole chain, is held to the same checks as a first attempt.
#
# Each rung changes something structural (not just a weight) so a search that failed by exhaustion gets a different
# problem on the next try: a wider goal region, a finer lattice, a tighter turning radius, denser steering set-points,
# a bigger expansion cap, or finally the sampling fallback for cluttered yards that the lattice cannot explore in time.
# The last rung sets `fallback=True`; plan_bay will try Hybrid A* once more at that rung's settings and then hand off
# to the fallback planner if the lattice is still empty-handed. On a yard the first attempt already certifies, nothing
# below this rung runs, so templates with their default start are unaffected.
_PSI_WIDE = tuple(radians(a) for a in (-50.0, -35.0, -20.0, 0.0, 20.0, 35.0, 50.0))
LADDER = (
    {},                                                                       # the default rig, bit-for-bit as the original
    {"h_weight": 2.0, "lat_tol": 1.8, "ang_tol": radians(14.0)},
    {"clear": 0.7, "max_expansions": 80000},
    {"h_weight": 2.0, "clear": 0.7, "rho_scale": 0.8, "max_expansions": 80000},
    {"h_weight": 1.5, "pos_res": 0.3, "ang_res": radians(3.0), "max_expansions": 120000},
    {"h_weight": 1.5, "clear": 1.0, "psi_des": _PSI_WIDE, "lat_tol": 2.0, "ang_tol": radians(15.0),
     "max_expansions": 150000},
    {"h_weight": 2.0, "clear": 0.25, "rho_scale": 0.65, "psi_des": _PSI_WIDE, "lat_tol": 2.0,
     "ang_tol": radians(15.0), "max_expansions": 150000, "fallback": True, "fallback_budget": 25.0},
)
MAX_LEGS = 3           # the run and up to two "pull forward and park again" legs
DEEP_BUDGET = 300.0    # s of wall time after which no further attempt starts


def _frames(frames, with_hor=False):
    out, hor, next_t, next_h = [], [], -1.0, -1.0
    for f in frames:
        if f["t"] + 1e-9 >= next_t:
            out.append([f["t"], f["x"], f["y"], round(f["th"], 3), round(f["psi"], 3), f["v"], round(f["delta"], 3)])
            next_t = f["t"] + FRAME_DT
        if with_hor and "hor" in f and f["t"] + 1e-9 >= next_h:
            hor.append([f["t"], [[round(a, 2), round(b, 2), round(c, 3), round(d, 3)] for a, b, c, d in f["hor"]]])
            next_h = f["t"] + 0.5
    return (out, hor) if with_hor else out


def certify(bay, r):
    g, f = bay["goal"], r["final"]
    dx, dy = f["x"] - g[0], f["y"] - g[1]
    ct, st = cos(g[2]), sin(g[2])
    lon, lat = dx * ct + dy * st, -dx * st + dy * ct
    hdg, psi = degrees(wrap(f["th"] - g[2])), degrees(f["psi"])
    ok = (not r["jackknife"] and not r["psi_limit_violated"] and r["min_clearance"] > MIN_CLR
          and abs(lon) < TOL_POS and abs(lat) < TOL_POS and abs(hdg) < TOL_HDG and abs(psi) < TOL_PSI)
    return ok, {"lon": round(lon, 2), "lat": round(lat, 2), "hdg": round(hdg, 1), "psi": round(psi, 1)}


def _why(r):
    return ("jackknife" if r["jackknife"] else "hitch limit" if r["psi_limit_violated"]
            else "clearance" if r["min_clearance"] <= MIN_CLR or r.get("aborted") else "parking accuracy")


def _safe(r):
    """The run broke no hard limit: it may still have parked badly, and then it can be tried again from where it stopped."""
    return not r["jackknife"] and not r["psi_limit_violated"] and r["min_clearance"] > MIN_CLR


def _leg(lay, cm, bay, veh, start, opts, delta0, deep):
    """Plan from `start` (None: the gate) with planner settings `opts` and drive it with the NMPC (in the deep pass,
    stopping to re-plan when it gets too close to anything). Returns (waypoints, run) or (None, None) without a plan."""
    if start is not None:
        lay = dict(lay, start=list(start))
        # a rig that stopped beside a parked truck cannot be asked for the full margin: it must only get away from it
        opts = dict(opts, clear=min(opts.get("clear", CLEAR), max(MIN_CLR + 0.01, cm.clearance(tuple(start)) - 0.03)))
    wp, _ = plan_bay(lay, cm, bay, veh, **opts)
    if wp is None:
        return None, None
    return wp, run(lay, cm, wp, mode="nmpc", bay=bay, veh=veh, delta0=delta0, clear=opts.get("clear", CLEAR),
                   abort_clear=ABORT_CLR if deep else None)


def _join(legs):
    """The legs as one run: time continues (the rig stands DWELL s between legs) and every limit is checked over all of it."""
    if len(legs) == 1:
        return legs[0]
    frames, phases, off = [], [], 0.0
    for i, r in enumerate(legs):
        if i:
            last, t_end = frames[-1], frames[-1]["t"]
            frames += [dict(last, t=round(t_end + 0.1 * k, 2), v=0.0) for k in range(1, int(DWELL / 0.1))]
            off = t_end + DWELL
        frames += [dict(f, t=round(f["t"] + off, 2)) for f in r["frames"]]
        phases += [dict(ph, t0=round(ph["t0"] + off, 2)) for ph in r["phases"]]
    st = [r["solver"] for r in legs]
    return {"frames": frames, "phases": phases, "duration": frames[-1]["t"],
            "jackknife": any(r["jackknife"] for r in legs), "psi_limit_violated": any(r["psi_limit_violated"] for r in legs),
            "min_clearance": min(r["min_clearance"] for r in legs), "max_psi": max(r["max_psi"] for r in legs),
            "final": legs[-1]["final"], "mode": "nmpc", "aborted": legs[-1].get("aborted", False),
            "solver": {"solves": sum(x["solves"] for x in st), "ms": sum(x["ms"] for x in st), "fail": sum(x["fail"] for x in st)}}


def make_layout(src, occupied=None, veh=VEH):
    """A lot from its source: {"template": name, "seed": s} (sim/lot.py) or {"custom": spec} (sim/custom.py)."""
    if "custom" in src:
        return build_custom(src["custom"], occupied, veh)
    return build_layout(src["template"], src["seed"], occupied=occupied, veh=veh)


def _job(lay, bid):
    return (lay["name"], lay.get("spec_id", lay["seed"]), bid)


def _start_snap(lay, cm, veh):
    """A start pose that just barely clears the obstacle set is a hard case for Hybrid A*: there is no
    room for the first primitive and the search dies at the gate. Nudge the start to a nearby pose
    with better clearance when the given one is tight; keep the original if nothing better is near.
    Returns a layout dict (possibly with a new "start") and whether a snap was applied."""
    s = tuple(lay["start"])
    want = 0.5                                              # metres of clearance we would like to find
    base = cm.clearance(s)
    if base >= want:
        return lay, False
    best_clr, best_s = base, s
    th = s[2]
    cx_h, sx_h = cos(th), sin(th)
    # a small grid around the given start: a half-metre back, side-steps, and a few yaw tweaks
    for d_back in (0.0, 0.4, 0.8, 1.2):
        for d_side in (-0.4, 0.0, 0.4):
            for d_yaw in (0.0, radians(5.0), radians(-5.0)):
                cand = (s[0] - d_back * cx_h + d_side * sx_h,
                        s[1] - d_back * sx_h - d_side * cx_h,
                        s[2] + d_yaw, s[3])
                b = lay["bounds"]
                if not (b["xmin"] <= cand[0] <= b["xmax"] and b["ymin"] <= cand[1] <= b["ymax"]):
                    continue
                clr = cm.clearance(cand)
                if clr > best_clr:
                    best_clr, best_s = clr, cand
    if best_s is s or best_clr <= base + 1e-3:
        return lay, False
    return dict(lay, start=list(best_s), start_original=list(s)), True


def _certified_chain(lay, cm, bay, veh, deep, t0):
    """Plan and drive until a chain of legs certifies. Returns (legs, first waypoints, attempts, final-error dict,
    planner settings of the attempt that certified), or (None, None, attempts, reason, None)."""
    debug = os.environ.get("SOLVER_DEBUG")
    lay, snapped = _start_snap(lay, cm, veh)
    if snapped and debug:
        print(f"[solver] bay {bay['id']}: start-snap used", flush=True)
    n, reason = 0, "no collision-free plan"
    for ri, opts in enumerate(LADDER if deep else LADDER[:1]):
        if n and time.time() - t0 > DEEP_BUDGET:
            break
        n += 1
        wp, r = _leg(lay, cm, bay, veh, None, opts, 0.0, deep)
        if wp is None:
            continue
        legs = [r]
        while True:
            joined = _join(legs)
            ok, final = certify(bay, joined)
            if ok:
                if debug:
                    print(f"[solver] bay {bay['id']}: certified at rung {ri} (deep={deep}, legs={len(legs)})", flush=True)
                return legs, wp, n, final, opts
            reason = f"guidance not certified ({_why(joined)})"
            if not (deep and _safe(joined)) or len(legs) >= MAX_LEGS or time.time() - t0 > DEEP_BUDGET:
                break
            f = legs[-1]["final"]
            w2, r2 = _leg(lay, cm, bay, veh, (f["x"], f["y"], f["th"], f["psi"]), opts, legs[-1]["frames"][-1]["delta"], deep)
            if w2 is None:
                break
            legs.append(r2)
    if debug:
        print(f"[solver] bay {bay['id']}: infeasible after rung {n - 1} (deep={deep}): {reason}", flush=True)
    return None, None, n, reason + (f", after {n} attempts" if deep and n > 1 else ""), None


def solve_bay(src, occupied, bid, veh=VEH, deep=False):
    """Plan, drive (NMPC and unaided) and certify one bay of one lot. Shared by the batch export and the
    live server. `src` is the lot's source (see make_layout); `occupied` is None for a template's seeded fill, else the
    exact set of bay ids holding a rig; `veh` is the rig (the lot is sized for it and every parked truck is the same
    model). `deep`: a bay that does not certify at once is tried again (see LADDER); the live server runs that as a
    second job, after the first. A certified result also carries "drive": the first leg's waypoints and planner
    settings, which the server keeps (not sent to the browser) so a live run of the bay can start at once."""
    lay = make_layout(src, occupied, veh)
    args = _job(lay, bid)
    cm = CollisionMap(lay, veh)
    bay = lay["bays"][bid]
    t0 = time.time()
    legs, wp, attempts, final, opts = _certified_chain(lay, cm, bay, veh, deep, t0)
    if legs is None:
        return dict(job=args, ok=False, reason=final)
    nm = _join(legs)
    nv = run(lay, cm, wp, mode="naive", bay=bay, veh=veh)
    frames, hor = _frames(nm["frames"], with_hor=True)
    steps = advise(nm["frames"], veh)
    for s in steps:
        for k in ("t0", "t1", "dist", "s0", "speed_kmh", "peak_psi"):
            s[k] = round(s[k], 2)
    t_jack = None
    if nv["jackknife"]:
        t_jack = nv["frames"][-1]["t"]
    plan = {
        "duration": nm["duration"], "steps": steps, "frames": frames, "hor": hor,
        "path": [[round(w["x"], 2), round(w["y"], 2)] for w in wp[::3]],
        "metrics": {"max_psi_deg": round(degrees(nm["max_psi"]), 1), "min_clearance": nm["min_clearance"],
                    "final": final, "solves": nm["solver"]["solves"],
                    "solve_ms": round(nm["solver"]["ms"] / max(1, nm["solver"]["solves"]), 1),
                    "dist_m": round(sum(s["dist"] for s in steps), 1)},
        "baseline": {"frames": _frames(nv["frames"]), "jackknife": nv["jackknife"], "t_jack": t_jack,
                     "max_psi_deg": round(degrees(nv["max_psi"]), 1), "duration": nv["duration"]},
    }
    if attempts > 1 or len(legs) > 1:
        plan["metrics"]["retry"] = {"attempts": attempts, "legs": len(legs)}
    return dict(job=args, ok=True, plan=plan, wall=time.time() - t0, drive={"wp": wp, "opts": opts})


def job(args):
    name, seed, bid = args
    return solve_bay({"template": name, "seed": seed}, None, bid, deep=bool(os.environ.get("EXPORT_DEEP")))


def ping():
    """Warm-up task for a worker process: importing this module loads numpy/scipy and the model."""
    return os.getpid()


def low_priority():
    """Initializer for the live server's worker processes: solve at below-normal priority, so the browser
    showing the demo stays smooth while a lot is being certified."""
    if os.name == "nt":
        import ctypes
        k32 = ctypes.windll.kernel32
        k32.SetPriorityClass(k32.GetCurrentProcess(), 0x4000)      # BELOW_NORMAL_PRIORITY_CLASS
    else:
        os.nice(5)


def layout_json(src, results, occupied=None, veh=VEH):
    lay = make_layout(src, occupied, veh)
    status = {}
    for r in results:
        status[r["job"][2]] = r
    bays = []
    for b in lay["bays"]:
        entry = {"id": b["id"], "cx": round(b["cx"], 2), "cy": round(b["cy"], 2), "theta": round(b["theta"], 4),
                 "w": b["w"], "l": b["l"], "approach": b["approach"],
                 "goal": [round(v, 3) for v in b["goal"]], "occupied": b["occupied"],
                 "parked": None if not b["occupied"] else {k: round(b["parked"][k], 3) for k in ("cx", "cy", "theta", "l", "w")}}
        if b["occupied"]:
            entry["status"] = "occupied"
        else:
            r = status.get(b["id"])
            entry["status"] = "ok" if r and r["ok"] else "infeasible"
            if entry["status"] == "infeasible":
                entry["reason"] = r["reason"] if r else "not evaluated"
        bays.append(entry)
    layout = {"name": lay["name"], "label": lay["label"], "seed": lay["seed"], "aisle": lay["aisle"],
              "bounds": {k: round(v, 2) for k, v in lay["bounds"].items()},
              "start": [round(v, 3) for v in lay["start"]], "bays": bays}
    if lay.get("drawn"):                                   # a drawn yard: its obstacles, for the 3-D view
        layout.update(drawn=True, spec_id=lay["spec_id"],
                      blocks=[{k: round(o[k], 3) for k in ("cx", "cy", "theta", "l", "w")} for o in lay["blocks"]])
    return {
        "version": 1,
        "layout": layout,
        "vehicle": vehicle_json(veh),
        "plans": {str(r["job"][2]): r["plan"] for r in results if r["ok"]},
    }


if __name__ == "__main__":
    n_seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    only = os.environ.get("ONLY")
    jobs = []
    for name in LAYOUT_NAMES:
        if only and name not in only.split(","):
            continue
        for s in range(n_seeds):
            for b in build_layout(name, s)["bays"]:
                if not b["occupied"]:
                    jobs.append((name, s, b["id"]))
    print(f"{len(jobs)} scenarios", flush=True)
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    workers = int(os.environ.get("EXPORT_WORKERS") or max(1, (os.cpu_count() or 4) - 2))
    with ProcessPoolExecutor(max_workers=workers) as ex:
        res = list(ex.map(job, jobs))
    manifest = {"layouts": []}
    for name in LAYOUT_NAMES:
        if only and name not in only.split(","):
            continue
        entry = {"name": name, "label": build_layout(name, 0)["label"], "seeds": []}
        for s in range(n_seeds):
            rs = [r for r in res if r["job"][0] == name and r["job"][1] == s]
            data = layout_json({"template": name, "seed": s}, rs)
            fn = f"{name}_{s}.json"
            with open(os.path.join(OUT, fn), "w") as f:
                json.dump(data, f, separators=(",", ":"))
            ok = sum(1 for r in rs if r["ok"])
            entry["seeds"].append({"seed": s, "file": fn, "free": len(rs), "ok": ok,
                                   "kb": round(os.path.getsize(os.path.join(OUT, fn)) / 1024)})
        manifest["layouts"].append(entry)
        tot = sum(x["free"] for x in entry["seeds"]); ok = sum(x["ok"] for x in entry["seeds"])
        print(f"{name:9s} certified {ok}/{tot}")
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    bad = [r for r in res if not r["ok"]]
    print(f"\ndone in {time.time() - t0:.0f}s; not certified ({len(bad)}):")
    for r in bad:
        print("  ", r["job"], r["reason"])
