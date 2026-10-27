"""The benchmark's additions to the closed loop (tracker.run plant / noise / delay / push, the cascade controller) and the
planner ablation (sim/evaluate.py)."""
from dataclasses import replace
from math import radians

import pytest

from sim import evaluate, planner
from sim.collision import CollisionMap
from sim.export import certify
from sim.lot import build_layout
from sim.model import VEH
from sim.tracker import run


@pytest.fixture(scope="module")
def tandem():
    lay = build_layout("tandem", 0)
    cm = CollisionMap(lay)
    bay = lay["bays"][2]
    wp, _ = planner.plan_bay(lay, cm, bay)
    return lay, cm, bay, wp


def test_cascade_parks_a_drive_in_bay(tandem):
    lay, cm, bay, wp = tandem
    r = run(lay, cm, wp, mode="cascade", bay=bay)
    assert certify(bay, r)[0]
    assert r["solver"] is None


def test_options_off_change_nothing(tandem):
    lay, cm, bay, wp = tandem
    a = run(lay, cm, wp, mode="cascade", bay=bay)
    b = run(lay, cm, wp, mode="cascade", bay=bay, plant=VEH, noise=None, delay=0.0)
    assert a["frames"] == b["frames"]


def test_noise_is_seeded_and_only_seen_by_the_controller(tandem):
    lay, cm, bay, wp = tandem
    nz = {"pos": 0.1, "th": radians(1), "psi": radians(1), "seed": 7}
    a = run(lay, cm, wp, mode="cascade", bay=bay, noise=nz)
    b = run(lay, cm, wp, mode="cascade", bay=bay, noise=nz)
    c = run(lay, cm, wp, mode="cascade", bay=bay, noise=dict(nz, seed=8))
    assert a["frames"] == b["frames"] and a["frames"] != c["frames"]


def test_delay_lags_the_steering(tandem):
    lay, cm, bay, wp = tandem
    a = run(lay, cm, wp, mode="cascade", bay=bay)
    b = run(lay, cm, wp, mode="cascade", bay=bay, delay=0.5)
    first = lambda r: next(f["t"] for f in r["frames"] if abs(f["delta"]) > 1e-3)
    assert first(b) >= first(a) + 0.45


def test_plant_mismatch_and_push_change_the_run(tandem):
    lay, cm, bay, wp = tandem
    a = run(lay, cm, wp, mode="cascade", bay=bay)
    b = run(lay, cm, wp, mode="cascade", bay=bay, plant=replace(VEH, L2=VEH.L2 * 1.1))
    c = run(lay, cm, wp, mode="cascade", bay=bay, disturbance={"final_after": 1.0, "psi_kick": radians(10)})
    assert a["final"] != b["final"]
    assert c["max_psi"] >= a["max_psi"] + radians(5)


def test_fixed_primitives_steer_constantly():
    out = evaluate._expand_node_fixed((0.0, 0.0, 0.0, 0.0), (1, -1), _Free(), VEH)
    assert len(out) == 10 and all(p is not None for p in out)
    for prim in out:
        assert len({round(d, 9) for _, d in prim}) == 1          # one steering angle along the whole arc
    assert max(abs(prim[0][1]) for prim in out) == pytest.approx(planner.PLAN_STEER_FRAC * VEH.delta_max)


def test_planner_variants_restore_the_planner():
    sc = ("tandem", 0, 2)
    _, info = evaluate._plan(sc, "fixed")
    assert info["found"]
    assert planner._expand_node is not evaluate._expand_node_fixed


class _Free:
    def clearance_many(self, X):
        import numpy as np
        return np.full(len(X), 99.0)
