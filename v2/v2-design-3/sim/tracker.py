"""Closed-loop execution of a planned path: NMPC guidance vs. a naive tractor-only controller.

NMPC (the project's core). At every control update it solves, over a receding horizon,

    min   sum_k  |X_k - Xref_k|^2_Q  +  |delta_k|^2_R  +  |d delta_k|^2_S           (Word doc J)
    s.t.  X_{k+1} = f(X_k, v_k, delta_k)                 kinematics (PPT slide 9)
          |psi_k|     <= psi_crit                        HARD jackknife constraint
          |delta_k|   <= delta_max                       steering lock
          clearance_k >= margin                          obstacles / walls

Decision variables are steering CORRECTIONS (piecewise constant over blocks) added to the planned
feedforward steering, so zero correction = follow the plan. The speed schedule v_k
comes from the trapezoidal profile of the planned segment: the advisor reports it, the NMPC
decides how to steer. Solver: scipy SLSQP, warm-started from the previous solution.

Baseline ("guidance OFF"): a driver-like controller that steers the TRACTOR onto the path with
proportional feedback and has no model of the hitch, no lookahead and no constraint.

Benchmark baselines (sim/evaluate.py): "cascade", the classical geometric controller for reversing trailers (an outer
loop on the trailer axle's lateral and heading error asks for a hitch angle, an inner loop steers to it; the same law the
planner's shots use), and "nmpc_soft", the NMPC with its hard hitch-angle constraint removed. run() can also drive a
plant that differs from the model (`plant`), measure the state with noise (`noise`), delay the steering (`delay`) and push
the trailer during the final approach (`disturbance` {"final_after", "psi_kick"}).
"""
from collections import deque
from math import cos, sin, hypot, atan, tan, radians, pi
import random
import time

import numpy as np
from scipy.optimize import minimize

from .model import VEH, step, step_batch, trailer_pose, wrap
from .planner import hitch_regulator, plan_regulator, tuning, CLEAR
from .shot import try_shot, K_HEAD, K_LAT

DT_H = 0.4            # NMPC prediction step, s
N_P = 24              # prediction horizon steps (9.6 s)
N_B = 8               # steering blocks
BLK = N_P // N_B
DT_C = 0.25           # control update period, s
DT_SIM = 0.05
STEER_RATE = radians(45.0)      # actuator rate limit, rad/s
V_FWD, V_REV, ACC = 2.2, 1.2, 0.7
V_CREEP = 0.35
REPLAN_EVERY = 8.0    # metres of progress between re-plans of the final approach
DWELL = 1.2           # stop at a cusp, s
STOP_AT_END = True    # the horizon stands still once it reaches the end of the segment (False: design 1's horizon)

# Cost weights. The TRAILER axle pose is the primary tracking target: when reversing, the tractor's
# rear axle is the non-minimum-phase output (the PPT's dilemma) while the trailer axle is flat.
Q_TL_POS, Q_TL_TH, Q_PSI, Q_TR_POS, Q_TR_TH = 0.6, 1.5, 15.0, 0.15, 0.3
R_DELTA, S_DELTA = 0.02, 3.0
TERM_TL_POS, TERM_TL_TH, TERM_PSI, TERM_TR_POS = 8.0, 60.0, 60.0, 1.0   # terminal cost: the horizon must END on the plan
CLEAR_MARGIN = 0.25
FD_EPS = 1.4901161193847656e-08   # forward-difference step: the one SLSQP uses when it differentiates itself
END_BOOST, END_SCALE = 0.0, 6.0   # position/heading weights x(1 + 8 exp(-remaining/6 m)) near a segment end


# ---------------------------------------------------------------------------- reference
class Segment:
    def __init__(self, wps, gear, v_start=0.3, veh=VEH):
        self.gear = gear
        self.v_start = v_start
        self.dmax = veh.delta_max
        x = np.array([w["x"] for w in wps]); y = np.array([w["y"] for w in wps])
        self.x, self.y = x, y
        self.th = np.unwrap([w["th"] for w in wps])
        self.psi = np.array([w["psi"] for w in wps])
        self.delta = np.array([w["delta"] for w in wps])
        self.s = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(x), np.diff(y)))])
        self.length = float(self.s[-1])
        self.vmax = V_FWD if gear > 0 else V_REV
        self._build_profile()

    def _build_profile(self):
        """Speed profile along the segment: slow for hard steering (looking ~3 m ahead and behind),
        then respect accel/decel limits with a forward and a backward pass. Ends at creep speed."""
        n = len(self.s)
        dmax = self.dmax
        dabs = np.abs(self.delta)
        vlim = np.empty(n)
        for i in range(n):
            m = dabs[(self.s >= self.s[i] - 3.0) & (self.s <= self.s[i] + 3.0)].max()
            vlim[i] = max(1.5 * V_CREEP, self.vmax * (1.0 - 0.65 * m / dmax))
        v = vlim.copy()
        v[0] = min(v[0], max(self.v_start, V_CREEP))
        v[-1] = V_CREEP
        ds = np.diff(self.s)
        for i in range(1, n):
            v[i] = min(v[i], (v[i - 1] ** 2 + 2 * ACC * ds[i - 1]) ** 0.5)
        for i in range(n - 2, -1, -1):
            v[i] = min(v[i], (v[i + 1] ** 2 + 2 * ACC * ds[i]) ** 0.5)
        self.vprof = np.maximum(v, V_CREEP)

    def speed(self, s):
        return float(np.interp(min(max(s, 0.0), self.length), self.s, self.vprof))

    def ff_at(self, s):
        """Planned steering angle at path distance s (the plan is kinematically consistent)."""
        s = min(max(s, 0.0), self.length)
        return float(np.interp(s, self.s, self.delta))

    def ref_at(self, s):
        s = min(max(s, 0.0), self.length)
        return (float(np.interp(s, self.s, self.x)), float(np.interp(s, self.s, self.y)),
                float(np.interp(s, self.s, self.th)), float(np.interp(s, self.s, self.psi)))


def split_segments(wp, veh=VEH):
    """Cut the waypoint list at gear changes (cusps). A cusp waypoint belongs to both segments."""
    segs, cur, g = [], [wp[0]], wp[1]["gear"] if len(wp) > 1 else 1
    for w in wp[1:]:
        if w["gear"] != g:
            if len(cur) >= 2:
                segs.append(Segment(cur, g, veh=veh))
            cur, g = [cur[-1]], w["gear"]
        cur.append(w)
    if len(cur) >= 2:
        segs.append(Segment(cur, g, veh=veh))
    return [s for s in segs if s.length > 0.3]


def reshoot(cm, state, bay, veh, v_now=0.3, clear=CLEAR):
    """Re-plan the final approach from the rig's ACTUAL state: a fresh simulated shot to the goal.
    Returns a Segment or None (caller keeps its current reference)."""
    gear = -1 if bay["approach"] == "reverse" else 1
    tu = tuning(veh)
    sh = try_shot(cm, state, tuple(bay["goal"]), tu.rho, gear, plan_regulator, tu.psi_plan, clear, veh=veh,
                  psi_cmd=tu.psi_cmd, lead=bay.get("lead", 10.0), lon_lim=(-1.0, 1.0), lat_tol=0.35,
                  ang_tol=radians(4.0), psi_tol=radians(5.0), max_len=80.0 * tu.reach)
    if sh is None:
        return None
    wps = [dict(x=state[0], y=state[1], th=state[2], psi=state[3], delta=0.0, gear=gear)]
    wps += [dict(x=s[0], y=s[1], th=s[2], psi=s[3], delta=dl, gear=gear) for s, dl in sh]
    return Segment(wps, gear, v_start=v_now, veh=veh)


# ---------------------------------------------------------------------------- NMPC
def trailer_axle(st, veh=VEH):
    """Vectorised trailer axle pose for an (N,4) array of rig states -> (tx, ty, th1)."""
    th1 = st[:, 2] - st[:, 3]
    hx = st[:, 0] + veh.d * np.cos(st[:, 2]); hy = st[:, 1] + veh.d * np.sin(st[:, 2])
    return hx - veh.L2 * np.cos(th1), hy - veh.L2 * np.sin(th1), th1


class NMPC:
    def __init__(self, cm, veh=VEH, psi_limit=None):
        self.cm, self.veh = cm, veh
        self.psi_lim = psi_limit if psi_limit is not None else veh.psi_crit
        self.u = np.zeros(N_B)
        self.last_delta = 0.0
        self.stats = {"solves": 0, "fail": 0, "ms": 0.0}

    def _rollout(self, s0, vs, u, ff):
        states, s, dm = [], tuple(s0), self.veh.delta_max
        for k in range(N_P):
            d = ff[k] + float(u[k // BLK])
            s = step(s, vs[k], max(-dm, min(dm, d)), DT_H, self.veh)
            states.append(s)
        return states

    def _rollout_batch(self, s0, vs, U, ff):
        """The same RK4 prediction as _rollout, for a batch of block vectors U (B, N_B) -> (B, N_P, 4)."""
        dm = self.veh.delta_max
        U = np.atleast_2d(U)
        B = U.shape[0]
        tn = np.tan(np.clip(np.asarray(ff)[None, :] + np.repeat(U, BLK, axis=1), -dm, dm))   # (B, N_P)
        x = np.full(B, float(s0[0])); y = np.full(B, float(s0[1]))
        th = np.full(B, float(s0[2])); psi = np.full(B, float(s0[3]))
        out = np.empty((B, N_P, 4))
        for k in range(N_P):
            x, y, th, psi = step_batch(x, y, th, psi, vs[k], tn[:, k], DT_H, self.veh)
            out[:, k, 0], out[:, k, 1], out[:, k, 2], out[:, k, 3] = x, y, th, psi
        return out

    def solve(self, s0, vs, refs, ff, boost=1.0):
        """vs: signed speeds per horizon step; refs: (N_P, 4) reference states; ff: planned steering."""
        t0 = time.perf_counter()
        refs = np.asarray(refs)
        dmax = self.veh.delta_max
        ref_tx, ref_ty, ref_th1 = trailer_axle(refs, self.veh)
        last = self.last_delta

        def evaluate(U, st):
            """Cost, hitch-limit constraints and clearance constraints for a batch of block vectors U (B, N_B)
            whose predicted states are st (B, N_P, 4)."""
            th1 = st[:, :, 2] - st[:, :, 3]
            hx = st[:, :, 0] + self.veh.d * np.cos(st[:, :, 2]); hy = st[:, :, 1] + self.veh.d * np.sin(st[:, :, 2])
            etx = hx - self.veh.L2 * np.cos(th1) - ref_tx
            ety = hy - self.veh.L2 * np.sin(th1) - ref_ty
            eth1 = (th1 - ref_th1 + pi) % (2 * pi) - pi
            ex = st[:, :, 0] - refs[:, 0]; ey = st[:, :, 1] - refs[:, 1]
            eth = (st[:, :, 2] - refs[:, 2] + pi) % (2 * pi) - pi
            epsi = st[:, :, 3] - refs[:, 3]
            J = np.sum(boost * (Q_TL_POS * (etx ** 2 + ety ** 2) + Q_TL_TH * eth1 ** 2
                                + Q_TR_POS * (ex ** 2 + ey ** 2) + Q_TR_TH * eth ** 2) + Q_PSI * epsi ** 2, axis=1)
            J += (boost * (TERM_TL_POS * (etx[:, -1] ** 2 + ety[:, -1] ** 2) + TERM_TL_TH * eth1[:, -1] ** 2
                           + TERM_TR_POS * (ex[:, -1] ** 2 + ey[:, -1] ** 2)) + TERM_PSI * epsi[:, -1] ** 2)
            J += R_DELTA * np.sum(U ** 2, axis=1)
            du = np.diff(np.concatenate([np.full((U.shape[0], 1), last), U], axis=1), axis=1)
            J += S_DELTA * np.sum(du ** 2, axis=1)
            psi = st[:, :, 3]
            g_p = np.concatenate([self.psi_lim - psi, self.psi_lim + psi], axis=1)   # >= 0 <=> |psi| <= limit
            g_c = self.cm.clearance_batch(st) - CLEAR_MARGIN
            return J, g_p, g_c

        # SLSQP asks for f, g and their Jacobians at the same points. One batched rollout of the point and its
        # eight forward-difference neighbours (the step SciPy would use: 1.49e-8, flipped at the upper bound)
        # serves all six requests; a line-search trial point costs one scalar rollout.
        vals, grads = {}, {}

        def at(u, grad):
            key = u.tobytes()
            if grad:
                if key not in grads:
                    hstep = np.where(u + FD_EPS <= dmax, FD_EPS, -FD_EPS)
                    U = np.vstack([u, u + np.diag(hstep)])
                    J, g_p, g_c = evaluate(U, self._rollout_batch(s0, vs, U, ff))
                    vals[key] = (J[0], g_p[0], g_c[0])
                    grads[key] = ((J[1:] - J[0]) / hstep, ((g_p[1:] - g_p[0]) / hstep[:, None]).T,
                                  ((g_c[1:] - g_c[0]) / hstep[:, None]).T)
                return grads[key]
            if key not in vals:     # a single point: plain-Python RK4 is several times faster than NumPy here
                J, g_p, g_c = evaluate(u[None, :], np.array(self._rollout(s0, vs, u, ff))[None])
                vals[key] = (J[0], g_p[0], g_c[0])
            return vals[key]

        cost = lambda u: float(at(np.asarray(u, float), False)[0])
        cost_jac = lambda u: at(np.asarray(u, float), True)[0]
        g_psi = lambda u: at(np.asarray(u, float), False)[1]
        g_clear = lambda u: at(np.asarray(u, float), False)[2]
        psi_con = {"type": "ineq", "fun": g_psi, "jac": lambda u: at(np.asarray(u, float), True)[1]}
        clr_con = {"type": "ineq", "fun": g_clear, "jac": lambda u: at(np.asarray(u, float), True)[2]}
        x0 = np.clip(self.u, -dmax, dmax)     # blocks span 1.2 s but we re-solve every 0.25 s: no shift
        best, mode = None, "full"
        # attempt 1: hitch limit AND obstacle clearance hard. attempt 2: hitch limit hard only
        # (a rig that cannot both dodge and stay unfolded must stay unfolded).
        for cons, label in (([psi_con, clr_con], "full"), ([psi_con], "psi-only")):
            for start in (x0, np.zeros(N_B)):
                r = minimize(cost, start, jac=cost_jac, method="SLSQP", bounds=[(-dmax, dmax)] * N_B, constraints=cons,
                             options={"maxiter": 40, "ftol": 1e-4})
                ok = r.success or (np.min(g_psi(r.x)) > -1e-2 and
                                   (label == "psi-only" or np.min(g_clear(r.x)) > -0.05))
                if ok and (best is None or r.fun < best.fun):
                    best, mode = r, label
                if r.success:
                    break
            if best is not None:
                break
        self.stats["solves"] += 1
        self.stats["ms"] += 1000 * (time.perf_counter() - t0)
        if mode == "psi-only":
            self.stats["relaxed"] = self.stats.get("relaxed", 0) + 1
        if best is None:
            # both attempts infeasible: fall back to the hitch-angle regulator (stable in both gears)
            self.stats["fail"] += 1
            d_fb = hitch_regulator(s0[3], vs[0] if abs(vs[0]) > 1e-6 else 1.0, float(refs[0, 3]), self.veh)
            u = np.zeros(N_B)
            u[0] = d_fb - ff[0]
            u[1:] = u[0] * 0.5
        else:
            u = best.x
        self.u = u
        self.last_delta = float(u[0])   # correction rate is penalised, not the absolute angle
        return float(np.clip(ff[0] + u[0], -dmax, dmax)), self._rollout(s0, vs, u, ff)


# ---------------------------------------------------------------------------- baseline
class Naive:
    """Driver-like: steer the tractor towards the path point ahead. No hitch model, no constraint."""
    K_Y, K_TH = 0.35, 1.0

    def __init__(self, veh=VEH):
        self.veh = veh

    def command(self, s, seg, prog_s, v):
        rx, ry, rth, _ = seg.ref_at(prog_s + 0.5)
        ey = -(s[0] - rx) * sin(rth) + (s[1] - ry) * cos(rth)
        eth = wrap(s[2] - rth)
        sign = 1.0 if v >= 0 else -1.0
        kappa_ff = float(np.interp(prog_s, seg.s, np.gradient(seg.th, seg.s)))
        kappa = kappa_ff - sign * (self.K_TH * self.K_Y * ey * 0.2 + 0.25 * eth) * 1.0
        return max(-self.veh.delta_max, min(self.veh.delta_max, atan(self.veh.L1 * kappa)))


class Cascade:
    """The classical controller for a reversing trailer, without prediction or constraints: an outer loop turns the
    trailer axle's lateral and heading error from the plan into a hitch angle to hold (the trailer axle is a flat output,
    psi = atan(L2 kappa)), and the hitch regulator steers the tractor to it. It is the law the planner's shots follow
    (shot.py), here closed around the measured state and the planned path."""
    LOOK = 2.0                 # m of path ahead whose planned hitch angle is the feedforward

    def __init__(self, veh=VEH):
        self.veh = veh
        self.psi_cmd = tuning(veh).psi_cmd

    def command(self, s, seg, prog_s, v):
        sign = 1.0 if v >= 0 else -1.0
        ax, ay, ath = trailer_pose(s, self.veh)
        rx, ry, rth1 = trailer_pose(seg.ref_at(prog_s), self.veh)
        ey = -(ax - rx) * sin(rth1) + (ay - ry) * cos(rth1)
        eth = wrap(ath - rth1)
        kappa = tan(seg.ref_at(prog_s + self.LOOK)[3]) / self.veh.L2 - sign * K_HEAD * eth - K_HEAD * K_LAT * ey
        psi_des = max(-self.psi_cmd, min(self.psi_cmd, atan(self.veh.L2 * kappa)))
        return hitch_regulator(s[3], sign, psi_des, self.veh)


# ---------------------------------------------------------------------------- execution
def run(layout, cm, wp, mode="nmpc", disturbance=None, veh=VEH, max_time=600.0, log_every=0.1, bay=None,
        replan=True, delta0=0.0, clear=CLEAR, abort_clear=None, hook=None, plant=None, noise=None, delay=0.0):
    """Execute the planned path in closed loop. Returns dict with frames and metrics.

    mode: "nmpc" (the project's controller), "naive" (the unaided driver), "cascade" or "nmpc_soft" (benchmark
    baselines, see the module docstring). The final-approach re-plans serve every mode but "naive".
    disturbance: {"t": seconds, "psi_kick": radians} adds an instantaneous hitch-angle jolt; with "final_after" instead
    of "t" it comes that many seconds into the last segment (the approach into the bay), pushing the hitch angle further
    the way it already leans.
    plant: the Vehicle that is really driven (None: veh). The controller, the planner and every limit use veh.
    noise: {"pos": m, "th": rad, "psi": rad, "seed": int}: standard deviations of the white Gaussian error on the state
    the controller sees each control period (None: it sees the true state). Certification always uses the true state.
    delay: seconds between a steering command and the moment the steering actuator starts moving to it.
    delta0: the steering angle the run starts with (a run that continues an earlier one starts with its wheel as it was).
    clear: clearance the final-approach re-plans keep (planner.CLEAR).
    abort_clear: stop the run (result["aborted"]) the moment the rig is closer than this to anything, like a driver who
    stops and re-plans instead of reversing on into trouble; the caller continues from where the rig stands.
    hook: called as hook(t, state, frames, solver_stats) after every control period and every stop at a cusp (the live
    NMPC paces itself and streams `frames` from it). It may return {"psi_kick": rad} to push the trailer (the controller
    has to recover) or {"stop": True} to end the run (result["stopped"]). None: today's run, unchanged."""
    segs = split_segments(wp, veh)
    s0 = wp[0]
    state = (s0["x"], s0["y"], s0["th"], s0["psi"])
    ctrl = (NMPC(cm, veh) if mode == "nmpc" else NMPC(cm, veh, psi_limit=radians(179.0)) if mode == "nmpc_soft"
            else Cascade(veh) if mode == "cascade" else Naive(veh))
    replans_on = replan and mode != "naive"
    plant = plant or veh
    rng = random.Random(noise.get("seed", 0)) if noise else None
    pending, target = deque(), delta0          # delayed steering commands: (time due, angle)

    def measured():
        if not noise:
            return state
        return (state[0] + rng.gauss(0.0, noise.get("pos", 0.0)), state[1] + rng.gauss(0.0, noise.get("pos", 0.0)),
                state[2] + rng.gauss(0.0, noise.get("th", 0.0)), state[3] + rng.gauss(0.0, noise.get("psi", 0.0)))
    t, delta, frames, phases = 0.0, delta0, [], []
    min_clear, max_psi, jackknife, violated = 1e9, 0.0, False, False
    next_log, kicked = 0.0, False
    aborted = stopped = False

    def poll():
        """The hook's say after a control period: True to stop the run."""
        nonlocal state, stopped
        cmd = hook(t, state, frames, getattr(ctrl, "stats", None))
        if cmd:
            if cmd.get("psi_kick"):
                state = (state[0], state[1], state[2], state[3] + cmd["psi_kick"])
            stopped = bool(cmd.get("stop"))
        return stopped
    # a rig already standing closer than abort_clear (a retry that starts beside a parked truck) is only stopped by getting worse
    abort_below = None if abort_clear is None else min(abort_clear, cm.clearance(state) - 0.02)

    def log(v, hor=None):
        nonlocal next_log
        if t + 1e-9 >= next_log:
            fr = {"t": round(t, 2), "x": round(state[0], 3), "y": round(state[1], 3),
                  "th": round(state[2], 4), "psi": round(state[3], 4), "v": round(v, 3),
                  "delta": round(delta, 4)}
            if hor is not None:
                fr["hor"] = [[round(h[0], 2), round(h[1], 2), round(h[2], 3), round(h[3], 3)] for h in hor[::2]]
            frames.append(fr)
            next_log += log_every

    for si, seg in enumerate(segs):
        prog = 0.0
        last_seg = si == len(segs) - 1
        since = 0.0
        replans = 0
        if last_seg and bay is not None and replans_on:
            ns = reshoot(cm, measured(), bay, veh, clear=clear)
            if ns is not None:
                seg, replans = ns, replans + 1
        phases.append({"seg": si, "gear": seg.gear, "t0": round(t, 2), "length": round(seg.length, 2)})
        t_seg = t
        while True:
            meas = measured()
            # progress = nearest waypoint ahead of the last one
            lo = int(np.searchsorted(seg.s, prog))
            hi = min(len(seg.s), lo + 60)
            d2 = (seg.x[lo:hi] - meas[0]) ** 2 + (seg.y[lo:hi] - meas[1]) ** 2
            prog = max(prog, float(seg.s[lo + int(np.argmin(d2))]))
            remaining = seg.length - prog
            if remaining < 0.12:
                break
            if last_seg and bay is not None and replans_on and prog - since > REPLAN_EVERY and remaining > 14.0:
                ns = reshoot(cm, meas, bay, veh, v_now=seg.speed(prog), clear=clear)
                since = prog
                if ns is not None:
                    seg, prog, since, replans = ns, 0.0, 0.0, replans + 1
                    remaining = seg.length
            if t > max_time:
                break
            v_mag = seg.speed(prog)
            vs, refs, ffs, sp = [], [], [], prog
            for k in range(N_P):
                # the rig stops where the segment ends, so the prediction must too (design 2): carrying on at creep
                # speed past the end would "reverse into" a wall behind the bay and make the NMPC swerve from it
                vk = 0.0 if STOP_AT_END and sp >= seg.length - 1e-9 else seg.speed(sp)
                vs.append(seg.gear * vk)
                ffs.append(seg.ff_at(sp))
                sp = min(seg.length, sp + vk * DT_H)
                refs.append(seg.ref_at(sp))
            hor = None
            if isinstance(ctrl, NMPC):
                boost = 1.0 + END_BOOST * float(np.exp(-remaining / END_SCALE))   # tighten up as a segment ends
                cmd, hor = ctrl.solve(meas, vs, refs, ffs, boost)
            else:
                cmd = ctrl.command(meas, seg, prog, seg.gear * v_mag)
            pending.append((t + delay - 1e-9, cmd))
            # apply for one control period with steering rate limit
            for _ in range(int(round(DT_C / DT_SIM))):
                while pending and pending[0][0] <= t:
                    target = pending.popleft()[1]
                dd = max(-STEER_RATE * DT_SIM, min(STEER_RATE * DT_SIM, target - delta))
                delta += dd
                v = seg.gear * seg.speed(prog)
                state = step(state, v, delta, DT_SIM, plant)
                t += DT_SIM
                if disturbance and not kicked and (
                        t >= disturbance["t"] if "t" in disturbance
                        else last_seg and t - t_seg >= disturbance["final_after"]):
                    kick = disturbance["psi_kick"]
                    if "final_after" in disturbance and state[3] < 0:
                        kick = -kick
                    state = (state[0], state[1], state[2], state[3] + kick)
                    kicked = True
                c = cm.clearance(state)
                min_clear = min(min_clear, c)
                max_psi = max(max_psi, abs(state[3]))
                if abs(state[3]) > veh.psi_crit + 1e-3:
                    violated = True
                if abs(state[3]) >= veh.psi_jack:
                    jackknife = True
                log(v, hor)
                hor = None
                if abort_below is not None and c < abort_below:
                    aborted = True
                if jackknife or aborted:
                    break
            if jackknife or aborted or (hook is not None and poll()):
                break
        if jackknife or aborted or stopped or t > max_time:
            break
        if si < len(segs) - 1:                       # cusp: stop, then change gear
            for _ in range(int(DWELL / DT_SIM)):
                t += DT_SIM
                log(0.0)
            if hook is not None and poll():
                break
    log(0.0)

    goal = layout.get("_goal")
    final = {"x": state[0], "y": state[1], "th": state[2], "psi": state[3]}
    return {"frames": frames, "phases": phases, "duration": round(t, 2), "jackknife": jackknife,
            "psi_limit_violated": violated, "min_clearance": round(min_clear, 3),
            "max_psi": round(max_psi, 4), "final": final, "solver": getattr(ctrl, "stats", None),
            "mode": mode, "aborted": aborted, "stopped": stopped}
