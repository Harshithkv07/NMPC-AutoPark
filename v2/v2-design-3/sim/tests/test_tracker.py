"""The project's central claim, tested in closed loop on the same plan and the same plant."""
import pytest

from sim.collision import CollisionMap
from sim.lot import build_layout
from sim.planner import plan_bay
from sim.tracker import run


@pytest.mark.slow
def test_nmpc_never_jackknifes_where_an_unaided_driver_does():
    lay = build_layout("cross", 0)
    cm = CollisionMap(lay)
    bay = lay["bays"][5]
    wp, _ = plan_bay(lay, cm, bay)

    naive = run(lay, cm, wp, mode="naive", bay=bay)
    assert naive["jackknife"], "reversing without a hitch model should fold the rig"

    nmpc = run(lay, cm, wp, mode="nmpc", bay=bay)
    assert not nmpc["jackknife"]
    assert not nmpc["psi_limit_violated"]                     # hard constraint held at every step
    assert nmpc["min_clearance"] > 0.1                        # and it did not hit anything
    g, f = bay["goal"], nmpc["final"]
    assert abs(f["x"] - g[0]) < 1.0 and abs(f["y"] - g[1]) < 1.0


def test_forward_parking_is_stable_for_both_controllers():
    """Forward motion is self-stabilising (PPT slide 3): the difference only exists in reverse."""
    lay = build_layout("tandem", 0)
    cm = CollisionMap(lay)
    bay = lay["bays"][1]
    wp, _ = plan_bay(lay, cm, bay)
    for mode in ("naive", "nmpc"):
        r = run(lay, cm, wp, mode=mode, bay=bay)
        assert not r["jackknife"]
