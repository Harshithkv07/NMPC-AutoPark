"""The rig is a parameter: the viewer's vehicle spec, and the planner and yard that follow from it."""
from math import radians

import pytest

from sim.advisor import lock_turns, turns_text
from sim.lot import BAY_L, RIG_LEN, Yard, build_layout
from sim.model import EDITABLE, VEH, rig_back, rig_front, vehicle_from, vehicle_json
from sim.planner import CLEAR, H_WEIGHT, PSI_DES, PSI_PLAN, RHO_TRAILER, tuning


def test_no_spec_or_the_defaults_in_degrees_is_exactly_the_default_rig():
    assert vehicle_from(None) is VEH and vehicle_from({}) is VEH
    spec = {"L1": 4.0, "L2": 8.0, "d": 0.5, "delta_max": 35, "psi_crit": 60, "psi_jack": 75}
    assert vehicle_from(spec) == VEH                                       # radians(35.0) is the default exactly


def test_spec_changes_only_what_it_names():
    v = vehicle_from({"L2": 11.5, "delta_max": 40})
    assert v.L2 == 11.5 and v.delta_max == radians(40) and v.L1 == VEH.L1 and v.psi_crit == VEH.psi_crit
    assert vehicle_json(v)["L2"] == 11.5 and vehicle_json(v)["width"] == VEH.width


@pytest.mark.parametrize("spec", [{"L2": 30}, {"L1": 1}, {"d": -0.1}, {"delta_max": 50}, {"psi_crit": 70},
                                  {"wheels": 18}, {"L1": "long"}, {"psi_crit": 62, "psi_jack": 64}, "long", [1]])
def test_bad_specs_are_rejected(spec):
    with pytest.raises((ValueError, TypeError)):
        vehicle_from(spec)


def test_both_ends_of_every_range_are_accepted():
    for k, (lo, hi) in EDITABLE.items():
        if k == "psi_jack":                              # the jackknife angle must stay above the hitch limit
            assert vehicle_from({k: lo, "psi_crit": lo - 5}) and vehicle_from({k: hi})
        elif k == "psi_crit":
            assert vehicle_from({k: lo}) and vehicle_from({k: hi, "psi_jack": hi + 10})
        else:
            assert vehicle_from({k: lo}) and vehicle_from({k: hi})


def test_the_default_rig_gets_the_original_planner_constants_and_yard():
    tu = tuning(VEH)
    assert tu.psi_plan == PSI_PLAN and tu.psi_des == tuple(PSI_DES) and tu.rho == RHO_TRAILER and tu.reach == 1.0
    yd = Yard(VEH)
    assert yd.bay_l == BAY_L and yd.length == RIG_LEN == rig_front(VEH) + rig_back(VEH) and yd.k == 1.0
    assert (CLEAR, H_WEIGHT) == (0.35, 3.0)


def test_a_long_rig_gets_a_bigger_yard_and_longer_trucks_and_the_fill_does_not_move():
    big = vehicle_from({"L1": 5.0, "L2": 12.0})
    a, b = build_layout("cross", 3), build_layout("cross", 3, veh=big)
    assert [x["occupied"] for x in a["bays"]] == [x["occupied"] for x in b["bays"]]
    assert b["aisle"] > a["aisle"] and b["bays"][0]["l"] > a["bays"][0]["l"]
    parked = next(x["parked"] for x in b["bays"] if x["occupied"])
    assert parked["l"] == Yard(big).length > RIG_LEN
    assert b["bounds"]["xmin"] <= a["bounds"]["xmin"]
    for x in b["bays"]:                                                    # the rig fits its bay lengthways
        assert x["l"] >= Yard(big).length


def test_a_lower_hitch_limit_pulls_the_planning_bound_with_it():
    tu = tuning(vehicle_from({"psi_crit": 45}))
    assert tu.psi_plan < radians(45) and max(tu.psi_des) < tu.psi_plan and tu.psi_cmd < tu.psi_plan
    assert tu.rho > RHO_TRAILER                                            # a smaller hitch angle means a wider turn


def test_full_lock_follows_the_steering_lock():
    assert lock_turns(VEH) == 1.75
    assert lock_turns(vehicle_from({"delta_max": 45})) == 2.5
    assert lock_turns(vehicle_from({"delta_max": 25})) == 1.25
    assert turns_text(1.75) == "full lock" and turns_text(1.75, 2.5) == "1¾ turns" and turns_text(1.25, 1.25) == "full lock"
