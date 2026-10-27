"""End to end: the function the live server runs for every bay, on the real planner and NMPC."""
import pytest

from sim.export import solve_bay
from sim.lot import build_layout


@pytest.mark.slow
def test_solve_bay_certifies_the_reference_bay_exactly_as_the_library_does(monkeypatch):
    """With the reference NMPC horizon (sim/tracker.py STOP_AT_END = False) the engine still gives the slides' run."""
    import sim.tracker
    monkeypatch.setattr(sim.tracker, "STOP_AT_END", False)
    r = solve_bay({"template": "cross", "seed": 0}, None, 5)            # the run shown on the slides: cross layout, fill 1, bay 6
    assert r["ok"]
    m = r["plan"]["metrics"]
    assert m["max_psi_deg"] <= 60.0
    assert m["final"] == {"lon": 0.07, "lat": 0.58, "hdg": -4.7, "psi": -7.7}
    assert r["plan"]["baseline"]["jackknife"]


@pytest.mark.slow
def test_solve_bay_on_an_edited_fill():
    """A bay freed by editing the fill is planned around the trucks that remain."""
    base = build_layout("angled", 3)
    occ = sorted(b["id"] for b in base["bays"] if b["occupied"])
    freed = occ[0]
    r = solve_bay({"template": "angled", "seed": 3}, occ[1:], freed)
    assert r["job"] == ("angled", 3, freed)
    assert "ok" in r
    if r["ok"]:
        assert r["plan"]["metrics"]["max_psi_deg"] <= 60.0
        assert r["plan"]["metrics"]["min_clearance"] > 0.1
    else:
        assert r["reason"]
