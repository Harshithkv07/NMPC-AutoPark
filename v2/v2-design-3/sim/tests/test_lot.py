from math import radians

import pytest

from sim.lot import build_layout, LAYOUT_NAMES
from sim.collision import CollisionMap


@pytest.mark.parametrize("name", list(LAYOUT_NAMES))
def test_layouts_have_ten_bays_and_some_free(name):
    lay = build_layout(name, seed=1)
    assert len(lay["bays"]) == 10
    free = [b for b in lay["bays"] if not b["occupied"]]
    assert 3 <= len(free) <= 6


def test_fill_is_reproducible_from_seed():
    a = [b["occupied"] for b in build_layout("cross", seed=7)["bays"]]
    b = [b["occupied"] for b in build_layout("cross", seed=7)["bays"]]
    c = [b["occupied"] for b in build_layout("cross", seed=8)["bays"]]
    assert a == b and a != c


@pytest.mark.parametrize("name", list(LAYOUT_NAMES))
@pytest.mark.parametrize("seed", [0, 1, 2, 3])
def test_every_free_bay_goal_pose_is_collision_free(name, seed):
    lay = build_layout(name, seed)
    cm = CollisionMap(lay)
    for b in lay["bays"]:
        if b["occupied"]:
            continue
        g = b["goal"]
        assert cm.clearance((g[0], g[1], g[2], 0.0)) > 0.3, (name, seed, b["id"])


def test_start_pose_is_clear():
    for name in LAYOUT_NAMES:
        lay = build_layout(name, 0)
        assert CollisionMap(lay).clearance(tuple(lay["start"])) > 0.5


def test_collision_detected_against_parked_rig_and_wall():
    lay = build_layout("cross", 0)
    cm = CollisionMap(lay)
    occ = next(b for b in lay["bays"] if b["occupied"])
    g = occ["goal"]
    assert cm.collides((g[0], g[1], g[2], 0.0))               # on top of a parked rig
    b = lay["bounds"]
    assert cm.collides((b["xmax"] + 2, 0.0, 0.0, 0.0))        # outside the lot


def test_custom_fill_moves_only_the_edited_bays():
    """Version 2 'Edit fill': the lot keeps every seeded rig exactly where it was and changes only the clicked bays."""
    base = build_layout("cross", 4)
    occ = {b["id"] for b in base["bays"] if b["occupied"]}
    removed, added = min(occ), min(set(range(10)) - occ)
    edited = build_layout("cross", 4, occupied=(occ - {removed}) | {added})
    for b0, b1 in zip(base["bays"], edited["bays"]):
        if b0["id"] == removed:
            assert not b1["occupied"] and b1["parked"] is None
        elif b0["id"] == added:
            assert b1["occupied"] and b1["parked"] is not None
        else:
            assert b1["occupied"] == b0["occupied"] and b1["parked"] == b0["parked"]
    assert len(edited["obstacles"]) == len(occ)
    again = build_layout("cross", 4, occupied=(occ - {removed}) | {added})
    assert [b["parked"] for b in again["bays"]] == [b["parked"] for b in edited["bays"]]


def test_custom_fill_can_empty_or_fill_the_lot_and_rejects_unknown_bays():
    assert build_layout("angled", 0, occupied=[])["obstacles"] == []
    full = build_layout("parallel", 0, occupied=range(10))
    assert all(b["occupied"] for b in full["bays"]) and len(full["obstacles"]) == 10
    with pytest.raises(ValueError):
        build_layout("cross", 0, occupied=[10])
