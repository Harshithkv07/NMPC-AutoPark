"""Yards drawn by the user: any size, bays anywhere, rectangular obstacles and a start pose.

A spec is plain JSON in metres and degrees, exactly what the viewer's layout editor saves:

  {"label": "My yard",
   "size": {"w": 120, "h": 80},                       the yard: x in [0, w], y in [0, h]
   "start": [x, y, heading],                          tractor rear axle and heading at the start, hitch straight
   "bays": [{"cx", "cy", "theta", "approach": "reverse" | "forward", "w"?, "l"?}],
   "obstacles": [{"cx", "cy", "w", "l", "theta"}]}    rectangles: l along theta, w across

A bay's theta is the direction the tractor faces once parked (as in sim/lot.py). A reverse bay is open at +u, so the
truck backs in; a forward bay is open at -u, so it pulls in. A bay without w / l gets the template size for the rig.

`build_custom` returns the same layout dict as sim/lot.py:build_layout, so the planner, the NMPC, the certification and
the export take it unchanged. `validate` lists what is wrong with a spec; the server refuses a spec that has problems.
"""
import hashlib
import json
import random
from math import cos, sin, radians

import numpy as np

from .collision import CollisionMap
from .lot import BAY_W, PRE_DIST, Yard, _park, _rect_poly
from .model import VEH

SIZE_LIM = (30.0, 300.0)       # yard side, m
MAX_BAYS, MAX_OBSTACLES = 40, 80
MIN_RUN_IN = 3.0               # free straight run in front of a bay's mouth, m
RUN_IN = {"reverse": 6.0, "forward": 8.0}   # at most this much run-in beyond the mouth (x Yard.k), as the templates use
START_CLEAR = 0.3              # the rig at the start must be at least this far from everything, m


def _num(d, key, lo=-1e9, hi=1e9, default=None, what="value"):
    v = d.get(key, default)
    if v is None:
        raise ValueError(f"{what}: {key} is missing")
    v = float(v)
    if not np.isfinite(v) or not lo <= v <= hi:
        raise ValueError(f"{what}: {key} = {v:g} is outside {lo:g}-{hi:g}")
    return v


def parse(spec):
    """The spec with every number checked and converted to float (angles stay in degrees). Raises ValueError."""
    if not isinstance(spec, dict):
        raise ValueError("the layout must be an object")
    size = spec.get("size") or {}
    if not isinstance(size, dict):
        raise ValueError("size must be {w, h}")
    W, H = _num(size, "w", *SIZE_LIM, what="yard"), _num(size, "h", *SIZE_LIM, what="yard")
    st = spec.get("start")
    if not isinstance(st, (list, tuple)) or len(st) != 3:
        raise ValueError("start must be [x, y, heading]")
    start = [float(st[0]), float(st[1]), float(st[2])]
    bays_in, obs_in = spec.get("bays") or [], spec.get("obstacles") or []
    if not isinstance(bays_in, list) or not isinstance(obs_in, list):
        raise ValueError("bays and obstacles must be lists")
    if not bays_in:
        raise ValueError("the yard has no bays")
    if len(bays_in) > MAX_BAYS or len(obs_in) > MAX_OBSTACLES:
        raise ValueError(f"at most {MAX_BAYS} bays and {MAX_OBSTACLES} obstacles")
    bays = []
    for i, b in enumerate(bays_in):
        what = f"bay {i + 1}"
        if not isinstance(b, dict):
            raise ValueError(f"{what} must be an object")
        ap = b.get("approach", "reverse")
        if ap not in ("reverse", "forward"):
            raise ValueError(f"{what}: approach must be 'reverse' or 'forward'")
        bays.append({"cx": _num(b, "cx", what=what), "cy": _num(b, "cy", what=what), "theta": _num(b, "theta", what=what),
                     "approach": ap,
                     "w": None if b.get("w") is None else _num(b, "w", 2.0, 10.0, what=what),
                     "l": None if b.get("l") is None else _num(b, "l", 5.0, 80.0, what=what)})
    obstacles = []
    for i, o in enumerate(obs_in):
        what = f"obstacle {i + 1}"
        if not isinstance(o, dict):
            raise ValueError(f"{what} must be an object")
        obstacles.append({"cx": _num(o, "cx", what=what), "cy": _num(o, "cy", what=what),
                          "w": _num(o, "w", 0.2, 300.0, what=what), "l": _num(o, "l", 0.2, 300.0, what=what),
                          "theta": _num(o, "theta", default=0.0, what=what)})
    label = str(spec.get("label") or "Custom yard")[:60]
    return {"label": label, "size": {"w": W, "h": H}, "start": start, "bays": bays, "obstacles": obstacles}


def digest(spec):
    """A short stable id for a spec: the same drawing always parks its trucks the same way."""
    return hashlib.sha1(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:10]


def _poly(cx, cy, th, l, w):
    return _rect_poly(cx, cy, th, l, w)


def _overlap(p, q):
    """Separating-axis test for two convex polygons (lists of corners)."""
    for poly in (p, q):
        n = len(poly)
        for i in range(n):
            ax, ay = poly[i]
            bx, by = poly[(i + 1) % n]
            nx, ny = by - ay, ax - bx
            a = [nx * x + ny * y for x, y in p]
            b = [nx * x + ny * y for x, y in q]
            if max(a) <= min(b) or max(b) <= min(a):
                return False
    return True


def _bay_geometry(b, yd):
    """Centre, heading (rad), size, unit axis and the goal pose of the tractor rear axle for a parsed bay."""
    th = radians(b["theta"])
    w = BAY_W if b["w"] is None else b["w"]
    l = yd.bay_l if b["l"] is None else b["l"]
    ux, uy = cos(th), sin(th)
    goal = [b["cx"] - yd.mid * ux, b["cy"] - yd.mid * uy, th]
    return th, w, l, ux, uy, goal


def _run_in(cm, bay, yd, veh, bounds):
    """Free straight length (m) in front of a bay's mouth, along its axis, for a corridor as wide as the rig."""
    th, l = bay["theta"], bay["l"]
    s = 1.0 if bay["approach"] == "reverse" else -1.0
    ux, uy = cos(th) * s, sin(th) * s
    mx, my = bay["cx"] + ux * l / 2, bay["cy"] + uy * l / 2
    need = veh.width / 2 + 0.2
    d = np.arange(0.5, 60.0, 0.5)
    x, y = mx + ux * d, my + uy * d
    ok = ((x > bounds["xmin"]) & (x < bounds["xmax"]) & (y > bounds["ymin"]) & (y < bounds["ymax"])
          & (cm.sdf_at(x, y) > need))
    blocked = np.flatnonzero(~ok)
    n = int(blocked[0]) if blocked.size else len(d)       # samples free before the first blocked one
    return float(d[n - 1]) if n else 0.0


def _lead(bay, free, yd, veh):
    """Run-in for the planner's final straight shot, measured from the trailer axle at the goal (planner.search uses
    it that way): the part inside the bay plus what is free beyond the mouth, capped as in the templates."""
    l, mid = bay["l"], yd.mid
    inside = (l / 2 + mid - veh.d + veh.L2) if bay["approach"] == "reverse" else (l / 2 - mid + veh.d - veh.L2)
    beyond = max(0.0, min(free - 1.0, RUN_IN[bay["approach"]] * yd.k))
    return inside + beyond


def _assemble(p, occupied, veh):
    yd = Yard(veh)
    W, H = p["size"]["w"], p["size"]["h"]
    bounds = {"xmin": 0.0, "xmax": W, "ymin": 0.0, "ymax": H}
    tag = digest(p)
    occ = set() if occupied is None else {int(i) for i in occupied}
    if not occ <= set(range(len(p["bays"]))):
        raise ValueError(f"bay ids out of range: {sorted(occ)}")
    bays = []
    for i, b in enumerate(p["bays"]):
        th, w, l, ux, uy, goal = _bay_geometry(b, yd)
        sign = 1 if b["approach"] == "reverse" else -1
        bay = {"id": i, "cx": b["cx"], "cy": b["cy"], "theta": th, "w": w, "l": l, "approach": b["approach"],
               "lead": None, "goal": goal, "pre": [goal[0] + sign * PRE_DIST * ux, goal[1] + sign * PRE_DIST * uy, th],
               "occupied": False, "parked": None}
        if i in occ:
            _park(bay, random.Random(f"custom:{tag}:{i}"), yd)
        bays.append(bay)
    blocks = [{"cx": o["cx"], "cy": o["cy"], "theta": radians(o["theta"]), "l": o["l"], "w": o["w"],
               "poly": _poly(o["cx"], o["cy"], radians(o["theta"]), o["l"], o["w"])} for o in p["obstacles"]]
    lay = {"name": "custom", "label": p["label"], "seed": 0, "aisle": None, "bounds": bounds, "bays": bays,
           "start": [p["start"][0], p["start"][1], radians(p["start"][2]), 0.0],
           "obstacles": [o["poly"] for o in blocks] + [b["parked"]["poly"] for b in bays if b["occupied"]],
           "blocks": blocks, "drawn": True, "spec_id": tag}
    return lay, yd


def build_custom(spec, occupied=None, veh=VEH):
    """The layout dict for a spec (see sim/lot.py:build_layout), with each bay's run-in measured in the drawn yard."""
    p = parse(spec)
    lay, yd = _assemble(p, occupied, veh)
    cm = CollisionMap(lay, veh)
    for b in lay["bays"]:
        b["lead"] = _lead(b, _run_in(cm, b, yd, veh, lay["bounds"]), yd, veh)
    return lay


def validate(spec, veh=VEH, occupied=None):
    """What is wrong with a spec, as [{"item", "message", "severity"}]; severity is "error" for a
    problem that makes the yard unsolvable (geometric overlap, bay outside the yard, start outside
    the yard, start rig in collision) and "warn" for an advisory the solver can still try
    (tight run-in in front of a bay's mouth). The server refuses a spec that has any "error"
    entry and lets the live solver try the ones that are only warnings. A malformed spec
    (missing or non-numeric fields) raises ValueError instead."""
    p = parse(spec)
    lay, yd = _assemble(p, occupied, veh)
    out = []
    b0 = lay["bounds"]

    def inside(poly):
        return all(b0["xmin"] - 1e-6 <= x <= b0["xmax"] + 1e-6 and b0["ymin"] - 1e-6 <= y <= b0["ymax"] + 1e-6 for x, y in poly)

    shrink = 0.05                                           # neighbouring bays may share a line
    bay_polys = [_poly(b["cx"], b["cy"], b["theta"], b["l"] - 2 * shrink, b["w"] - 2 * shrink) for b in lay["bays"]]
    need_l, need_w = yd.length + 1.0, veh.width + 0.8
    for i, b in enumerate(lay["bays"]):
        name = f"bay {i + 1}"
        if b["l"] < need_l - 1e-9:
            out.append({"item": name, "severity": "error",
                        "message": f"{b['l']:.1f} m long: this rig needs at least {need_l:.1f} m"})
        if b["w"] < need_w - 1e-9:
            out.append({"item": name, "severity": "error",
                        "message": f"{b['w']:.1f} m wide: this rig needs at least {need_w:.1f} m"})
        if not inside(_poly(b["cx"], b["cy"], b["theta"], b["l"], b["w"])):
            out.append({"item": name, "severity": "error", "message": "reaches outside the yard"})
        for j, o in enumerate(lay["blocks"]):
            if _overlap(bay_polys[i], o["poly"]):
                out.append({"item": name, "severity": "error", "message": f"overlaps obstacle {j + 1}"})
        for j in range(i):
            if _overlap(bay_polys[i], bay_polys[j]):
                out.append({"item": name, "severity": "error", "message": f"overlaps bay {j + 1}"})
    for j, o in enumerate(lay["blocks"]):
        if not (b0["xmin"] <= o["cx"] <= b0["xmax"] and b0["ymin"] <= o["cy"] <= b0["ymax"]):
            out.append({"item": f"obstacle {j + 1}", "severity": "error", "message": "its centre is outside the yard"})
    sx, sy = lay["start"][0], lay["start"][1]
    if not (b0["xmin"] <= sx <= b0["xmax"] and b0["ymin"] <= sy <= b0["ymax"]):
        out.append({"item": "start", "severity": "error", "message": "the start pose is outside the yard"})
    cm = CollisionMap(lay, veh)
    if cm.clearance(tuple(lay["start"])) < START_CLEAR:
        out.append({"item": "start", "severity": "error",
                    "message": "the rig at the start overlaps an obstacle, a parked truck or the yard edge"})
    for b in lay["bays"]:
        if b["occupied"]:
            continue
        free = _run_in(cm, b, yd, veh, b0)
        if free < MIN_RUN_IN:
            # advisory, not a reject: the live planner will try a curved approach, and short run-ins
            # often do work when the rig enters from an angle. The solver still has to certify.
            out.append({"item": f"bay {b['id'] + 1}", "severity": "warn",
                        "message": f"only {free:.1f} m free in front of its mouth: the planner will try an angled approach"})
    return out
