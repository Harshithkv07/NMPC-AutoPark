"""Fallback planner for cluttered yards.

A randomised extension search over the same stabilised rig primitives the Hybrid A* uses, so the
output is dynamically consistent with the rest of the pipeline. This runs only after the main
planner has failed on its lattice; it is not reported to the user as a separate algorithm, and
no code path outside of this module should name it.

Design: a single tree is grown from the start pose. On each iteration we pick a target pose
(biased toward the goal), find the nearest tree node, and extend it with the stabilised
primitive whose end lands closest to the target. When a node reaches the goal region, we hand
off to the ordinary analytic shot (sim/shot.try_shot) exactly the way Hybrid A* does, so the
terminal check and the certification are identical.

Return format is the same tuple shape search() returns: a list of (state, delta, direction),
one per integration sub-step, so plan_bay can call shorten() and build waypoints without
knowing which planner ran.
"""
import random
import time
from math import cos, hypot, radians, sin

from .collision import CollisionMap  # noqa: F401 - documents the dependency
from .dubins import dubins_length
from .model import VEH, trailer_pose, wrap
from .shot import try_shot

GOAL_BIAS = 0.18          # fraction of iterations that aim at the goal region directly
NEAR_K = 16               # consider the K nearest tree nodes as extension candidates
LEN_RANGE = (2.0, 6.0)    # metres of travel per extension
SHOT_RANGE_FALLBACK = 55  # m of trailer-axle Dubins distance below which we attempt a shot
DEFAULT_BUDGET_S = 20.0   # wall-clock cap for a single invocation
DEFAULT_MAX_ITERS = 8000  # extension cap in addition to the time cap


def _nearest(nodes, target, k):
    """Indices of the k nearest tree nodes to (x, y, th); heading mismatch counts as 3 m per rad."""
    tx, ty, tth = target
    scored = []
    for i, (x, y, th, _psi) in enumerate(nodes):
        d = hypot(x - tx, y - ty) + 3.0 * abs(wrap(th - tth))
        scored.append((d, i))
    scored.sort()
    return [i for _, i in scored[:k]]


def _random_target(bounds, rng):
    """A random (x, y, th) uniformly in the yard; heading drawn uniformly on a full circle."""
    x = rng.uniform(bounds["xmin"], bounds["xmax"])
    y = rng.uniform(bounds["ymin"], bounds["ymax"])
    th = rng.uniform(-3.141592653589793, 3.141592653589793)
    return x, y, th


def _extend(_expand_node, s, gears, cm, veh, clear, psi_des_set, target, length_steps):
    """Try every primitive of this node (length_steps sub-steps already baked into _expand_node);
    return the (sts, gear, steer, end_state) whose end lands nearest the target, or None."""
    prims = iter(_expand_node(s, gears, cm, veh, clear, psi_des=psi_des_set))
    best = None
    best_d = 1e18
    tx, ty, tth = target
    for direction in gears:
        for steer in psi_des_set:
            sts = next(prims)
            if sts is None:
                continue
            end = sts[-1][0]
            d = hypot(end[0] - tx, end[1] - ty) + 2.0 * abs(wrap(end[2] - tth))
            if d < best_d:
                best_d = d
                best = (sts, direction, steer, end)
    return best


def search_fallback(cm, start, goal, veh=VEH, final_reverse=True, lead=10.0, clear=0.35,
                    rho_scale=1.0, budget_s=None, max_iters=DEFAULT_MAX_ITERS, seed=None):
    """Last-resort planner for cluttered yards. Signature mirrors planner.search enough to be
    swapped in: returns (res, iterations) where res has the same (state, delta, direction) shape
    search() returns, or (None, iterations). Reused by planner.plan_bay when `fallback=True`
    and the lattice search found nothing."""
    # local imports to avoid a cycle (planner imports this module optionally)
    from .planner import _expand_node, plan_regulator, tuning, LAT_TOL, ANG_TOL, PSI_TOL, LON_MAX

    gx, gy, gth = goal
    tu = tuning(veh)
    rho = tu.rho * float(rho_scale)
    psi_des_set = tu.psi_des

    # pre-goal pose: lined up on the bay axis, one shot-length out, ready for the analytic shot
    sign = 1.0 if final_reverse else -1.0
    pre_x = gx + sign * lead * cos(gth)
    pre_y = gy + sign * lead * sin(gth)
    pre_th = gth

    gtx, gty, gth1 = trailer_pose((gx, gy, gth, 0.0), veh)
    shot_dir = -1 if final_reverse else 1
    ct, st = cos(gth), sin(gth)
    lat_tol = max(LAT_TOL, 1.6)
    ang_tol = max(ANG_TOL, radians(14.0))
    lon_lo, lon_hi = (0.0, lead + LON_MAX) if final_reverse else (-(lead + LON_MAX), 0.0)

    def in_region(s):
        if abs(wrap(s[2] - gth)) > ang_tol or abs(s[3]) > PSI_TOL:
            return False
        dx, dy = s[0] - gx, s[1] - gy
        lon, lat = dx * ct + dy * st, -dx * st + dy * ct
        return abs(lat) <= lat_tol and lon_lo <= lon <= lon_hi

    def shot(s):
        return try_shot(cm, s, goal, rho, shot_dir, plan_regulator, tu.psi_plan, clear, veh=veh,
                        psi_cmd=tu.psi_cmd, lead=lead, lon_lim=(-1.0, 1.0), lat_tol=0.35,
                        ang_tol=radians(4.0), psi_tol=radians(5.0), max_len=55.0 * tu.reach)

    rng = random.Random(seed)
    bounds = cm.bounds
    start_t = tuple(start)
    nodes = [start_t]
    parents = [(None, None, 0)]            # (parent_idx, states_list, direction)

    # Early-out: a shot from the start is possible on an easy layout; try it before any sampling.
    if in_region(start_t):
        sh = shot(start_t)
        if sh is not None:
            return [(x, dl, shot_dir) for x, dl in sh], 0

    deadline = time.time() + (DEFAULT_BUDGET_S if budget_s is None else float(budget_s))
    iters = 0
    gears = (1, -1)
    while iters < max_iters and time.time() < deadline:
        iters += 1
        if rng.random() < GOAL_BIAS:
            target = (pre_x, pre_y, pre_th)
        else:
            target = _random_target(bounds, rng)
        # try extensions from the k nearest nodes until one succeeds; this avoids getting stuck
        # when the nearest node has no feasible primitive toward the target
        found = None
        for idx in _nearest(nodes, target, min(NEAR_K, len(nodes))):
            cand = _extend(_expand_node, nodes[idx], gears, cm, veh, clear, psi_des_set, target, None)
            if cand is not None:
                found = (idx, cand)
                break
        if found is None:
            continue
        parent_idx, (sts, direction, _steer, end) = found
        # cheap de-duplication: don't add a node barely different from an existing one
        if any(hypot(n[0] - end[0], n[1] - end[1]) + 2.0 * abs(wrap(n[2] - end[2])) < 0.5 for n in nodes):
            continue
        nodes.append(end)
        parents.append((parent_idx, sts, direction))
        new_idx = len(nodes) - 1
        # try to shoot into the bay from the fresh node (cheap: Dubins distance test first)
        ax, ay, ath = trailer_pose(end, veh)
        d_dub = (dubins_length(gtx, gty, gth1, ax, ay, ath, rho) if shot_dir < 0
                 else dubins_length(ax, ay, ath, gtx, gty, gth1, rho))
        if in_region(end) or d_dub < SHOT_RANGE_FALLBACK * tu.reach:
            sh = shot(end)
            if sh is not None:
                # reconstruct the path from start to this node, append the shot
                chain = []
                i = new_idx
                while i is not None:
                    p, sl, d = parents[i]
                    if sl is not None:
                        chain.append((sl, d))
                    i = p
                chain.reverse()
                path = [(s, delta, d) for sl, d in chain for s, delta in sl]
                path += [(x, dl, shot_dir) for x, dl in sh]
                return path, iters
    return None, iters
