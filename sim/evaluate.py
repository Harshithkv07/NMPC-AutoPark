"""Benchmark: baselines, ablations and a robustness sweep over the 110 library bays.

    python -m sim.evaluate baselines     # controllers on the same plans: NMPC, NMPC without the hard hitch limit,
                                         # the classical cascade controller, the unaided driver
    python -m sim.evaluate robust        # NMPC and cascade under sensor noise, trailer-length error, steering delay
                                         # and a push on the trailer during the final approach
    python -m sim.evaluate planner       # planner ablations: fixed-steering primitives, heuristic weight 1
    python -m sim.evaluate report        # eval/REPORT.md and the figures, from the saved results
    python -m sim.evaluate all

Scenarios are the library's: every free bay of the four templates, fill seeds 0-5 (110 bays). Every bay is planned once
with the ordinary planner settings (the library's first attempt) and every controller drives that same plan, so a
difference between controllers is the controller's. A run counts as PARKED when it passes the library's certification
(sim/export.py certify: no jackknife, |psi| never above the 60 deg limit, never within 0.10 m of anything, parked within
0.8 m / 10 deg / 12 deg), always judged on the TRUE state of the rig. Only first attempts are measured: no second attempt.
Results go to eval/results/<suite>.json; ONLY=cross,angled and SEEDS=n narrow the scenario set, EVAL_WORKERS the pool.
"""
import json
import os
import sys
import time
import zlib
from concurrent.futures import ProcessPoolExecutor
from dataclasses import replace
from math import degrees, radians, hypot

import numpy as np

from . import planner
from .collision import CollisionMap
from .export import certify
from .lot import build_layout, LAYOUT_NAMES
from .model import VEH, step_batch
from .tracker import run

ROOT = os.path.join(os.path.dirname(__file__), "..", "eval")
RES = os.path.join(ROOT, "results")

CONTROLLERS = {"nmpc": "NMPC (ours)", "nmpc_soft": "NMPC, no hard hitch limit", "cascade": "Cascade (classical)",
               "naive": "Unaided driver"}

# The robustness sweep: (family, level label, run() keyword arguments). Noise is white and Gaussian on every control
# period's measurement (GNSS/IMU-grade position and heading, a hitch-angle sensor); the trailer-length error is a real
# trailer longer or shorter than the model; the delay is a steering actuator that starts moving that late; the push
# knocks the hitch angle further the way it leans, 3 s into the approach into the bay.
NOISE = {"low": (0.05, 0.5), "medium": (0.10, 1.0), "high": (0.20, 2.0)}       # (position m, angles deg) 1-sigma
SWEEP = ([("noise", k, {"noise": {"pos": p, "th": radians(a), "psi": radians(a)}}) for k, (p, a) in NOISE.items()]
         + [("trailer length", f"{f:+.0%}", {"plant": replace(VEH, L2=VEH.L2 * (1 + f))}) for f in (-0.10, -0.05, 0.05, 0.10)]
         + [("steering delay", f"{d:g} s", {"delay": d}) for d in (0.1, 0.25, 0.5)]
         + [("hitch push", f"{a} deg", {"disturbance": {"final_after": 3.0, "psi_kick": radians(a)}}) for a in (5, 10, 15)])
ROBUST_CTRL = ("nmpc", "cascade")

PLANNERS = {"ours": "Ours: hitch-angle primitives, weight 3", "fixed": "Fixed-steering primitives",
            "w1": "Heuristic weight 1"}


# ---------------------------------------------------------------------------- scenarios
def scenarios():
    only = os.environ.get("ONLY")
    seeds = int(os.environ.get("SEEDS") or 6)
    out = []
    for name in LAYOUT_NAMES:
        if only and name not in only.split(","):
            continue
        for s in range(seeds):
            for b in build_layout(name, s)["bays"]:
                if not b["occupied"]:
                    out.append((name, s, b["id"]))
    return out


def _lot(sc):
    name, seed, bid = sc
    lay = build_layout(name, seed)
    return lay, CollisionMap(lay), lay["bays"][bid]


def _seed(*parts):
    return zlib.crc32(repr(parts).encode())


# ---------------------------------------------------------------------------- planner variants
def _expand_node_fixed(s, gears, cm, veh, clear=planner.CLEAR):
    """Textbook Hybrid A* primitives: the steering angle is FIXED along each 2 m arc (5 angles from -85% to +85% of the
    lock, both gears) instead of steering to a hitch-angle set-point. Same arc length, sub-steps, hitch bound and
    clearance check as planner._expand_node, so only the primitive changes."""
    tu = planner.tuning(veh)
    k = np.linspace(-1.0, 1.0, len(tu.psi_des))
    dirs = np.repeat(np.asarray(gears, dtype=float), len(k))
    tn = np.tan(np.tile(k, len(gears)) * planner.PLAN_STEER_FRAC * veh.delta_max)
    B, dt = len(dirs), planner.DS / planner.SUB
    x = np.full(B, float(s[0])); y = np.full(B, float(s[1])); th = np.full(B, float(s[2])); psi = np.full(B, float(s[3]))
    X = np.empty((B, planner.SUB, 4))
    ok = np.ones(B, dtype=bool)
    for j in range(planner.SUB):
        x, y, th, psi = step_batch(x, y, th, psi, dirs, tn, dt, veh)
        X[:, j, 0], X[:, j, 1], X[:, j, 2], X[:, j, 3] = x, y, th, psi
        ok &= np.abs(psi) <= tu.psi_plan
    if ok.any():
        clr = cm.clearance_many(X[ok].reshape(-1, 4)).reshape(-1, planner.SUB).min(axis=1)
        idx = np.flatnonzero(ok)
        ok[idx[clr < clear]] = False
    D = np.arctan(tn)
    Xl = X.tolist()
    return [[(tuple(Xl[b][j]), float(D[b])) for j in range(planner.SUB)] if ok[b] else None for b in range(B)]


def _plan(sc, variant="ours"):
    lay, cm, bay = _lot(sc)
    orig = planner._expand_node
    if variant == "fixed":
        planner._expand_node = _expand_node_fixed
    try:
        t0 = time.perf_counter()
        wp, n = planner.plan_bay(lay, cm, bay, h_weight=1.0 if variant == "w1" else planner.H_WEIGHT)
        dt = time.perf_counter() - t0
    finally:
        planner._expand_node = orig
    info = {"found": wp is not None, "expansions": n, "plan_s": round(dt, 3)}
    if wp is not None:
        g = [w["gear"] for w in wp[1:]]
        info.update(length_m=round(sum(hypot(b["x"] - a["x"], b["y"] - a["y"]) for a, b in zip(wp, wp[1:])), 1),
                    gear_changes=sum(1 for a, b in zip(g, g[1:]) if a != b),
                    max_psi_deg=round(max(abs(degrees(w["psi"])) for w in wp), 1))
    return wp, info


# ---------------------------------------------------------------------------- one closed-loop run
def _drive(sc, wp, mode, kw):
    lay, cm, bay = _lot(sc)
    t0 = time.perf_counter()
    r = run(lay, cm, wp, mode=mode, bay=bay, **kw)
    ok, final = certify(bay, r)
    st = r["solver"] or {}
    return {"parked": ok, "jackknife": r["jackknife"], "limit": r["psi_limit_violated"],
            "max_psi": round(degrees(r["max_psi"]), 1), "min_clr": r["min_clearance"],
            "err_pos": round(hypot(final["lon"], final["lat"]), 2), "err_hdg": abs(final["hdg"]),
            "duration": r["duration"], "wall": round(time.perf_counter() - t0, 2),
            "solve_ms": round(st["ms"] / st["solves"], 1) if st.get("solves") else None}


def _task(args):
    kind, sc, payload = args
    if kind == "plan":
        wp, info = _plan(sc, payload)
        return kind, sc, payload, (wp, info)
    wp, mode, fam, lvl, kw = payload
    if "noise" in kw:
        kw = dict(kw, noise=dict(kw["noise"], seed=_seed(sc, mode, fam, lvl)))
    return kind, sc, (mode, fam, lvl), _drive(sc, wp, mode, kw)


def _pool(tasks, label):
    workers = int(os.environ.get("EVAL_WORKERS") or max(1, (os.cpu_count() or 4) - 2))
    out, t0, n = [], time.time(), len(tasks)
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, r in enumerate(ex.map(_task, tasks, chunksize=1), 1):
            out.append(r)
            if i % max(1, n // 20) == 0 or i == n:
                print(f"  {label}: {i}/{n}  ({time.time() - t0:.0f} s)", flush=True)
    return out


def _plans(scs, variant="ours"):
    return {r[1]: r[3] for r in _pool([("plan", sc, variant) for sc in scs], f"planning ({variant})")}


def _save(suite, data):
    os.makedirs(RES, exist_ok=True)
    with open(os.path.join(RES, f"{suite}.json"), "w") as f:
        json.dump(data, f, indent=0, separators=(",", ":"))


def _rows(results):
    return [{"scenario": list(sc), "mode": m, "family": fam, "level": lvl, **res} for _, sc, (m, fam, lvl), res in results]


# ---------------------------------------------------------------------------- suites
def suite_baselines():
    scs = scenarios()
    plans = _plans(scs)
    tasks = [("drive", sc, (plans[sc][0], m, "nominal", "", {})) for sc in scs if plans[sc][0] for m in CONTROLLERS]
    res = _pool(tasks, "baselines")
    _save("baselines", {"scenarios": len(scs), "planned": sum(1 for sc in scs if plans[sc][0]),
                        "approach": {f"{a}|{b}|{c}": _lot((a, b, c))[2]["approach"] for a, b, c in scs},
                        "rows": _rows(res)})


def suite_robust():
    scs = scenarios()
    plans = _plans(scs)
    tasks = [("drive", sc, (plans[sc][0], m, fam, lvl, kw))
             for sc in scs if plans[sc][0] for fam, lvl, kw in SWEEP for m in ROBUST_CTRL]
    tasks.sort(key=lambda t: t[2][1] != "nmpc")        # the long NMPC runs first, for a balanced pool
    res = _pool(tasks, "robustness")
    _save("robust", {"scenarios": len(scs), "rows": _rows(res)})


def suite_planner():
    scs = scenarios()
    out = {"scenarios": len(scs), "variants": {}}
    for v in PLANNERS:
        plans = _plans(scs, v)
        tasks = [("drive", sc, (plans[sc][0], "nmpc", "planner", v, {})) for sc in scs if plans[sc][0]]
        driven = {r[1]: r[3] for r in _pool(tasks, f"NMPC on {v} plans")}
        out["variants"][v] = [{"scenario": list(sc), **plans[sc][1],
                               "parked": driven[sc]["parked"] if sc in driven else False} for sc in scs]
    _save("planner", out)


# ---------------------------------------------------------------------------- report
def _load(suite):
    p = os.path.join(RES, f"{suite}.json")
    return json.load(open(p)) if os.path.exists(p) else None


def _pct(k, n):
    return f"{k}/{n} ({100.0 * k / n:.0f}%)" if n else "-"


def _med(v, nd=1):
    v = [x for x in v if x is not None]
    return f"{float(np.median(v)):.{nd}f}" if v else "-"


def report():
    lines = ["# Benchmark: baselines, ablations and robustness", "",
             "Generated by `python -m sim.evaluate report` from `eval/results/`. Scenarios: the library's free bays "
             "(four templates, fill seeds 0-5). PARKED = passes the library's certification on the true state: no "
             "jackknife, |psi| never above 60 deg, never within 0.10 m of anything, parked within 0.8 m / 10 deg / "
             "12 deg. Every controller drives the same plan; first attempts only (no second attempt).", ""]
    figs = []
    b = _load("baselines")
    if b:
        rows = b["rows"]
        rev = {k for k, a in b["approach"].items() if a == "reverse"}
        key = lambda r: "|".join(map(str, r["scenario"]))
        lines += ["## 1. Controllers on the same plans", "",
                  f"{b['planned']} of {b['scenarios']} bays planned; {len(rev)} are reverse-in bays.", "",
                  "| Controller | Parked | Parked, reverse-in bays | Jackknife | Hitch limit broken | Peak hitch, median (deg) "
                  "| Parked error, median (m) | Solve time per step, median (ms) |",
                  "|---|---|---|---|---|---|---|---|"]
        for m, label in CONTROLLERS.items():
            rs = [r for r in rows if r["mode"] == m]
            rr = [r for r in rs if key(r) in rev]
            lines.append(f"| {label} | {_pct(sum(r['parked'] for r in rs), len(rs))} | "
                         f"{_pct(sum(r['parked'] for r in rr), len(rr))} | {sum(r['jackknife'] for r in rs)} | "
                         f"{sum(r['limit'] for r in rs)} | {_med([r['max_psi'] for r in rs])} | "
                         f"{_med([r['err_pos'] for r in rs if r['parked']], 2)} | {_med([r['solve_ms'] for r in rs])} |")
        lines.append("")
    rb = _load("robust")
    if rb:
        rows = rb["rows"]
        lines += ["## 2. Robustness sweep", "",
                  "NMPC and the cascade controller drive the same plans while the world differs from the model. Noise: "
                  "white Gaussian error on the measured state every control period (position / heading and hitch angle, "
                  "1 sigma). Trailer length: the real trailer is longer or shorter than the model (the planner and "
                  "controllers keep the model). Steering delay: the actuator starts moving that late. Hitch push: the hitch "
                  "angle is knocked further the way it leans, 3 s into the approach into the bay.", "",
                  "| Condition | Level | NMPC parked | Cascade parked | NMPC jackknife / limit | Cascade jackknife / limit |",
                  "|---|---|---|---|---|---|"]
        fams = []
        for fam, lvl, _ in SWEEP:
            if fam not in fams:
                fams.append(fam)
            cells = []
            for m in ROBUST_CTRL:
                rs = [r for r in rows if r["mode"] == m and r["family"] == fam and r["level"] == lvl]
                cells.append((_pct(sum(r["parked"] for r in rs), len(rs)),
                              f"{sum(r['jackknife'] for r in rs)} / {sum(r['limit'] for r in rs)}"))
            nlbl = f"{lvl}: {NOISE[lvl][0]:g} m, {NOISE[lvl][1]:g} deg" if fam == "noise" else lvl
            lines.append(f"| {fam} | {nlbl} | {cells[0][0]} | {cells[1][0]} | {cells[0][1]} | {cells[1][1]} |")
        lines.append("")
        figs.append(_robust_figure(rows, fams))
    pl = _load("planner")
    if pl:
        lines += ["## 3. Planner ablations", "",
                  "Fixed-steering primitives: the textbook Hybrid A* motion primitive (constant steering along each 2 m "
                  "arc) in place of ours (steer to a hitch-angle set-point); everything else unchanged. Heuristic weight "
                  "1: the search without the x3 weight (closer to optimal, slower). Each plan found is then driven by the "
                  "NMPC.", "",
                  "| Planner | Plan found | Parked by NMPC | Expansions, median | Plan time, median (s) | Path length, "
                  "median (m) | Gear changes, mean |", "|---|---|---|---|---|---|---|"]
        for v, label in PLANNERS.items():
            rs = pl["variants"].get(v)
            if not rs:
                continue
            fd = [r for r in rs if r["found"]]
            gc = np.mean([r["gear_changes"] for r in fd]) if fd else float("nan")
            lines.append(f"| {label} | {_pct(len(fd), len(rs))} | {_pct(sum(r['parked'] for r in rs), len(rs))} | "
                         f"{_med([r['expansions'] for r in fd], 0)} | {_med([r['plan_s'] for r in fd], 2)} | "
                         f"{_med([r.get('length_m') for r in fd])} | {gc:.2f} |")
        lines.append("")
    for f in figs:
        if f:
            lines += [f"![robustness]({f})", ""]
    os.makedirs(ROOT, exist_ok=True)
    with open(os.path.join(ROOT, "REPORT.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print("\n".join(lines))


def _robust_figure(rows, fams):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return None
    fig, axes = plt.subplots(1, len(fams), figsize=(3.2 * len(fams), 3.0), sharey=True)
    colors = {"nmpc": "#1F7A8C", "cascade": "#E8A33D"}
    for ax, fam in zip(np.atleast_1d(axes), fams):
        lvls = [lvl for f, lvl, _ in SWEEP if f == fam]
        for m in ROBUST_CTRL:
            ys = []
            for lvl in lvls:
                rs = [r for r in rows if r["mode"] == m and r["family"] == fam and r["level"] == lvl]
                ys.append(100.0 * sum(r["parked"] for r in rs) / max(1, len(rs)))
            ax.plot(range(len(lvls)), ys, "o-", color=colors[m], lw=2, label=CONTROLLERS[m])
        ax.set_xticks(range(len(lvls)), lvls, fontsize=8)
        ax.set_title(fam, fontsize=10)
        ax.set_ylim(0, 105)
        ax.grid(axis="y", color="#E6E9ED")
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
    np.atleast_1d(axes)[0].set_ylabel("bays parked (%)")
    np.atleast_1d(axes)[0].legend(frameon=False, fontsize=8, loc="lower left")
    fig.tight_layout()
    fig.savefig(os.path.join(ROOT, "robustness.png"), dpi=160)
    return "robustness.png"


SUITES = {"baselines": suite_baselines, "robust": suite_robust, "planner": suite_planner}

if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    for name in (SUITES if what == "all" else [what] if what in SUITES else []):
        t0 = time.time()
        print(f"{name}: {len(scenarios())} scenarios", flush=True)
        SUITES[name]()
        print(f"{name} done in {time.time() - t0:.0f} s", flush=True)
    if what in ("all", "report") or what in SUITES:
        report()
