import numpy as np

from sim.advisor import advise, turns_text


def _frames(segments):
    """segments: list of (duration_s, v, delta_rad) at 10 Hz."""
    out, t, x = [], 0.0, 0.0
    for dur, v, d in segments:
        for _ in range(int(dur * 10)):
            out.append({"t": round(t, 2), "x": x, "y": 0.0, "th": 0.0, "psi": 0.05, "v": v, "delta": d})
            t += 0.1
            x += v * 0.1
    return out


def test_turns_text_quarter_turns():
    assert turns_text(0.0) == "straight"
    assert turns_text(0.74) == "\u00be turn"
    assert turns_text(1.25) == "1\u00bc turns"
    assert turns_text(-2.0) == "full lock"


def test_forward_reverse_produces_stop_and_gear_labels():
    fr = _frames([(8, 1.5, 0.0), (1, 0.0, 0.0), (10, -1.0, 0.3), (8, -1.0, 0.0)])
    steps = advise(fr)
    kinds = [s["kind"] for s in steps]
    assert "stop" in kinds and steps[-1]["kind"] == "stop" and steps[-1]["label"].startswith("Stop")
    assert any(s["gear"] > 0 for s in steps) and any(s["gear"] < 0 for s in steps)
    left = [s for s in steps if s["kind"] == "drive" and s["gear"] < 0 and s["side"] == "left"]
    assert left and left[0]["turns"] > 0.5             # 0.3 rad road wheel at 20:1 is ~1 turn
    assert len(steps) <= 8                             # short enough for a human to follow


def test_steering_jitter_does_not_create_new_instructions():
    rng = np.random.default_rng(0)
    fr = _frames([(20, -1.0, 0.25)])
    for f in fr:
        f["delta"] += rng.normal(0, 0.01)
    drives = [s for s in advise(fr) if s["kind"] == "drive"]
    assert len(drives) == 1
