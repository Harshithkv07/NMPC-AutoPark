"""The live server's HTTP contract, with the solver replaced by a fast stub (the real one is tested in test_tracker)."""
import json
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import pytest

from server import Lots, make_server


def stub_solver(src, occupied, bid, veh=None, deep=False):
    """Even bays certify at once; bays 1, 5, 9 only on the second attempt (deep); bays 3, 7 never."""
    time.sleep(0.15 if deep else 0.05)
    job = (src.get("template", "custom"), src.get("seed"), bid)
    if bid % 2 == 0 or (deep and bid % 4 == 1):
        return {"job": job, "ok": True, "wall": 0.05, "drive": {"wp": None, "opts": {}},
                "plan": {"duration": (20.0 if deep else 10.0) + bid, "steps": []}}
    return {"job": job, "ok": False,
            "reason": "guidance not certified (clearance, after 3 attempts)" if deep else "guidance not certified (clearance)"}


class StubRun:
    """Stands in for sim.live.LiveRun: five frames, and a record of what the API asked of it."""
    made = []

    def __init__(self, layout, bid, veh, controller, speed, drive):
        if speed not in (0.5, 1.0, 2.0, 4.0):
            raise ValueError("bad speed")
        self.args, self.pushes, self.speeds, self.stopped = (layout["name"], bid, controller, speed, drive), [], [], False
        StubRun.made.append(self)

    def snapshot(self, frm=0, hfrom=0, efrom=0):
        frames = [[round(0.1 * i, 1), float(i), 0.0, 0.0, 0.0, 1.0, 0.0] for i in range(5)]
        return {"frames": frames[frm:], "hor": [], "events": [], "n": [5, 0, 0], "state": "driving",
                "done": self.stopped, "result": None, "error": None, "speed": 1.0, "solve_ms": {"last": 12.0, "mean": 12.0, "n": 1}}

    def push(self, d):
        self.pushes.append(d)

    def set_speed(self, s):
        if s not in (0.5, 1, 2, 4):
            raise ValueError("bad speed")
        self.speeds.append(s)

    def stop(self):
        self.stopped = True


YARD = {"label": "Test yard", "size": {"w": 120, "h": 80}, "start": [20, 40, 0],
        "bays": [{"cx": x, "cy": 71, "theta": -90, "approach": "reverse"} for x in (60, 66, 72)],
        "obstacles": [{"cx": 100, "cy": 20, "w": 6, "l": 10, "theta": 0}]}


@pytest.fixture()
def api(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>viewer</title>")
    lots = Lots(lambda n: ThreadPoolExecutor(n), solver=stub_solver, workers=4, live=StubRun)
    srv = make_server(lots, port=0, dist=str(tmp_path))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"

    def call(path, body=None, raw=None):
        data = raw if raw is not None else (None if body is None else json.dumps(body).encode())
        req = urllib.request.Request(base + path, data=data, method="POST" if data is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                ctype = r.headers.get("Content-Type", "")
                payload = r.read()
                return r.status, (json.loads(payload) if "json" in ctype else payload.decode())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    yield call
    srv.shutdown()
    srv.server_close()
    lots.close()


def wait_done(call, lot_id):
    for _ in range(200):
        code, st = call(f"/api/lots/{lot_id}")
        assert code == 200
        if st["done"]:
            return st
        time.sleep(0.02)
    raise AssertionError("lot never finished")


def test_health_and_static_files(api):
    code, h = api("/api/health")
    assert code == 200 and h["version"] == 2 and h["workers"] == 4
    assert h["vehicle"]["limits"]["L2"] == [5.0, 13.0] and h["vehicle"]["jack_gap"] == 5.0
    code, body = api("/")
    assert code == 200 and "viewer" in body


def test_new_lot_is_solved_bay_by_bay(api):
    code, res = api("/api/lots", {"layout": "cross", "seed": 0})
    assert code == 200
    lot = res["lot"]
    assert lot["layout"]["live"] and not lot["layout"]["custom"] and lot["plans"] == {}
    free = [b["id"] for b in lot["layout"]["bays"] if b["status"] != "occupied"]
    assert free and all(b["status"] == "pending" and "reason" not in b
                        for b in lot["layout"]["bays"] if b["id"] in free)
    st = wait_done(api, res["lot_id"])
    got = {b["id"]: b for b in st["bays"]}
    assert sorted(got) == sorted(free)
    for bid, b in got.items():
        assert b["status"] == ("ok" if bid % 2 == 0 or bid % 4 == 1 else "infeasible")
        if b["status"] == "infeasible":
            assert b["reason"] == "guidance not certified (clearance, after 3 attempts)"
    ok = [bid for bid in free if bid % 2 == 0]
    if ok:
        assert api(f"/api/lots/{res['lot_id']}/plans/{ok[0]}") == (200, {"duration": 10.0 + ok[0], "steps": []})
    late = [bid for bid in free if bid % 4 == 1]           # certified by the second attempt: that plan is served
    if late:
        assert api(f"/api/lots/{res['lot_id']}/plans/{late[0]}") == (200, {"duration": 20.0 + late[0], "steps": []})
    bad = [bid for bid in free if bid % 4 == 3]
    if bad:
        assert api(f"/api/lots/{res['lot_id']}/plans/{bad[0]}")[0] == 404


def test_a_failed_first_attempt_is_deepening_until_the_second_one_decides(api):
    res = api("/api/lots", {"layout": "cross", "seed": 0})[1]
    free = [b["id"] for b in res["lot"]["layout"]["bays"] if b["status"] != "occupied"]
    seen = {}
    for _ in range(400):
        st = api(f"/api/lots/{res['lot_id']}")[1]
        for b in st["bays"]:
            seen.setdefault(b["id"], []).append(b["status"])
            if b["status"] == "deepening":
                assert not st["done"]                      # the lot is not finished while a bay is still being retried
        if st["done"]:
            break
        time.sleep(0.01)
    assert st["done"]
    for bid in free:
        if bid % 2:                                        # failed at first: must have shown "deepening", never straight red
            assert "deepening" in seen[bid], (bid, seen[bid])
            assert seen[bid].index("deepening") < len(seen[bid]) - 1
            assert "infeasible" not in seen[bid][:seen[bid].index("deepening")]
        else:
            assert "deepening" not in seen[bid]


def test_without_deepening_a_failed_first_attempt_is_final():
    lots = Lots(lambda n: ThreadPoolExecutor(n), solver=stub_solver, workers=4, deepen=False)
    try:
        lot_id, lot = lots.create({"layout": "cross", "seed": 0})
        for _ in range(200):
            st = lots.status(lot_id)
            if st["done"]:
                break
            time.sleep(0.02)
        assert st["done"]
        for b in st["bays"]:
            assert b["status"] == ("ok" if b["id"] % 2 == 0 else "infeasible")
            assert "deepening" not in b["status"]
    finally:
        lots.close()


def test_random_seed_and_custom_fill(api):
    code, res = api("/api/lots", {"layout": "angled"})
    assert code == 200 and res["lot"]["layout"]["seed"] >= 1000
    code, res = api("/api/lots", {"layout": "tandem", "seed": 3, "occupied": [0, 9]})
    assert code == 200 and res["lot"]["layout"]["custom"]
    occ = [b["id"] for b in res["lot"]["layout"]["bays"] if b["occupied"]]
    assert occ == [0, 9]
    st = wait_done(api, res["lot_id"])
    assert len(st["bays"]) == 8


def test_a_new_lot_replaces_a_busy_one(api):
    first = api("/api/lots", {"layout": "cross", "seed": 1})[1]["lot_id"]
    second = api("/api/lots", {"layout": "parallel", "seed": 2})[1]["lot_id"]
    assert first != second
    assert wait_done(api, second)["done"]


def test_vehicle_sizes_the_lot_and_reaches_the_solver(api):
    default = api("/api/lots", {"layout": "cross", "seed": 2})[1]["lot"]
    code, res = api("/api/lots", {"layout": "cross", "seed": 2, "vehicle": {"L1": 5.0, "L2": 12.0}})
    assert code == 200
    lot = res["lot"]
    assert lot["vehicle"]["L1"] == 5.0 and lot["vehicle"]["L2"] == 12.0 and lot["vehicle"]["d"] == default["vehicle"]["d"]
    # a longer rig gets longer bays and longer parked trucks; which bays are filled does not change
    assert lot["layout"]["bays"][0]["l"] > default["layout"]["bays"][0]["l"]
    assert [b["occupied"] for b in lot["layout"]["bays"]] == [b["occupied"] for b in default["layout"]["bays"]]
    parked = next(b["parked"] for b in lot["layout"]["bays"] if b["occupied"])
    assert parked["l"] == 5.0 + 1.0 + 12.0 - 0.5 + 2.0
    assert wait_done(api, res["lot_id"])["done"]


def test_layout_preview_is_unsolved_and_matches_the_lot(api):
    spec = {"layout": "parallel", "seed": 1, "occupied": [2, 3], "vehicle": {"L2": 10.0, "delta_max": 40}}
    code, res = api("/api/layout", spec)
    assert code == 200 and res["lot"]["plans"] == {}
    solved = api("/api/lots", spec)[1]["lot"]
    geometry = lambda lot: [{k: b[k] for k in ("cx", "cy", "theta", "w", "l", "goal", "occupied", "parked")}
                            for b in lot["layout"]["bays"]]
    assert geometry(res["lot"]) == geometry(solved)
    assert res["lot"]["layout"]["bounds"] == solved["layout"]["bounds"]
    assert res["lot"]["vehicle"] == solved["vehicle"]


def test_bad_vehicles(api):
    assert api("/api/lots", {"layout": "cross", "vehicle": {"L2": 30}})[0] == 400
    assert api("/api/lots", {"layout": "cross", "vehicle": {"wheels": 18}})[0] == 400
    assert api("/api/lots", {"layout": "cross", "vehicle": {"psi_crit": 62, "psi_jack": 64}})[0] == 400
    assert api("/api/lots", {"layout": "cross", "vehicle": "long"})[0] == 400
    assert api("/api/layout", {"layout": "cross", "seed": 0, "vehicle": {"L1": None}})[0] == 400
    assert api("/api/layout", {"layout": "cross"})[0] == 400          # a preview needs the seed


def test_bad_requests(api):
    assert api("/api/lots", {"layout": "diagonal"})[0] == 400
    assert api("/api/lots", {"layout": "cross", "occupied": [42]})[0] == 400
    assert api("/api/lots", {"layout": "cross", "seed": "abc"})[0] == 400
    assert api("/api/lots", raw=b"not json")[0] == 400
    assert api("/api/lots/nope")[0] == 404
    assert api("/api/other")[0] == 404


# ---------- drawn yards ----------
def test_a_drawn_yard_is_solved_like_a_template(api):
    code, res = api("/api/lots", {"custom": YARD, "occupied": [1]})
    assert code == 200, res
    lay = res["lot"]["layout"]
    assert lay["drawn"] and lay["name"] == "custom" and lay["label"] == "Test yard" and len(lay["bays"]) == 3
    assert [b["occupied"] for b in lay["bays"]] == [False, True, False]
    assert lay["blocks"] == [{"cx": 100.0, "cy": 20.0, "theta": 0.0, "l": 10.0, "w": 6.0}]
    assert lay["bounds"] == {"xmin": 0.0, "xmax": 120.0, "ymin": 0.0, "ymax": 80.0}
    st = wait_done(api, res["lot_id"])
    assert sorted(b["id"] for b in st["bays"]) == [0, 2]


def test_a_drawn_yard_with_problems_is_refused_item_by_item(api):
    bad = dict(YARD, obstacles=[{"cx": 66, "cy": 71, "w": 3, "l": 3, "theta": 0}])     # a pillar inside bay 2
    code, res = api("/api/lots", {"custom": bad})
    assert code == 400 and any(p["item"] == "bay 2" and "obstacle 1" in p["message"] for p in res["problems"])
    code, res = api("/api/layout", {"custom": bad})                                    # the preview reports the same
    assert code == 200 and res["problems"] and res["lot"]["layout"]["drawn"]
    code, res = api("/api/layout", {"custom": YARD})
    assert code == 200 and res["problems"] == []
    assert api("/api/lots", {"custom": {"size": {"w": 5, "h": 5}}})[0] == 400          # malformed: plain 400
    assert api("/api/lots", {"custom": dict(YARD, bays=[])})[0] == 400


# ---------- live NMPC ----------
def test_live_runs_start_poll_push_and_stop(api):
    StubRun.made.clear()
    res = api("/api/lots", {"layout": "cross", "seed": 0})[1]
    st = wait_done(api, res["lot_id"])
    ok = [b["id"] for b in st["bays"] if b["status"] == "ok"]
    bad = [b["id"] for b in st["bays"] if b["status"] == "infeasible"]
    code, r = api("/api/live", {"lot_id": res["lot_id"], "bay": ok[0], "controller": "nmpc", "speed": 2})
    assert code == 200 and r["run_id"]
    run = StubRun.made[-1]
    assert run.args[:4] == ("cross", ok[0], "nmpc", 2.0) and run.args[4] == {"wp": None, "opts": {}}
    code, snap = api(f"/api/live/{r['run_id']}")
    assert code == 200 and len(snap["frames"]) == 5 and snap["n"] == [5, 0, 0]
    assert len(api(f"/api/live/{r['run_id']}?from=3")[1]["frames"]) == 2
    assert api(f"/api/live/{r['run_id']}/push", {"dpsi_deg": -10})[0] == 200 and run.pushes == [-10.0]
    assert api(f"/api/live/{r['run_id']}/speed", {"speed": 4})[0] == 200 and run.speeds == [4]
    assert api(f"/api/live/{r['run_id']}/speed", {"speed": 3})[0] == 400
    assert api(f"/api/live/{r['run_id']}/stop", {})[0] == 200 and run.stopped
    # a second run replaces the first; bays without certified guidance and unknown runs are refused
    code, r2 = api("/api/live", {"lot_id": res["lot_id"], "bay": ok[0]})
    assert code == 200 and r2["run_id"] != r["run_id"] and StubRun.made[-2].stopped
    if bad:
        assert api("/api/live", {"lot_id": res["lot_id"], "bay": bad[0]})[0] == 400
    assert api("/api/live", {"lot_id": "nope", "bay": 0})[0] == 404
    assert api("/api/live/L999")[0] == 404
