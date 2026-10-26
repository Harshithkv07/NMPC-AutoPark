"""Version 2 design 2: yards drawn in the viewer (sim/custom.py)."""
from math import cos, radians, sin

import pytest

from sim.collision import CollisionMap
from sim.custom import build_custom, parse, validate
from sim.lot import BAY_L, BAY_W, build_layout
from sim.model import VEH, vehicle_from

YARD = {"label": "Test yard", "size": {"w": 120, "h": 80}, "start": [20, 40, 0],
        "bays": [{"cx": x, "cy": 71, "theta": -90, "approach": "reverse"} for x in (60, 66, 72)]
        + [{"cx": 60, "cy": 9, "theta": 0, "approach": "forward"}],
        "obstacles": [{"cx": 100, "cy": 20, "w": 6, "l": 10, "theta": 0}]}


def test_a_drawn_bay_gets_the_same_goal_as_a_template_bay():
    """A template bay redrawn by hand (same centre, heading, approach) parks the rig in the same place."""
    lay = build_layout("cross", 0)
    b = lay["bays"][2]
    from math import degrees
    spec = {"size": {"w": 200, "h": 120}, "start": [10, 60, 0],
            "bays": [{"cx": b["cx"] + 40, "cy": b["cy"] + 60, "theta": degrees(b["theta"]), "approach": b["approach"]}],
            "obstacles": []}
    c = build_custom(spec)["bays"][0]
    assert c["l"] == BAY_L and c["w"] == BAY_W
    assert abs(c["goal"][0] - (b["goal"][0] + 40)) < 1e-9 and abs(c["goal"][1] - (b["goal"][1] + 60)) < 1e-9
    assert abs(c["goal"][2] - b["theta"]) < 1e-9


def test_the_goal_pose_is_free_and_inside_its_bay():
    lay = build_custom(YARD)
    cm = CollisionMap(lay)
    for b in lay["bays"]:
        g = b["goal"]
        assert cm.clearance((g[0], g[1], g[2], 0.0)) > 0.3
        assert b["lead"] > 0


def test_the_run_in_is_measured_and_an_obstacle_in_front_shortens_it():
    open_ = build_custom(YARD)["bays"][0]
    # a wall 3 m in front of bay 1's mouth (the mouth is at y = 62, the truck backs in from below)
    walled = dict(YARD, obstacles=YARD["obstacles"] + [{"cx": 60, "cy": 57.5, "w": 1, "l": 8, "theta": 0}])
    short = build_custom(walled)["bays"][0]
    assert short["lead"] < open_["lead"]
    problems = validate(walled)
    assert any(p["item"] == "bay 1" and "free in front of its mouth" in p["message"] for p in problems)
    assert validate(YARD) == []


def test_parked_trucks_depend_only_on_the_drawing():
    a = build_custom(YARD, occupied=[1, 2])
    b = build_custom(YARD, occupied=[1, 2])
    assert [x["parked"] for x in a["bays"]] == [x["parked"] for x in b["bays"]]
    assert len(a["obstacles"]) == 1 + 2                  # the drawn obstacle and two parked trucks
    with pytest.raises(ValueError):
        build_custom(YARD, occupied=[9])


@pytest.mark.parametrize("change,item,text", [
    ({"bays": [{"cx": 1, "cy": 71, "theta": -90, "approach": "reverse"}]}, "bay 1", "outside the yard"),
    ({"bays": [{"cx": 60, "cy": 71, "theta": -90, "approach": "reverse", "l": 10}]}, "bay 1", "long"),
    ({"bays": [{"cx": 60, "cy": 71, "theta": -90, "approach": "reverse", "w": 2.6}]}, "bay 1", "wide"),
    ({"bays": [{"cx": 60, "cy": 71, "theta": -90, "approach": "reverse"}, {"cx": 62, "cy": 71, "theta": -90, "approach": "reverse"}]},
     "bay 2", "overlaps bay 1"),
    ({"obstacles": [{"cx": 66, "cy": 71, "w": 2, "l": 2, "theta": 0}]}, "bay 2", "overlaps obstacle 1"),
    ({"start": [3, 40, 0]}, "start", "overlaps"),
    ({"obstacles": [{"cx": 500, "cy": 20, "w": 2, "l": 2, "theta": 0}]}, "obstacle 1", "outside"),
])
def test_problems_are_reported_item_by_item(change, item, text):
    problems = validate(dict(YARD, **change))
    assert any(p["item"] == item and text in p["message"] for p in problems), problems


def test_bays_without_a_length_fit_the_rig_and_drawn_lengths_are_checked_against_it():
    long = vehicle_from({"L1": 5.0, "L2": 12.0})
    tall = dict(YARD, size={"w": 120, "h": 90})                          # room for the long rig's 23 m bays
    assert validate(tall) == [] and validate(tall, long) == []          # no length drawn: sized for the rig
    assert any("outside the yard" in p["message"] for p in validate(YARD, long))   # ...which the 80 m yard cannot hold
    fixed = dict(YARD, bays=[dict(b, l=18.0) for b in YARD["bays"]])
    assert validate(fixed) == []
    assert any("long" in p["message"] for p in validate(fixed, long))    # 18 m is too short for a 19.5 m rig


@pytest.mark.parametrize("bad", [
    None, [], {"size": {"w": 10, "h": 80}}, dict(YARD, bays=[]), dict(YARD, start=[1, 2]),
    dict(YARD, bays=[{"cx": 1, "cy": 1, "theta": 0, "approach": "sideways"}]), dict(YARD, bays=[{"cx": "a", "cy": 1, "theta": 0}]),
])
def test_malformed_specs_raise(bad):
    with pytest.raises((ValueError, TypeError)):
        parse(bad)


def test_a_rotated_obstacle_is_solid_where_it_is_drawn():
    spec = dict(YARD, obstacles=[{"cx": 100, "cy": 30, "w": 2, "l": 12, "theta": 45}])
    cm = CollisionMap(build_custom(spec))
    along = (100 + 5 * cos(radians(45)), 30 + 5 * sin(radians(45)))     # 5 m along its length: inside
    across = (100 + 5 * cos(radians(135)), 30 + 5 * sin(radians(135)))  # 5 m across it: outside
    assert cm.sdf_at([along[0]], [along[1]])[0] < 0 < cm.sdf_at([across[0]], [across[1]])[0]
