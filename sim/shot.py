"""Analytic expansion ("shot") for the Hybrid A* planner.

The trailer axle is a flat output of the rig: its path curvature fixes the hitch angle,
    kappa1 = tan(psi) / L2      <=>      psi = atan(L2 * kappa1)
so the trailer axle behaves like a car whose "steering angle" is psi. A shot therefore
  1. builds a Dubins path for the trailer axle to the target pose (reversed if we back in),
  2. drives the REAL rig model along it with a cascade:
        outer loop  : trailer-axle heading / lateral error -> kappa1 -> psi_des
        inner loop  : hitch regulator (planner.hitch_regulator) -> steering angle
  3. accepts the shot only if the true simulated rig ends at the target and stays clear of
     obstacles and inside the hitch limit the whole way.
"""
from math import atan, cos, sin, hypot, radians

from .dubins import dubins_words
from .model import VEH, step, trailer_pose, wrap

STEP = 0.25            # metres per simulation step
K_HEAD = 0.30          # outer loop: 1/m of curvature per rad of heading error (near critical damping with K_LAT)
K_LAT = 0.10           # outer loop: rad of desired heading error per metre of lateral error
PSI_CMD_MAX = radians(48.0)
LOOKAHEAD = 12         # path points (x STEP m) of curvature preview: cancels the hitch-loop lag
EY_ABORT = 2.5         # give up on a shot if the trailer axle strays this far from the path, m
LEAD = 7.0             # straight lead-in so the hitch angle settles to 0 before the target


def _path_points(words, rho, x0, y0, th0, step_len=STEP):
    """Sample the shortest Dubins word: returns list of (x, y, th, kappa)."""
    length, word, (t, p, q) = min(words, key=lambda w: w[0])
    x, y, th = x0, y0, th0
    pts = [(x, y, th, 0.0)]
    for kind, seg in ((word[0], t), (word[1], p), (word[2], q)):
        L = seg * rho
        n = max(1, int(L / step_len))
        ds = L / n
        k = 0.0 if kind == "S" else (1.0 / rho if kind == "L" else -1.0 / rho)
        for _ in range(n):
            if k == 0.0:
                x += ds * cos(th); y += ds * sin(th)
            else:
                nth = th + k * ds
                x += (sin(nth) - sin(th)) / k
                y += (-cos(nth) + cos(th)) / k
                th = nth
            pts.append((x, y, th, k))
    return pts


def try_shot(cm, state, target, rho, direction, hitch_regulator, psi_plan, clear,
             lat_tol=0.6, lon_lim=(-1.5, 3.0), ang_tol=radians(6.0), psi_tol=radians(8.0),
             veh=VEH, diag=None, lead=LEAD, max_len=55.0, psi_cmd=PSI_CMD_MAX):
    """Attempt a shot from `state` to the target tractor pose `target` = (x, y, th) (psi = 0).
    `psi_cmd` caps the hitch angle the outer loop may ask for (planner.tuning lowers it for a lower hitch limit).

    Returns [(state, delta), ...] on success or None."""
    tx, ty, tth = target
    ttx, tty, tth1 = trailer_pose((tx, ty, tth, 0.0), veh)
    ax, ay, ath = trailer_pose(state, veh)

    ex, ey_ = cos(tth1), sin(tth1)

    def straight(x0, y0, length):
        m = max(1, int(length / STEP))
        return [(x0 + ex * length * i / m, y0 + ey_ * length * i / m, tth1, 0.0) for i in range(m + 1)]

    if direction < 0:      # backing in: forward path target -> lead-in -> current, travelled backwards
        bx, by = ttx + ex * lead, tty + ey_ * lead
        words = dubins_words(bx, by, tth1, ax, ay, ath, rho)
        if not words:
            return None
        fwd = straight(ttx, tty, lead)[:-1] + _path_points(words, rho, bx, by, tth1)
        pts = fwd[::-1]
    else:                  # pulling in: current -> lead-in start -> straight to target
        bx, by = ttx - ex * lead, tty - ey_ * lead
        words = dubins_words(ax, ay, ath, bx, by, tth1, rho)
        if not words:
            return None
        pts = _path_points(words, rho, ax, ay, ath)[:-1] + straight(bx, by, lead)
    n = len(pts)
    if n < 3 or (n - 1) * STEP > max_len:      # a sensible back-in is one short S-curve, not a 96 m loop
        return None

    s = 1.0 if direction > 0 else -1.0
    cur = tuple(state)
    out = []
    i = 0
    max_steps = int(1.6 * n) + 20
    for _ in range(max_steps):
        ax, ay, ath = trailer_pose(cur, veh)
        # nearest reference point, searching forward from the last one
        best, bd = i, 1e18
        for j in range(i, min(n, i + 14)):
            d = (pts[j][0] - ax) ** 2 + (pts[j][1] - ay) ** 2
            if d < bd:
                best, bd = j, d
        i = best
        xr, yr, thr, kr = pts[i]
        ey = -(ax - xr) * sin(thr) + (ay - yr) * cos(thr)
        eth = wrap(ath - thr)
        if abs(ey) > EY_ABORT:
            if diag is not None: diag["why"] = f"lateral error {ey:.1f} at step {len(out)}/{n}"
            return None
        kr = pts[min(n - 1, i + LOOKAHEAD)][3]
        kappa = kr - s * K_HEAD * eth - K_HEAD * K_LAT * ey
        psi_des = max(-psi_cmd, min(psi_cmd, atan(veh.L2 * kappa)))
        delta = hitch_regulator(cur[3], s, psi_des, veh)
        cur = step(cur, s, delta, STEP, veh)
        if abs(cur[3]) > psi_plan:
            if diag is not None: diag["why"] = f"psi limit at step {len(out)}/{n}"
            return None
        out.append((cur, delta))
        if i >= n - 2:
            break
    else:
        if diag is not None: diag["why"] = "did not reach end of path"
        return None

    # terminal check against the target pose (tractor frame of the pre-goal)
    fx, fy, fth, fpsi = cur
    ct, st = cos(tth), sin(tth)
    dx, dy = fx - tx, fy - ty
    lon, lat = dx * ct + dy * st, -dx * st + dy * ct
    if diag is not None:
        diag.update(lon=lon, lat=lat, ang=wrap(fth - tth), psi=fpsi, clr=float(cm.clearance_many([o[0] for o in out]).min()), out=out)
    if abs(lat) > lat_tol or not (lon_lim[0] <= lon <= lon_lim[1]):
        if diag is not None: diag["why"] = "terminal position"
        return None
    if abs(wrap(fth - tth)) > ang_tol or abs(fpsi) > psi_tol:
        if diag is not None: diag["why"] = "terminal heading/psi"
        return None
    if cm.clearance_many([o[0] for o in out]).min() < clear:
        if diag is not None: diag["why"] = "collision"
        return None
    return out
