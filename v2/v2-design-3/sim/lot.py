"""Parking lots as data. A layout is a bounds rectangle plus a list of bays.

World frame: x east, y north, metres, angles in radians.
Every bay stores the GOAL pose of the tractor rear axle (rig fully inside the bay, psi = 0) and a
PRE-GOAL pose on the bay axis from which a straight final approach reaches the goal.

`theta` of a bay is the direction the tractor faces once parked; `u = (cos theta, sin theta)`.
  approach == "reverse": truck backs in along -u, pre-goal sits ahead of the goal (goal + s*u)
  approach == "forward": truck pulls in along +u, pre-goal sits behind the goal (goal - s*u)

The yard is sized for the rig that parks in it (every parked truck is the same model). The numbers below are for the
default rig; a longer rig, or one that needs a wider turn, gets longer bays and a proportionally roomier yard
(`Yard`), and the default rig gets exactly these numbers.
"""
from math import cos, sin, radians, pi, degrees
import random

from .model import VEH, rig_back, rig_front
from .planner import tuning

RIG_BACK = rig_back(VEH)      # 9.5: trailer tail behind tractor rear axle when straight
RIG_FRONT = rig_front(VEH)    # 5.0: tractor nose ahead of rear axle
RIG_LEN = RIG_BACK + RIG_FRONT
RIG_MID = (RIG_FRONT - RIG_BACK) / 2.0   # -2.25 : rig centre relative to rear axle

BAY_W = 4.2
BAY_L = 18.0
BAY_SPARE = BAY_L - RIG_LEN   # 3.5 m of bay beyond the rig
LEAD_EXTRA = 12.0   # straight, settled run into the bay = pre_dist + this (errors decay ~e-fold per 4 m)
PRE_DIST = 8.0      # length of the straight final approach


class Yard:
    """Rig-dependent sizes of a lot. `k` >= 1 scales the room to manoeuvre with the rig's length or its trailer's
    turning radius, whichever outgrows the default rig more."""

    def __init__(self, veh=VEH):
        self.veh = veh
        self.front, self.back = rig_front(veh), rig_back(veh)
        self.length = self.front + self.back
        self.mid = (self.front - self.back) / 2.0
        self.bay_l = max(BAY_L, self.length + BAY_SPARE)
        self.k = max(1.0, self.length / RIG_LEN, tuning(veh).rho / tuning(VEH).rho)


LAYOUT_NAMES = {
    "cross": "Cross (90 deg)",
    "angled": "Angled (60 deg)",
    "parallel": "Parallel",
    "tandem": "Tandem (in-line)",
}


def _bay(yd, idx, mouth, theta, approach, width=BAY_W, length=None, pre_dist=PRE_DIST, lead=None, lead_extra=None):
    """mouth = centre of the open end of the bay; interior extends along -u for `length` (default: the yard's)."""
    length = yd.bay_l if length is None else length
    ux, uy = cos(theta), sin(theta)
    cx, cy = mouth[0] - ux * length / 2, mouth[1] - uy * length / 2
    # tractor rear axle for a rig centred in the bay
    gx, gy = cx - yd.mid * ux, cy - yd.mid * uy
    s = pre_dist
    lead = pre_dist + (LEAD_EXTRA if lead_extra is None else lead_extra) * yd.k if lead is None else lead
    sign = 1 if approach == "reverse" else -1
    return {
        "id": idx, "cx": cx, "cy": cy, "theta": theta, "w": width, "l": length,
        "approach": approach, "lead": lead,
        "goal": [gx, gy, theta],
        "pre": [gx + sign * s * ux, gy + sign * s * uy, theta],
        "occupied": False, "parked": None,
    }


def _rect_poly(cx, cy, th, length, width, mid=0.0):
    c, s = cos(th), sin(th)
    hl, hw = length / 2, width / 2
    pts = [(-hl, -hw), (hl, -hw), (hl, hw), (-hl, hw)]
    return [[cx + (px + mid) * c - py * s, cy + (px + mid) * s + py * c] for px, py in pts]


def _layout_cross(yd, n_per_row=5, angle=90.0):
    a = radians(angle)
    aisle = (34.0 if angle >= 89.0 else 40.0) * yd.k    # roomy yard apron: gentle, low-hitch-angle manoeuvres fit
    pitch = BAY_W / sin(a)
    bays, i = [], 0
    for row in (+1, -1):
        for k in range(n_per_row):
            x = 4.0 + k * pitch
            edge_y = row * aisle / 2
            th = -row * a          # top row faces down (-y), bottom row faces up
            bays.append(_bay(yd, i, (x, edge_y), th, "reverse", lead_extra=12.0 if angle >= 89.0 else 6.0))
            i += 1
    return aisle, bays


def _layout_parallel(yd, n_per_row=5):
    L = 36.0 * yd.k                            # an articulated rig needs ~2.5x its length to parallel-park
    aisle, pitch, bays, i = 32.0 * yd.k, L + 1.0, [], 0
    for row in (+1, -1):
        for k in range(n_per_row):
            x0 = 2.0 + k * pitch
            # long axis along x; mouth is the +x end so the truck reverses in westwards
            bays.append(_bay(yd, i, (x0 + L, row * (aisle / 2 + BAY_W / 2)), 0.0, "reverse",
                             length=L, pre_dist=3.0, lead_extra=4.0))
            i += 1
    return aisle, bays


def _layout_tandem(yd, n_per_lane=5):
    aisle, pitch, bays, i = 14.0, yd.bay_l + 1.5, [], 0
    for row in (+1, -1):
        for k in range(n_per_lane):
            x0 = 2.0 + k * pitch
            # slots end to end; truck pulls in forward along +x, mouth is the -x end
            bays.append(_bay(yd, i, (x0, row * aisle / 2), 0.0, "forward", lead_extra=4.0))
            # _bay puts the interior along -u, so flip: place by explicit centre
            b = bays[-1]
            cx, cy = x0 + yd.bay_l / 2, row * aisle / 2
            gx, gy = cx - yd.mid, cy
            b.update(cx=cx, cy=cy, goal=[gx, gy, 0.0], pre=[gx - PRE_DIST, gy, 0.0])
            i += 1
    return aisle, bays


_BUILDERS = {
    "cross": lambda yd: _layout_cross(yd, 5, 90.0),
    "angled": lambda yd: _layout_cross(yd, 5, 60.0),
    "parallel": _layout_parallel,
    "tandem": _layout_tandem,
}


def _park(b, rng, yd):
    """Put a parked rig in bay b, slightly off-centre and off-angle like a real driver leaves it."""
    b["occupied"] = True
    th = b["theta"] + radians(rng.uniform(-1.5, 1.5))
    u = (cos(b["theta"]), sin(b["theta"]))
    n = (-u[1], u[0])
    lat, lon = rng.uniform(-0.35, 0.35), rng.uniform(-0.8, 0.8)
    cx = b["cx"] + n[0] * lat + u[0] * lon
    cy = b["cy"] + n[1] * lat + u[1] * lon
    L, W = yd.length, yd.veh.width
    b["parked"] = {"cx": cx, "cy": cy, "theta": th, "l": L, "w": W, "poly": _rect_poly(cx, cy, th, L, W)}


def build_layout(name, seed=0, fill=0.55, occupied=None, veh=VEH):
    """Layout `name` sized for the rig `veh`, with a seeded random fill of parked rigs, or with exactly the bays in
    `occupied`. Which bays are filled depends only on the seed, never on the rig.

    With `occupied`, rigs that the seeded fill also parks keep their exact pose and only the bays that
    differ change, so editing a lot moves nothing but the truck that was clicked."""
    yd = Yard(veh)
    if occupied is not None:
        base = build_layout(name, seed, fill, veh=veh)
        occ = {int(i) for i in occupied}
        if not occ <= set(range(len(base["bays"]))):
            raise ValueError(f"bay ids out of range for {name}: {sorted(occ)}")
        for b in base["bays"]:
            if b["id"] in occ and not b["occupied"]:
                _park(b, random.Random(f"{name}:{seed}:{b['id']}"), yd)
            elif b["id"] not in occ and b["occupied"]:
                b["occupied"], b["parked"] = False, None
        base["obstacles"] = [b["parked"]["poly"] for b in base["bays"] if b["occupied"]]
        return base

    aisle, bays = _BUILDERS[name](yd)

    # bounds: everything (bays + entry road, with the rig at the gate) with a small margin
    xs, ys = [min(-34.0, -24.5 - yd.back)], []
    for b in bays:
        for px, py in _rect_poly(b["cx"], b["cy"], b["theta"], b["l"], b["w"]):
            xs.append(px); ys.append(py)
    ys += [-aisle / 2, aisle / 2]
    bounds = {"xmin": min(xs), "xmax": max(xs) + 14.0,
              "ymin": min(ys) - 4.0, "ymax": max(ys) + 4.0}

    # seeded random fill (at least 3 bays left free)
    rng = random.Random(seed)
    if name == "tandem":
        # trucks queue: each lane fills from its far end, so free slots stay reachable
        per = len(bays) // 2
        free = set()
        for lane in range(2):
            n_occ = rng.randint(1, 3)
            free |= {lane * per + k for k in range(per - n_occ)}
    else:
        free_target = max(3, round(len(bays) * (1 - fill)))
        order = list(range(len(bays)))
        rng.shuffle(order)
        free = set(order[:free_target])
    for b in bays:
        if b["id"] not in free:
            _park(b, rng, yd)

    return {
        "name": name, "label": LAYOUT_NAMES[name], "seed": seed,
        "aisle": aisle, "bounds": bounds, "bays": bays,
        "start": [-16.0, 0.0, 0.0, 0.0],   # gate pose: x1, y1, th0, psi
        "obstacles": [b["parked"]["poly"] for b in bays if b["occupied"]],
    }
