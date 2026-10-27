from math import cos, sin, hypot

import numpy as np
import pytest

from sim.collision import CollisionMap
from sim.lot import build_layout
from sim.model import VEH, wrap
from sim.planner import plan_bay, PSI_PLAN, CLEAR


@pytest.mark.parametrize("name,seed,bay", [("cross", 0, 5), ("angled", 1, 6), ("parallel", 0, 1), ("tandem", 0, 1)])
def test_plan_is_safe_and_reaches_the_bay(name, seed, bay):
    lay = build_layout(name, seed)
    cm = CollisionMap(lay)
    b = lay["bays"][bay]
    assert not b["occupied"]
    wp, _ = plan_bay(lay, cm, b)
    assert wp is not None
    psi = np.array([abs(w["psi"]) for w in wp])
    assert psi.max() <= PSI_PLAN + 1e-6                       # hitch angle stays under the planning limit
    clr = cm.clearance_many([(w["x"], w["y"], w["th"], w["psi"]) for w in wp])
    assert clr.min() >= CLEAR - 0.05                          # never within the safety margin of anything
    g, e = b["goal"], wp[-1]
    assert hypot(e["x"] - g[0], e["y"] - g[1]) < 0.7          # ends at the parked pose
    assert abs(wrap(e["th"] - g[2])) < 0.09 and abs(e["psi"]) < 0.11


def test_plan_is_dynamically_consistent():
    """Every waypoint must follow from the previous one under the real kinematics."""
    from sim.model import step
    lay = build_layout("cross", 0)
    cm = CollisionMap(lay)
    wp, _ = plan_bay(lay, cm, lay["bays"][5])
    for a, c in zip(wp, wp[1:]):
        d = hypot(c["x"] - a["x"], c["y"] - a["y"])
        if d < 1e-6:
            continue
        s = step((a["x"], a["y"], a["th"], a["psi"]), float(c["gear"]), c["delta"], d)
        assert abs(s[3] - c["psi"]) < 1e-3 and hypot(s[0] - c["x"], s[1] - c["y"]) < 1e-3
