from math import cos, sin, tan, pi, radians, hypot

import numpy as np

from sim.model import VEH, step, rollout, trailer_pose, footprints


def test_straight_line_keeps_psi_zero():
    s = (0.0, 0.0, 0.0, 0.0)
    for _ in range(200):
        s = step(s, -1.5, 0.0, 0.05)
    assert abs(s[3]) < 1e-12
    assert abs(s[0] - (-1.5 * 200 * 0.05)) < 1e-9
    assert abs(s[1]) < 1e-12


def test_constant_steer_traces_circle_radius_L1_over_tan_delta():
    delta = radians(20)
    R = VEH.L1 / tan(delta)
    s = (0.0, 0.0, 0.0, 0.0)
    traj = rollout(s, [1.0] * 2000, [delta] * 2000, 0.01)
    # circle centre is at (0, R) for th0 = 0; every point must sit R from it
    d = np.hypot(traj[:, 0] - 0.0, traj[:, 1] - R)
    assert np.allclose(d, R, atol=1e-4)


def test_hitch_angle_settles_to_steady_state_when_going_forward():
    """Forward motion on a fixed circle is self-stabilising: psi converges (PPT slide 3)."""
    delta = radians(10)
    s = (0.0, 0.0, 0.0, 0.3)
    traj = rollout(s, [2.0] * 6000, [delta] * 6000, 0.01)
    assert abs(traj[-1, 3] - traj[-500, 3]) < 1e-5
    assert abs(traj[500, 3] - traj[0, 3]) > 100 * abs(traj[-1, 3] - traj[-500, 3])


def test_reverse_is_unstable_without_correction():
    """Reversing with a small initial hitch angle and no steering makes psi grow (jackknife)."""
    s = (0.0, 0.0, 0.0, radians(2))
    traj = rollout(s, [-2.0] * 3000, [0.0] * 3000, 0.01)
    assert abs(traj[-1, 3]) > radians(30)


def test_trailer_geometry_consistent():
    s = (10.0, 5.0, 0.4, radians(20))
    tx, ty, th1 = trailer_pose(s)
    assert abs(th1 - (0.4 - radians(20))) < 1e-12
    hx, hy = s[0] + VEH.d * cos(s[2]), s[1] + VEH.d * sin(s[2])
    # hitch is exactly L2 ahead of the trailer axle along the trailer heading
    assert abs(hypot(hx - tx, hy - ty) - VEH.L2) < 1e-9
    assert abs(tx + VEH.L2 * cos(th1) - hx) < 1e-9


def test_trailer_axle_has_no_lateral_slip():
    """Non-holonomic constraint: trailer axle velocity is purely along its heading."""
    s = (0.0, 0.0, 0.3, radians(15))
    dt = 1e-4
    s2 = step(s, -1.0, radians(12), dt)
    (ax, ay, th1), (bx, by, _) = trailer_pose(s), trailer_pose(s2)
    vx, vy = (bx - ax) / dt, (by - ay) / dt
    lateral = -vx * sin(th1) + vy * cos(th1)
    assert abs(lateral) < 1e-3


def test_footprint_sizes():
    tractor, trailer = footprints((0.0, 0.0, 0.0, 0.0))
    xs = [p[0] for p in tractor]
    assert abs((max(xs) - min(xs)) - (VEH.tractor_rear + VEH.L1 + VEH.tractor_front)) < 1e-9
    ys = [p[1] for p in trailer]
    assert abs((max(ys) - min(ys)) - VEH.width) < 1e-9
