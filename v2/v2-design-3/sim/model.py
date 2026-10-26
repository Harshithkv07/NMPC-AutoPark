"""Tractor-trailer kinematics (PPT slide 9 / Word doc).

State  X = [x1, y1, th0, psi]   x1,y1: tractor rear-axle centre, th0: tractor heading,
                                psi = th0 - th1: hitch angle (tractor minus trailer heading)
Input  U = [v, delta]           v: rear-axle speed (negative = reverse), delta: front steer angle

    x1'  = v cos th0
    y1'  = v sin th0
    th0' = v/L1 tan(delta)
    psi' = v [ tan(delta)/L1 - sin(psi)/L2 - d/(L1 L2) tan(delta) cos(psi) ]

d is the distance the hitch (fifth wheel) sits AHEAD of the tractor rear axle.
Scalar math (not numpy) is used in the hot path: the NMPC calls this thousands of times.
"""
from dataclasses import dataclass, replace
from math import cos, sin, tan, radians, degrees, pi

import numpy as np


@dataclass(frozen=True)
class Vehicle:
    L1: float = 4.0            # tractor wheelbase
    L2: float = 8.0            # hitch -> trailer axle
    d: float = 0.5             # hitch ahead of tractor rear axle
    width: float = 2.5
    tractor_front: float = 1.0  # front bumper ahead of front axle
    tractor_rear: float = 1.0   # tractor tail behind rear axle
    trailer_front: float = 0.3  # trailer nose ahead of hitch
    trailer_rear: float = 2.0   # trailer tail behind trailer axle
    delta_max: float = radians(35.0)   # steering lock
    psi_crit: float = radians(60.0)    # hard safety limit enforced by NMPC
    psi_jack: float = radians(75.0)    # physical jackknife (tractor/trailer contact)
    v_max: float = 2.0                 # m/s (~7 km/h) yard speed


VEH = Vehicle()

# What the viewer may change, and the range the planner and the yard are sized for. Lengths in metres, angles in
# DEGREES (the viewer edits whole degrees, and radians(35.0) is exactly the default, so an unchanged rig stays VEH).
EDITABLE = {
    "L1": (3.0, 6.5),
    "L2": (5.0, 13.0),
    "d": (0.0, 1.2),
    "delta_max": (25.0, 45.0),
    "psi_crit": (45.0, 65.0),
    "psi_jack": (50.0, 85.0),
}
ANGLES = ("delta_max", "psi_crit", "psi_jack")
JACK_GAP = 5.0          # the jackknife angle must sit at least this far (deg) above the hitch limit


def vehicle_from(spec):
    """The Vehicle for a viewer spec {L1, L2, d, delta_max, psi_crit, psi_jack} (angles in degrees; any key may be
    left out to keep the default). None or {} -> VEH. Raises ValueError for unknown keys or values out of range."""
    if not spec:
        return VEH
    if not isinstance(spec, dict):
        raise ValueError("vehicle must be an object")
    unknown = set(spec) - set(EDITABLE)
    if unknown:
        raise ValueError(f"unknown vehicle parameter {sorted(unknown)[0]!r}; editable: {', '.join(EDITABLE)}")
    vals = {}
    for k, v in spec.items():
        lo, hi = EDITABLE[k]
        v = float(v)
        if not lo <= v <= hi:
            raise ValueError(f"vehicle {k} = {v:g} is outside {lo:g}-{hi:g}" + (" deg" if k in ANGLES else " m"))
        vals[k] = radians(v) if k in ANGLES else v
    veh = replace(VEH, **vals)
    if degrees(veh.psi_jack) < degrees(veh.psi_crit) + JACK_GAP - 1e-9:
        raise ValueError(f"the jackknife angle must be at least {JACK_GAP:g} deg above the hitch limit")
    return veh


def vehicle_json(veh=VEH):
    """The vehicle as the lot files carry it (angles in radians)."""
    return {"L1": veh.L1, "L2": veh.L2, "d": veh.d, "width": veh.width,
            "tractor_front": veh.tractor_front, "tractor_rear": veh.tractor_rear,
            "trailer_front": veh.trailer_front, "trailer_rear": veh.trailer_rear,
            "delta_max": round(veh.delta_max, 4), "psi_crit": round(veh.psi_crit, 4),
            "psi_jack": round(veh.psi_jack, 4)}


def rig_front(veh=VEH):
    """Tractor nose ahead of the tractor rear axle, rig straight."""
    return veh.L1 + veh.tractor_front


def rig_back(veh=VEH):
    """Trailer tail behind the tractor rear axle, rig straight."""
    return veh.L2 - veh.d + veh.trailer_rear


def deriv(s, v, delta, veh=VEH):
    x, y, th, psi = s
    t = tan(delta)
    return (v * cos(th),
            v * sin(th),
            v / veh.L1 * t,
            v * (t / veh.L1 - sin(psi) / veh.L2 - veh.d / (veh.L1 * veh.L2) * t * cos(psi)))


def step(s, v, delta, dt, veh=VEH):
    """One RK4 step with (v, delta) held constant over dt."""
    k1 = deriv(s, v, delta, veh)
    s2 = tuple(s[i] + 0.5 * dt * k1[i] for i in range(4))
    k2 = deriv(s2, v, delta, veh)
    s3 = tuple(s[i] + 0.5 * dt * k2[i] for i in range(4))
    k3 = deriv(s3, v, delta, veh)
    s4 = tuple(s[i] + dt * k3[i] for i in range(4))
    k4 = deriv(s4, v, delta, veh)
    return tuple(s[i] + dt / 6.0 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) for i in range(4))


def step_batch(x, y, th, psi, v, tan_delta, dt, veh=VEH):
    """model.step for arrays of rigs (v and tan(delta) held over dt; any may be arrays). Same RK4:
    th0' = v tan(delta)/L1 does not depend on the state, so the th0 stages are exactly th, th + dt/2 w
    (twice) and th + dt w, and psi' depends on psi alone. Returns the new (x, y, th, psi)."""
    iL1, iL2, c_off = 1.0 / veh.L1, 1.0 / veh.L2, veh.d / (veh.L1 * veh.L2)
    w = v * iL1 * tan_delta
    a, b = tan_delta * iL1, c_off * tan_delta
    p1 = v * (a - np.sin(psi) * iL2 - b * np.cos(psi))
    q = psi + 0.5 * dt * p1
    p2 = v * (a - np.sin(q) * iL2 - b * np.cos(q))
    q = psi + 0.5 * dt * p2
    p3 = v * (a - np.sin(q) * iL2 - b * np.cos(q))
    q = psi + dt * p3
    p4 = v * (a - np.sin(q) * iL2 - b * np.cos(q))
    thm, the = th + 0.5 * dt * w, th + dt * w
    return (x + dt / 6.0 * v * (np.cos(th) + 4.0 * np.cos(thm) + np.cos(the)),
            y + dt / 6.0 * v * (np.sin(th) + 4.0 * np.sin(thm) + np.sin(the)),
            the,
            psi + dt / 6.0 * (p1 + 2 * p2 + 2 * p3 + p4))


def rollout(s0, vs, deltas, dt, veh=VEH):
    """States for a control sequence; returns array (N+1, 4)."""
    out = [tuple(s0)]
    s = tuple(s0)
    for v, d in zip(vs, deltas):
        s = step(s, v, d, dt, veh)
        out.append(s)
    return np.array(out)


def trailer_pose(s, veh=VEH):
    """Trailer axle centre and heading (th1 = th0 - psi)."""
    x, y, th, psi = s
    hx = x + veh.d * cos(th)
    hy = y + veh.d * sin(th)
    th1 = th - psi
    return hx - veh.L2 * cos(th1), hy - veh.L2 * sin(th1), th1


def _rect(cx, cy, th, back, front, width):
    """Corners of a rectangle whose long axis runs along heading th from `back` to `front`
    (measured from reference point cx,cy)."""
    c, s = cos(th), sin(th)
    hw = width / 2.0
    pts = [(-back, -hw), (front, -hw), (front, hw), (-back, hw)]
    return [(cx + px * c - py * s, cy + px * s + py * c) for px, py in pts]


def footprints(s, veh=VEH):
    """(tractor_polygon, trailer_polygon), each a list of 4 (x,y) corners."""
    x, y, th, psi = s
    tx, ty, th1 = trailer_pose(s, veh)
    tractor = _rect(x, y, th, veh.tractor_rear, veh.L1 + veh.tractor_front, veh.width)
    trailer = _rect(tx, ty, th1, veh.trailer_rear, veh.L2 + veh.trailer_front, veh.width)
    return tractor, trailer


def wrap(a):
    return (a + pi) % (2 * pi) - pi
