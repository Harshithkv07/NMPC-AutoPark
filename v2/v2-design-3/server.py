"""Version 2 design 3 server: serves the viewer, solves parking lots live and drives the NMPC live.   python server.py [--port 4179] [--open]

One process, standard library only (plus the simulation's numpy/scipy). Static files come from viewer/dist;
the solver runs in a persistent pool of worker processes, one bay per task, so every free bay of a lot is
planned, driven by the NMPC, compared with the unaided driver and certified in parallel.

A lot comes from a template (cross, angled, parallel, tandem, with a seed) or from a yard drawn in the viewer
(`custom`: a spec, see sim/custom.py). Requests take one of:  {layout, seed?}  or  {custom: spec}.

  GET  /api/health                      {"version": 2, "design": 3, "workers": n, "vehicle": {"limits", "jack_gap"}}
                                        limits: {param: [lo, hi]} for every editable vehicle parameter
  POST /api/lots {layout, seed? | custom, occupied?, vehicle?}
                                        {"lot_id", "lot"}: lot has the same schema as a library file
                                        (sim/export.py:layout_json) with every free bay "pending" and no plans.
                                        A drawn yard with problems: 400 {"error", "problems": [{item, message}]}
  POST /api/layout {layout, seed | custom, occupied?, vehicle?}
                                        {"lot", "problems"}: the same lot, unsolved: only its geometry, to preview it
  GET  /api/lots/<id>                   {"lot_id", "bays": [{id, status, reason?, s?}], "done", "elapsed"}
                                        status: pending | solving | deepening | ok | infeasible (with the reason)
                                        A bay that does not certify at its first attempt is "deepening" while a second job
                                        tries it again the way a driver would (sim/export.py LADDER: another route, or
                                        pulling forward and parking again); only if that fails too is it "infeasible".
  GET  /api/lots/<id>/plans/<bay>       the certified plan (same schema as lot.plans[bay] in a library file)

Live NMPC (sim/live.py): the controller drives a certified bay at wall-clock pace, as it is watched.
  POST /api/live {lot_id, bay, controller?: nmpc | naive, speed?}      {"run_id"}   (stops the previous live run)
  GET  /api/live/<run>?from=&hfrom=&efrom=                              new frames, horizons and events since those
                                        counts, "n" (the counts now), "state" (planning | driving | done), "done",
                                        "result" (the checks of what actually happened), "solve_ms" {last, mean, n}
  POST /api/live/<run>/push {dpsi_deg}  push the trailer: the hitch angle jumps by dpsi (|dpsi| <= 30 deg)
  POST /api/live/<run>/speed {speed}    0.5 | 1 | 2 | 4
  POST /api/live/<run>/stop

`vehicle` is {L1, L2, d, delta_max, psi_crit, psi_jack} with lengths in metres and angles in DEGREES; any key may
be left out (default rig). The lot is sized for that rig and every truck in it is the same model.

It is a single-user demo server: creating a lot abandons the previous one and stops its solver processes, and only
one live run exists at a time.
"""
import argparse
import json
import os
import random
import sys
import threading
import time
import webbrowser
from concurrent.futures import Future, ProcessPoolExecutor
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from sim.custom import validate  # noqa: E402
from sim.export import layout_json, low_priority, make_layout, ping, solve_bay  # noqa: E402
from sim.live import LiveRun  # noqa: E402
from sim.lot import LAYOUT_NAMES  # noqa: E402
from sim.model import EDITABLE, JACK_GAP, vehicle_from  # noqa: E402

DIST = os.path.join(HERE, "viewer", "dist")
PORT = 4179
MAX_WORKERS = 10       # more solver processes than this exhaust the Windows commit limit (see sim/__init__.py)
KEEP = 3               # lots kept in memory (the current one and a couple of recent ones)


class LayoutError(ValueError):
    """A drawn yard that cannot be solved; `problems` says why, item by item."""

    def __init__(self, problems):
        super().__init__("; ".join(f"{p['item']}: {p['message']}" for p in problems))
        self.problems = problems


def default_workers():
    return max(1, min(MAX_WORKERS, (os.cpu_count() or 4) - 2))


def process_pool(n):
    pool = ProcessPoolExecutor(max_workers=n, initializer=low_priority)
    for _ in range(n):              # start and warm every worker now, not when the first lot is requested
        pool.submit(ping)
    return pool


def _occupied(occupied):
    return None if occupied is None else tuple(sorted({int(i) for i in occupied}))


def source(req, random_seed=True):
    """The lot source of a request: {"template", "seed"} or {"custom": spec}. Raises ValueError."""
    if req.get("custom") is not None:
        return {"custom": req["custom"]}
    name = req.get("layout")
    if name not in LAYOUT_NAMES:
        raise ValueError(f"unknown layout {name!r}; choose one of {', '.join(LAYOUT_NAMES)}, or send a drawn yard as 'custom'")
    seed = req.get("seed")
    if seed is None and not random_seed:
        raise ValueError("seed is missing")
    return {"template": name, "seed": random.randrange(1000, 2 ** 31) if seed is None else int(seed)}


def preview(req):
    """A lot's geometry for a rig, unsolved (cheap: no planning), and what is wrong with a drawn yard."""
    src, occ, veh = source(req, random_seed=False), _occupied(req.get("occupied")), vehicle_from(req.get("vehicle"))
    problems = validate(src["custom"], veh, occ) if "custom" in src else []
    return {"lot": layout_json(src, [], occ, veh), "problems": problems}


class Lots:
    """The lots being solved, and the live run. `make_pool()` returns an executor; `solver(src, occupied, bay, veh,
    deep)` returns what sim.export.solve_bay returns; `live(layout, bay, veh, controller, speed, drive)` returns a
    sim.live.LiveRun. All three are injectable so the HTTP layer can be tested with stubs. With `deepen`, a bay whose
    first attempt does not certify gets a second job (deep=True) before it is called infeasible."""

    def __init__(self, make_pool, solver=solve_bay, workers=None, deepen=True, live=LiveRun):
        self.make_pool, self.solver, self.deepen, self.live_factory = make_pool, solver, deepen, live
        self.workers = workers or default_workers()
        self.pool = make_pool(self.workers)
        self.lock = threading.Lock()
        self.lots, self.order, self.count = {}, [], 0
        self.runs, self.run_count = {}, 0

    def create(self, req):
        src, occ, veh = source(req), _occupied(req.get("occupied")), vehicle_from(req.get("vehicle"))
        if "custom" in src:
            problems = validate(src["custom"], veh, occ)
            errors = [p for p in problems if p.get("severity", "error") == "error"]
            if errors:
                raise LayoutError(errors)
            # warnings pass through: the live solver will try these bays anyway, and the viewer
            # already showed the warning via /api/layout before Plan was pressed
        lot = layout_json(src, [], occ, veh)               # raises ValueError for bay ids out of range
        free = [b["id"] for b in lot["layout"]["bays"] if not b["occupied"]]
        for b in lot["layout"]["bays"]:
            if not b["occupied"]:
                b["status"] = "pending"
                b.pop("reason", None)
        lot["layout"]["live"] = True
        lot["layout"]["custom"] = occ is not None
        with self.lock:
            busy = any(not self._settled(rec) for rec in self.lots.values())
            if busy:                                       # abandon the previous lot: stop its solver processes
                for rec in self.lots.values():
                    rec["abandoned"] = True
                old = self.pool
                if hasattr(old, "terminate_workers"):
                    old.terminate_workers()
                else:
                    old.shutdown(wait=False, cancel_futures=True)
                self.pool = self.make_pool(self.workers)
            self.count += 1
            lay = lot["layout"]
            lot_id = f"{self.count}-{lay['name']}-{lay.get('spec_id', lay['seed'])}"
            futures = {bid: self.pool.submit(self.solver, src, occ, bid, veh) for bid in free}
            self.lots[lot_id] = {"lot": lot, "futures": futures, "deep": {}, "t0": time.time(), "t_done": None,
                                 "pool": self.pool, "src": src, "occ": occ, "veh": veh, "abandoned": False}
            self.order.append(lot_id)
            while len(self.order) > KEEP:
                self.lots.pop(self.order.pop(0), None)
            if self.deepen:
                for bid, f in futures.items():
                    f.add_done_callback(lambda fut, lot_id=lot_id, bid=bid: threading.Thread(
                        target=self._deepen, args=(lot_id, bid, fut), daemon=True).start())
        return lot_id, lot

    @staticmethod
    def _failed(f):
        """The first attempt of a bay finished without a certified plan (and did not crash)."""
        return f.done() and not f.cancelled() and f.exception() is None and not f.result()["ok"]

    def _settled(self, rec):
        """Every bay of the lot has its final verdict (a failed first attempt is not final until its deep job is)."""
        for bid, f in rec["futures"].items():
            if not f.done():
                return False
            if self.deepen and not rec["abandoned"] and self._failed(f):
                g = rec["deep"].get(bid)
                if g is None or not g.done():
                    return False
        return True

    def _deepen(self, lot_id, bid, fut):
        """Second job for a bay whose first attempt failed (runs in its own thread: submitting from the executor's
        callback thread is avoided). Only for the newest lot, in the pool that lot was submitted to."""
        if not self._failed(fut):
            return
        with self.lock:
            rec = self.lots.get(lot_id)
            if rec is None or rec["abandoned"] or self.order[-1] != lot_id:
                return
            try:
                rec["deep"][bid] = rec["pool"].submit(self.solver, rec["src"], rec["occ"], bid, rec["veh"], True)
            except RuntimeError:                           # the pool was shut down under us
                g = Future()
                g.set_result({"ok": False, "reason": fut.result()["reason"]})
                rec["deep"][bid] = g

    def _result(self, rec, bid):
        """The verdict of a bay once final: the first attempt's if it certified, else the deep job's; None before."""
        f = rec["futures"].get(bid)
        if not f or not f.done() or f.cancelled() or f.exception() is not None:
            return None
        r = f.result()
        if not r["ok"]:
            g = rec["deep"].get(bid)
            if g is None or not g.done() or g.cancelled() or g.exception() is not None:
                return None
            r = g.result()
        return r

    def status(self, lot_id):
        rec = self.lots.get(lot_id)
        if rec is None:
            return None
        bays, done = [], True
        for bid, f in rec["futures"].items():
            entry = {"id": bid}
            if not f.done():
                done = False
                entry["status"] = "solving" if f.running() else "pending"
            elif f.cancelled():
                entry.update(status="infeasible", reason="cancelled")
            elif f.exception() is not None:
                entry.update(status="infeasible", reason=f"solver error: {f.exception()}")
            else:
                r = f.result()
                g = rec["deep"].get(bid)
                if not r["ok"] and self.deepen and not rec["abandoned"] and (g is None or not g.done()):
                    done = False                           # the second attempt is queued or running
                    entry["status"] = "deepening"
                    bays.append(entry)
                    continue
                if not r["ok"] and g is not None and g.done():
                    if g.cancelled() or g.exception() is not None:
                        r = dict(r, reason="cancelled" if g.cancelled() else f"solver error: {g.exception()}")
                    else:
                        r = g.result()
                entry["status"] = "ok" if r["ok"] else "infeasible"
                if not r["ok"]:
                    entry["reason"] = r["reason"]
                if "wall" in r:
                    entry["s"] = round(r["wall"], 1)
            bays.append(entry)
        if done and rec["t_done"] is None:
            rec["t_done"] = time.time()
        elapsed = (rec["t_done"] or time.time()) - rec["t0"]
        return {"lot_id": lot_id, "bays": bays, "done": done, "elapsed": round(elapsed, 1)}

    def plan(self, lot_id, bid):
        rec = self.lots.get(lot_id)
        r = rec and self._result(rec, bid)
        return r["plan"] if r and r["ok"] else None

    # ---------------------------------------------------------------- live NMPC
    def start_live(self, lot_id, bid, controller="nmpc", speed=1.0):
        rec = self.lots.get(lot_id)
        if rec is None:
            raise KeyError("unknown lot")
        r = self._result(rec, int(bid))
        if not r or not r["ok"]:
            raise ValueError(f"bay {int(bid) + 1} has no certified guidance to drive live")
        layout = make_layout(rec["src"], rec["occ"], rec["veh"])
        with self.lock:
            for run in self.runs.values():                 # one live run at a time
                run.stop()
            self.runs.clear()
            self.run_count += 1
            run_id = f"L{self.run_count}"
            self.runs[run_id] = self.live_factory(layout, int(bid), rec["veh"], controller, float(speed), r.get("drive"))
        return run_id

    def run(self, run_id):
        return self.runs.get(run_id)

    def close(self):
        for run in self.runs.values():
            run.stop()
        self.pool.shutdown(wait=False, cancel_futures=True)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if not self.path.startswith(("/api/lots/", "/api/live/")):   # polling would flood the console
            sys.stderr.write("  %s  %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, separators=(",", ":")).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path
        if not path.startswith("/api/"):
            return super().do_GET()
        lots = self.server.lots
        parts = path.strip("/").split("/")                    # api, lots, <id>, plans, <bay>
        if parts == ["api", "health"]:
            return self._json(200, {"version": 2, "design": 3, "workers": lots.workers,
                                    "vehicle": {"limits": EDITABLE, "jack_gap": JACK_GAP}})
        if len(parts) == 3 and parts[1] == "lots":
            st = lots.status(parts[2])
            return self._json(200, st) if st else self._json(404, {"error": "unknown lot"})
        if len(parts) == 5 and parts[1] == "lots" and parts[3] == "plans" and parts[4].isdigit():
            plan = lots.plan(parts[2], int(parts[4]))
            return self._json(200, plan) if plan else self._json(404, {"error": "no certified plan for that bay"})
        if len(parts) == 3 and parts[1] == "live":
            run = lots.run(parts[2])
            if run is None:
                return self._json(404, {"error": "unknown live run"})
            q = parse_qs(url.query)
            k = [int((q.get(name) or ["0"])[0]) for name in ("from", "hfrom", "efrom")]
            return self._json(200, run.snapshot(*k))
        return self._json(404, {"error": "unknown endpoint"})

    def do_POST(self):
        path = urlparse(self.path).path
        lots = self.server.lots
        parts = path.strip("/").split("/")
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(req, dict):
                raise ValueError("the request must be a JSON object")
            if path == "/api/layout":
                return self._json(200, preview(req))
            if path == "/api/lots":
                lot_id, lot = lots.create(req)
                return self._json(200, {"lot_id": lot_id, "lot": lot})
            if path == "/api/live":
                run_id = lots.start_live(req.get("lot_id"), int(req.get("bay")), req.get("controller") or "nmpc",
                                         req.get("speed") or 1.0)
                return self._json(200, {"run_id": run_id})
            if len(parts) == 4 and parts[1] == "live":
                run = lots.run(parts[2])
                if run is None:
                    return self._json(404, {"error": "unknown live run"})
                if parts[3] == "push":
                    run.push(float(req.get("dpsi_deg")))
                elif parts[3] == "speed":
                    run.set_speed(req.get("speed"))
                elif parts[3] == "stop":
                    run.stop()
                else:
                    return self._json(404, {"error": "unknown endpoint"})
                return self._json(200, {"ok": True})
        except LayoutError as e:
            return self._json(400, {"error": str(e), "problems": e.problems})
        except KeyError as e:
            return self._json(404, {"error": str(e).strip("'")})
        except (ValueError, TypeError, AttributeError) as e:
            return self._json(400, {"error": str(e)})
        return self._json(404, {"error": "unknown endpoint"})


def make_server(lots, port=PORT, host="127.0.0.1", dist=DIST):
    srv = ThreadingHTTPServer((host, port), partial(Handler, directory=dist))
    srv.daemon_threads = True
    srv.lots = lots
    return srv


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--open", action="store_true", help="open the viewer in the default browser")
    a = ap.parse_args()
    if not os.path.exists(os.path.join(DIST, "index.html")):
        print("viewer/dist not found. Build it first:  cd viewer && npm install && npm run build")
        sys.exit(1)
    lots = Lots(process_pool, workers=a.workers)
    srv = make_server(lots, a.port)
    url = f"http://localhost:{a.port}"
    print(f"Parking guidance v2 design 3: {url}  ({lots.workers} solver processes; Ctrl+C to stop)", flush=True)
    if a.open:
        threading.Timer(0.5, webbrowser.open, (url,)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        lots.close()


if __name__ == "__main__":
    main()
