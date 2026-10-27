"""The NMPC driving a bay live: the same chain the certification ran, at wall-clock pace, so it can
be watched and disturbed while it happens.

A LiveRun is one bay, one controller ("nmpc" or the unaided "naive" driver), in a thread of the server. It plans if it
has no route yet, drives with sim.tracker.run and a hook that (1) waits until the wall clock catches up with simulated
time x speed, (2) hands the new frames, NMPC horizons and solve times to the browser, and (3) applies pushes of the
trailer and stop requests. Like the deep pass (sim/export.py LADDER) the NMPC stops and re-plans when it gets closer
than ABORT_CLR to anything, and pulls forward and parks again after a safe but inaccurate end, up to MAX_LEGS legs;
the rig stands still while it plans. When the run ends it is checked exactly as a certification is.
"""
import threading
import time
from math import degrees, radians

from .collision import CollisionMap
from .export import ABORT_CLR, LADDER, MAX_LEGS, MIN_CLR, _safe, certify
from .planner import CLEAR, plan_bay
from .tracker import DWELL, run

SPEEDS = (0.5, 1.0, 2.0, 4.0)
PUSH_MAX = radians(30.0)
REPLAN_TRIES = 3     # planner settings tried before a live re-plan gives up ("no route from here")


def _frame(f, off):
    return [round(f["t"] + off, 2), f["x"], f["y"], round(f["th"], 4), round(f["psi"], 4), f["v"], round(f["delta"], 4)]


class LiveRun:
    def __init__(self, layout, bay_id, veh, controller="nmpc", speed=1.0, drive=None, start=True):
        if controller not in ("nmpc", "naive"):
            raise ValueError("controller must be 'nmpc' or 'naive'")
        if float(speed) not in SPEEDS:
            raise ValueError(f"speed must be one of {', '.join(f'{x:g}' for x in SPEEDS)}")
        self.lay, self.bay, self.veh, self.controller = layout, layout["bays"][bay_id], veh, controller
        self.drive = drive or {}                              # {"wp", "opts"} from the certification, if known
        self.lock = threading.Lock()
        self.frames, self.hor, self.events, self.solve_ms = [], [], [], []
        self.state, self.done, self.result, self.error = "starting", False, None, None
        self._speed, self._push, self._stop = float(speed), 0.0, False
        self._wall0, self._sim0 = None, 0.0                   # wall clock <-> simulated time anchor
        self._off, self._seen, self._stats = 0.0, 0, (0, 0.0)
        self.thread = threading.Thread(target=self._main, daemon=True)
        if start:
            self.thread.start()

    # ---------------------------------------------------------------- control from the server
    def push(self, dpsi_deg):
        with self.lock:
            self._push += max(-PUSH_MAX, min(PUSH_MAX, radians(float(dpsi_deg))))

    def stop(self):
        with self.lock:
            self._stop = True

    def set_speed(self, speed):
        speed = float(speed)
        if speed not in SPEEDS:
            raise ValueError(f"speed must be one of {', '.join(f'{s:g}' for s in SPEEDS)}")
        with self.lock:
            if self._wall0 is not None:                       # keep the current moment where it is on the wall clock
                now = time.time()
                t = self._sim0 + (now - self._wall0) * self._speed
                self._wall0, self._sim0 = now, t
            self._speed = speed

    def snapshot(self, frm=0, hfrom=0, efrom=0):
        with self.lock:
            ms = self.solve_ms
            return {"frames": self.frames[frm:], "hor": self.hor[hfrom:], "events": self.events[efrom:],
                    "n": [len(self.frames), len(self.hor), len(self.events)], "state": self.state, "done": self.done,
                    "result": self.result, "error": self.error, "speed": self._speed,
                    "solve_ms": {"last": ms[-1] if ms else None, "mean": round(sum(ms) / len(ms), 1) if ms else None,
                                 "n": len(ms)}}

    # ---------------------------------------------------------------- the run
    def _event(self, kind, **kw):
        t = self.frames[-1][0] if self.frames else 0.0
        with self.lock:
            self.events.append(dict(kind=kind, t=t, **kw))

    def _pace(self, t_abs):
        """Sleep until the wall clock reaches simulated time t_abs (at the current speed). Returns False to stop."""
        while True:
            with self.lock:
                if self._stop:
                    return False
                if self._wall0 is None:
                    self._wall0, self._sim0 = time.time(), t_abs
                due = self._wall0 + (t_abs - self._sim0) / self._speed
            wait = due - time.time()
            if wait <= 0:
                return True
            time.sleep(min(wait, 0.05))

    def _hook(self, t, state, frames, stats):
        new = frames[self._seen:]
        self._seen = len(frames)
        fr = [_frame(f, self._off) for f in new]
        hz = [[round(f["t"] + self._off, 2), [[round(a, 2), round(b, 2), round(c, 3), round(d, 3)] for a, b, c, d in f["hor"]]]
              for f in new if "hor" in f]
        ms = []
        if stats:
            n, total = stats["solves"], stats["ms"]
            if n > self._stats[0]:
                ms = [round((total - self._stats[1]) / (n - self._stats[0]), 1)]
            self._stats = (n, total)
        with self.lock:
            self.frames += fr
            self.hor += hz
            self.solve_ms += ms
            kick, self._push = self._push, 0.0
        if kick:
            self._event("push", dpsi_deg=round(degrees(kick), 1))
        if not self._pace(t + self._off):
            return {"stop": True}
        return {"psi_kick": kick} if kick else None

    def _leg(self, cm, start, delta0, wp=None, opts=None):
        """Plan (if needed) and drive one leg; returns the run result or None when no route was found."""
        opts = dict(opts or {})
        lay = self.lay if start is None else dict(self.lay, start=list(start))
        if wp is None:
            with self.lock:
                self.state = "planning"
            self._event("planning")
            # the attempt's planner settings first, then the other rungs of the retry ladder (as the deep pass does)
            for o in [opts] + [dict(x) for x in LADDER if dict(x) != opts][:REPLAN_TRIES - 1]:
                if start is not None:                         # as sim/export.py:_leg, from a tight spot
                    o["clear"] = min(o.get("clear", CLEAR), max(MIN_CLR + 0.01, cm.clearance(tuple(start)) - 0.03))
                with self.lock:
                    if self._stop:
                        return None
                wp, _ = plan_bay(lay, cm, self.bay, self.veh, **o)
                if wp is not None:
                    opts = o
                    break
            if wp is None:
                return None
            self._wall0 = None                                # the rig stood still while planning: re-anchor the clock
        with self.lock:
            self.state = "driving"
        self._seen = 0
        nmpc = self.controller == "nmpc"
        return run(lay, cm, wp, mode=self.controller, bay=self.bay, veh=self.veh, delta0=delta0,
                   clear=opts.get("clear", CLEAR), abort_clear=ABORT_CLR if nmpc else None, hook=self._hook)

    def _main(self):
        try:
            self._drive_all()
        except Exception as e:                                # report, never kill the server thread silently
            with self.lock:
                self.error, self.state, self.done = f"{type(e).__name__}: {e}", "done", True

    def _drive_all(self):
        cm = CollisionMap(self.lay, self.veh)
        nmpc = self.controller == "nmpc"
        opts = self.drive.get("opts") or LADDER[0]
        legs, start, delta0 = [], None, 0.0
        while True:
            r = self._leg(cm, start, delta0, self.drive.get("wp") if not legs else None, opts)
            if r is None:
                self._finish(legs, "no route from here")
                return
            legs.append(r)
            if r["stopped"]:
                self._finish(legs, "stopped")
                return
            joined = {"jackknife": any(x["jackknife"] for x in legs), "psi_limit_violated": any(x["psi_limit_violated"] for x in legs),
                      "min_clearance": min(x["min_clearance"] for x in legs), "final": r["final"], "aborted": r["aborted"]}
            ok, _ = certify(self.bay, joined)
            if ok or not nmpc or not _safe(joined) or len(legs) >= MAX_LEGS:
                self._finish(legs, None)
                return
            self._event("replan", why="too close" if r["aborted"] else "not parked well enough")
            last = self.frames[-1] if self.frames else None
            self._off = (last[0] if last else self._off) + DWELL       # stand still between legs, as sim/export.py:_join
            f = r["final"]
            start, delta0 = (f["x"], f["y"], f["th"], f["psi"]), r["frames"][-1]["delta"] if r["frames"] else 0.0

    def _finish(self, legs, why):
        joined = None
        if legs:
            joined = {"jackknife": any(x["jackknife"] for x in legs), "psi_limit_violated": any(x["psi_limit_violated"] for x in legs),
                      "min_clearance": min(x["min_clearance"] for x in legs), "final": legs[-1]["final"]}
            ok, final = certify(self.bay, joined)
            result = {"parked": ok, "final": final, "legs": len(legs), "jackknife": joined["jackknife"],
                      "psi_limit_violated": joined["psi_limit_violated"], "min_clearance": joined["min_clearance"],
                      "max_psi_deg": round(degrees(max(x["max_psi"] for x in legs)), 1), "why": why}
        else:
            result = {"parked": False, "legs": 0, "why": why}
        with self.lock:
            self.result, self.state, self.done = result, "done", True
        self._event("done", parked=result["parked"])
