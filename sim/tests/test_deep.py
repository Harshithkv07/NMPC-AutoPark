"""The deep pass: a bay that fails its first attempt is tried again the way a driver would."""
import pytest

from sim.export import ABORT_CLR, MIN_CLR, _join, _safe, _why, certify, solve_bay
from sim.lot import build_layout
from sim.tracker import DWELL


def _leg(t_end, x0, x1, **flags):
    """A fake closed-loop run: moves from x0 to x1 over t_end seconds, logged every 0.1 s, ending at rest."""
    n = int(round(t_end / 0.1))
    frames = [{"t": round(0.05 + 0.1 * i, 2), "x": x0 + (x1 - x0) * i / n, "y": 0.0, "th": 0.0, "psi": 0.0,
               "v": 1.0 if i < n else 0.0, "delta": 0.1} for i in range(n + 1)]
    r = {"frames": frames, "phases": [{"seg": 0, "gear": 1, "t0": 0.0, "length": 5.0}], "duration": t_end,
         "jackknife": False, "psi_limit_violated": False, "min_clearance": 1.0, "max_psi": 0.5,
         "final": {"x": x1, "y": 0.0, "th": 0.0, "psi": 0.0}, "mode": "nmpc",
         "solver": {"solves": 10, "ms": 100.0, "fail": 0}}
    r.update(flags)
    return r


def test_one_leg_joins_to_itself():
    leg = _leg(5.0, 0.0, 5.0)
    assert _join([leg]) is leg


def test_legs_join_into_one_run_that_stands_still_between_them():
    a, b = _leg(5.0, 0.0, 5.0), _leg(4.0, 5.0, 2.0)
    j = _join([a, b])
    t = [f["t"] for f in j["frames"]]
    assert t == sorted(t) and len(set(t)) == len(t)                      # time only moves forward
    t_end = a["frames"][-1]["t"]
    gap = [f for f in j["frames"] if t_end < f["t"] < t_end + DWELL]
    assert len(gap) >= 10 and all(f["v"] == 0.0 and f["x"] == 5.0 for f in gap)    # the rig stands still between the legs
    assert j["frames"][-1]["x"] == 2.0 and j["final"] == b["final"]
    assert j["duration"] == j["frames"][-1]["t"] > a["duration"] + b["duration"]
    assert j["solver"]["solves"] == 20 and j["phases"][1]["t0"] > a["duration"]


def test_every_limit_is_checked_over_all_legs():
    ok, bad = _leg(5.0, 0.0, 5.0), _leg(4.0, 5.0, 2.0, min_clearance=0.05, max_psi=0.9)
    j = _join([ok, bad])
    assert j["min_clearance"] == 0.05 and j["max_psi"] == 0.9 and not _safe(j)
    assert _why(j) == "clearance"
    assert _join([_leg(5.0, 0.0, 5.0, jackknife=True), ok])["jackknife"]
    assert _why(_join([_leg(5.0, 0.0, 5.0, psi_limit_violated=True), ok])) == "hitch limit"


def test_a_run_that_stopped_to_replan_is_safe_but_not_certified_until_it_is_parked():
    stopped = _leg(5.0, 0.0, 5.0, aborted=True, min_clearance=ABORT_CLR - 0.01)
    assert _safe(stopped) and MIN_CLR < stopped["min_clearance"] < ABORT_CLR
    assert _why(stopped) == "clearance"                                   # if no leg ever parks it, it is a clearance failure
    bay = build_layout("cross", 0)["bays"][1]
    ok, _ = certify(bay, dict(stopped, final={"x": 0.0, "y": 0.0, "th": 0.0, "psi": 0.0}))
    assert not ok


@pytest.mark.slow
def test_a_bay_that_ends_crooked_certifies_when_the_rig_pulls_forward_and_parks_again(monkeypatch):
    """Parallel fill 1, bay 9 with the reference NMPC horizon: the first attempt ends 0.99 m off-centre (limit 0.8). Safe, so
    the deep pass parks again. (The current horizon parks it at the first attempt, see test_current_horizon...)"""
    import sim.tracker
    monkeypatch.setattr(sim.tracker, "STOP_AT_END", False)
    first = solve_bay({"template": "parallel", "seed": 0}, None, 8)
    assert not first["ok"] and first["reason"] == "guidance not certified (parking accuracy)"
    r = solve_bay({"template": "parallel", "seed": 0}, None, 8, deep=True)
    assert r["ok"]
    m = r["plan"]["metrics"]
    assert m["retry"] == {"attempts": 1, "legs": 2}
    assert m["max_psi_deg"] <= 60.0 and m["min_clearance"] > MIN_CLR
    assert abs(m["final"]["lat"]) < 0.8 and abs(m["final"]["lon"]) < 0.8 and abs(m["final"]["hdg"]) < 10
    kinds = [s["kind"] for s in r["plan"]["steps"]]
    assert kinds.count("stop") >= 2 and kinds[-1] == "stop"               # a stop between the legs, and at the end


@pytest.mark.slow
def test_the_deep_pass_never_changes_a_bay_that_certifies_at_once():
    a, b = solve_bay({"template": "cross", "seed": 0}, None, 5), solve_bay({"template": "cross", "seed": 0}, None, 5, deep=True)
    assert a["ok"] and b["ok"]
    for r in (a, b):
        r["plan"]["metrics"].pop("solve_ms")
    assert a["plan"] == b["plan"] and "retry" not in b["plan"]["metrics"]


@pytest.mark.slow
def test_current_horizon_parks_the_bay_reference_could_not_at_the_first_attempt():
    """The NMPC's prediction stops where the segment ends (sim/tracker.py STOP_AT_END): the bay above certifies at once."""
    r = solve_bay({"template": "parallel", "seed": 0}, None, 8)
    assert r["ok"] and "retry" not in r["plan"]["metrics"]
    assert abs(r["plan"]["metrics"]["final"]["lat"]) < 0.8
