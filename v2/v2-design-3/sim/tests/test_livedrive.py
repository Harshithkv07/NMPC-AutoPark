"""Version 2 design 2: the NMPC driving live (sim/live.py), the tracker hook it rides on, and a drawn yard end to end."""
import time

import pytest

from sim.collision import CollisionMap
from sim.export import make_layout, solve_bay
from sim.live import LiveRun
from sim.lot import build_layout
from sim.model import VEH
from sim.planner import plan_bay
from sim.tracker import run

TANDEM = {"template": "tandem", "seed": 0}
YARD = {"label": "Test yard", "size": {"w": 120, "h": 80}, "start": [20, 40, 0],
        "bays": [{"cx": x, "cy": 71, "theta": -90, "approach": "reverse"} for x in (60, 66, 72)],
        "obstacles": [{"cx": 100, "cy": 20, "w": 6, "l": 10, "theta": 0}]}


@pytest.fixture(scope="module")
def tandem():
    lay = build_layout("tandem", 0)
    cm = CollisionMap(lay)
    bay = lay["bays"][1]
    wp, _ = plan_bay(lay, cm, bay)
    assert wp is not None
    return lay, cm, bay, wp


@pytest.mark.slow
def test_a_hook_that_says_nothing_changes_nothing(tandem):
    lay, cm, bay, wp = tandem
    calls = []
    a = run(lay, cm, wp, mode="nmpc", bay=bay)
    b = run(lay, cm, wp, mode="nmpc", bay=bay, hook=lambda t, s, fr, st: calls.append(t))
    assert calls and a["frames"] == b["frames"] and a["final"] == b["final"] and not b["stopped"]


@pytest.mark.slow
def test_the_hook_can_stop_a_run_and_push_the_trailer(tandem):
    lay, cm, bay, wp = tandem
    n = {"k": 0}

    def stop_after_20(t, s, fr, st):
        n["k"] += 1
        return {"stop": True} if n["k"] >= 20 else None
    r = run(lay, cm, wp, mode="nmpc", bay=bay, hook=stop_after_20)
    assert r["stopped"] and n["k"] == 20 and r["frames"][-1]["t"] < 6.0

    def push_once(t, s, fr, st):
        return {"psi_kick": 0.3} if 4.9 < t < 5.2 else None
    pushed = run(lay, cm, wp, mode="nmpc", bay=bay, hook=push_once)
    jump = [f for f in pushed["frames"] if 4.9 < f["t"] < 6.0]
    assert max(abs(f["psi"]) for f in jump) > 0.25                       # the hitch angle jumped by the push
    assert not pushed["jackknife"]                                       # and the NMPC caught it


@pytest.mark.slow
def test_a_live_run_keeps_wall_clock_pace_obeys_pushes_and_stops():
    r = solve_bay(TANDEM, None, 1)
    assert r["ok"] and r["drive"]["wp"]
    lay = make_layout(TANDEM)
    live = LiveRun(lay, 1, VEH, "nmpc", 2.0, r["drive"])
    t0 = time.time()
    time.sleep(3.0)
    snap = live.snapshot()
    sim_t = snap["frames"][-1][0]
    assert 3.5 < sim_t < 7.5, sim_t                                       # about 2x the 3 s of wall clock
    assert snap["solve_ms"]["n"] > 5 and snap["solve_ms"]["mean"] < 250  # each solve fits its 250 ms period
    live.push(-12)
    time.sleep(1.0)
    events = [e["kind"] for e in live.snapshot()["events"]]
    assert "push" in events
    live.stop()
    live.thread.join(timeout=10)
    end = live.snapshot()
    assert end["done"] and end["result"]["why"] == "stopped" and time.time() - t0 < 15


@pytest.mark.slow
def test_a_live_run_to_the_end_is_checked_like_a_certification():
    r = solve_bay(TANDEM, None, 1)
    live = LiveRun(make_layout(TANDEM), 1, VEH, "nmpc", 4.0, r["drive"])
    live.thread.join(timeout=120)
    snap = live.snapshot()
    assert snap["done"] and snap["error"] is None
    res = snap["result"]
    assert res["parked"] and not res["jackknife"] and res["max_psi_deg"] <= 60
    # undisturbed, the live run is the certified run
    assert abs(snap["frames"][-1][0] - r["plan"]["duration"]) < 0.3


@pytest.mark.slow
def test_a_drawn_yard_is_solved_end_to_end():
    r = solve_bay({"custom": YARD}, [1], 0, deep=True)
    assert r["ok"], r.get("reason")
    m = r["plan"]["metrics"]
    assert m["max_psi_deg"] <= 60 and m["min_clearance"] > 0.1
