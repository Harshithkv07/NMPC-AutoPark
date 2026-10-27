"""Driver advisory: turn a closed-loop run into a short list of instructions a human can execute.

The NMPC commands a road-wheel angle every 0.25 s. Nobody can follow that, so we segment the run
into phases of near-constant steering and report, per phase:

    gear / speed (km/h)      from the speed schedule
    steering-wheel turns     road-wheel angle x steering ratio, quantised to quarter turns
    hold for (m, s)          distance and time until the next change
    hitch angle margin       peak |psi| against the hard limit psi_crit

Steering ratio 20:1 means full lock (35 deg) is 1.75 turns each way.
"""
from math import degrees, floor
import numpy as np

from .model import VEH

RATIO = 20.0           # steering wheel degrees per road-wheel degree
MIN_SEG_M = 4.0        # shorter phases are merged into a neighbour
MERGE_TURNS = 0.55     # neighbouring phases within this many wheel turns read as one instruction
MERGE_MAX_M = 24.0
DEAD = 0.2             # |turns| below this reads as "wheel straight"
STOP_V = 0.06          # m/s below which the rig counts as stopped

_FRAC = {0: "", 1: "¼", 2: "½", 3: "¾"}


def lock_turns(veh=VEH):
    """Wheel turns from which an instruction reads "full lock": the last whole quarter turn before the lock
    (1.75 of the 1.94 turns of a 35 deg lock)."""
    return floor(degrees(veh.delta_max) * RATIO / 360.0 * 4 + 1e-6) / 4


def turns_text(turns, lock=1.75):
    """0.75 -> '¾ turn', 1.25 -> '1¼ turns'. Sign is handled by the caller. `lock`: see lock_turns."""
    q = round(abs(turns) * 4) / 4
    whole, frac = int(q), int(round((q - int(q)) * 4))
    if q == 0:
        return "straight"
    if q >= lock:
        return "full lock"
    if whole == 0:
        return f"{_FRAC[frac]} turn"
    return f"{whole}{_FRAC[frac]} turn" + ("s" if q > 1 else "")


def _quant(turns):
    if abs(turns) < DEAD:
        return 0.0
    return round(turns * 4) / 4


def speed_word(kmh):
    return "crawl" if kmh < 2.5 else "slow" if kmh < 4.5 else "steady"


def advise(frames, veh=VEH):
    """frames: run() output frames (0.1 s). Returns list of step dicts in driving order."""
    t = np.array([f["t"] for f in frames])
    v = np.array([f["v"] for f in frames])
    dl = np.array([f["delta"] for f in frames])
    psi = np.array([abs(f["psi"]) for f in frames])
    dt = np.diff(t, prepend=t[0])
    dist_inc = np.abs(v) * dt
    cum = np.cumsum(dist_inc)
    n = len(frames)

    # smooth the steering over ~1 s so single-sample jitter does not create phases
    k = 10
    ker = np.ones(k) / k
    dl_s = np.convolve(np.pad(dl, (k // 2, k - k // 2 - 1), mode="edge"), ker, mode="valid")
    turns = np.degrees(dl_s) * RATIO / 360.0

    moving = np.abs(v) > STOP_V
    gear = np.where(v > 0, 1, -1)

    # 1) split into drive runs (contiguous moving frames with the same gear)
    runs, i = [], 0
    while i < n:
        if not moving[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and moving[j + 1] and gear[j + 1] == gear[i]:
            j += 1
        runs.append((i, j, int(gear[i])))
        i = j + 1

    steps = []
    for (a, b, g) in runs:
        # 2) within a run: phases of constant quantised steering
        q = np.array([_quant(x) for x in turns[a:b + 1]])
        segs, s0 = [], 0
        for m in range(1, len(q) + 1):
            if m == len(q) or q[m] != q[s0]:
                segs.append([a + s0, a + m - 1])
                s0 = m
        # 3) merge short phases into the neighbour whose steering is closer
        def seg_len(sg):
            return cum[sg[1]] - cum[sg[0]]
        changed = True
        while changed and len(segs) > 1:
            changed = False
            for idx, sg in enumerate(segs):
                if seg_len(sg) < MIN_SEG_M:
                    if idx == 0:
                        tgt = 1
                    elif idx == len(segs) - 1:
                        tgt = idx - 1
                    else:
                        cur = np.mean(turns[sg[0]:sg[1] + 1])
                        l = np.mean(turns[segs[idx - 1][0]:segs[idx - 1][1] + 1])
                        r = np.mean(turns[segs[idx + 1][0]:segs[idx + 1][1] + 1])
                        tgt = idx - 1 if abs(cur - l) <= abs(cur - r) else idx + 1
                    lo, hi = sorted((idx, tgt))
                    segs[lo:hi + 1] = [[segs[lo][0], segs[hi][1]]]
                    changed = True
                    break
        # 4) merge neighbours that read as the same instruction (within half a wheel turn)
        def mean_turns_of(sg):
            return float(np.average(turns[sg[0]:sg[1] + 1], weights=np.maximum(np.abs(v[sg[0]:sg[1] + 1]), 1e-3)))
        merged = [list(sg) for sg in segs]
        changed = True
        while changed and len(merged) > 1:
            changed = False
            for idx in range(len(merged) - 1):
                a_, b_ = merged[idx], merged[idx + 1]
                same_side = (mean_turns_of(a_) * mean_turns_of(b_) >= 0) or min(abs(mean_turns_of(a_)), abs(mean_turns_of(b_))) < DEAD
                close = abs(mean_turns_of(a_) - mean_turns_of(b_)) < MERGE_TURNS
                if close and same_side and (cum[b_[1]] - cum[a_[0]]) < MERGE_MAX_M:
                    merged[idx:idx + 2] = [[a_[0], b_[1]]]
                    changed = True
                    break
        for sg in merged:
            i0, i1 = sg
            mean_turns = float(np.average(turns[i0:i1 + 1], weights=np.maximum(np.abs(v[i0:i1 + 1]), 1e-3)))
            qt = _quant(mean_turns)
            kmh = float(np.mean(np.abs(v[i0:i1 + 1]))) * 3.6
            steps.append({
                "kind": "drive", "gear": g, "t0": float(t[i0]), "t1": float(t[i1]),
                "dist": float(cum[i1] - cum[i0]), "s0": float(cum[i0]),
                "speed_kmh": round(kmh, 1), "turns": qt,
                "side": "straight" if qt == 0 else ("left" if qt > 0 else "right"),
                "peak_psi": float(degrees(psi[i0:i1 + 1].max())),
            })

    # 5) stops between drive runs and at the end
    out = []
    for idx, st in enumerate(steps):
        if idx > 0 and st["gear"] != steps[idx - 1]["gear"]:
            out.append({"kind": "stop", "gear": 0, "t0": steps[idx - 1]["t1"], "t1": st["t0"], "dist": 0.0,
                        "s0": steps[idx - 1]["s0"] + steps[idx - 1]["dist"], "speed_kmh": 0.0,
                        "turns": 0.0, "side": "straight", "peak_psi": 0.0, "engage": st["gear"]})
        out.append(st)
    if out:
        last = out[-1]
        out.append({"kind": "stop", "gear": 0, "t0": last["t1"], "t1": float(t[-1]), "dist": 0.0,
                    "s0": last["s0"] + last["dist"], "speed_kmh": 0.0, "turns": 0.0, "side": "straight",
                    "peak_psi": 0.0, "final": True})

    _label(out)
    lim, lock = degrees(veh.psi_crit), lock_turns(veh)
    for i, st in enumerate(out):
        st["id"] = i
        st["margin_deg"] = round(lim - st["peak_psi"], 1) if st["kind"] == "drive" else None
        st["text"] = _sentence(st, lock)
    return out


def _label(steps):
    """Give each drive step a role in the manoeuvre and a plain-language label."""
    drives = [s for s in steps if s["kind"] == "drive"]
    n_rev = sum(1 for s in drives if s["gear"] < 0)
    r, prev = 0, None
    for i, s in enumerate(drives):
        if s["gear"] > 0:
            if s["side"] == "straight":
                s["label"] = "Drive forward to the set-up point"
            else:
                s["label"] = f"Pull forward, steer {s['side']}"
            prev = None
            continue
        r += 1
        if r == 1:
            s["label"] = "Begin reversing" if s["side"] == "straight" else f"Begin reversing, steer {s['side']}"
        elif s["side"] == "straight":
            s["label"] = "Back straight in" if r == n_rev else "Straighten the wheel"
        elif prev is not None and prev != "straight" and s["side"] != prev:
            s["label"] = f"Counter-steer {s['side']}, bring the trailer round"
        elif prev == s["side"]:
            s["label"] = f"Keep steering {s['side']}"
        else:
            s["label"] = f"Steer {s['side']}"
        prev = s["side"]
    for s in steps:
        if s["kind"] == "stop":
            s["label"] = "Stop, you're parked" if s.get("final") else "Stop, select " + ("reverse" if s.get("engage", 0) < 0 else "drive")


def _sentence(s, lock=1.75):
    if s["kind"] == "stop":
        return s["label"]
    gear = "Forward" if s["gear"] > 0 else "Reverse"
    wheel = "wheel straight" if s["side"] == "straight" else f"{turns_text(s['turns'], lock)} {s['side']}"
    return (f"{gear}, {speed_word(s['speed_kmh'])} ({s['speed_kmh']:.0f} km/h) · {wheel} "
            f"· {s['dist']:.0f} m · hitch peaks {s['peak_psi']:.0f}°")
