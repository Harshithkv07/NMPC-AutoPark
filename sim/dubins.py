"""Shortest Dubins path length between two planar poses (heuristic for the planner).

Pure math, no allocation: called for every generated search node. `sample` is only used by tests
to prove the closed-form formulas by integrating the path.
"""
from math import acos, atan2, cos, sin, sqrt, pi

TWO_PI = 2.0 * pi


def _mod(a):
    return a % TWO_PI


def _lrl(a, b, d):
    """LRL words in unit-radius coordinates: start (0,0,a), goal (d,0,b). Returns [(t, p, q)].
    Centre of the middle (right-turn) circle is 2 from both left-turn centres."""
    c1 = (-sin(a), cos(a))
    c3 = (d - sin(b), cos(b))
    vx, vy = c3[0] - c1[0], c3[1] - c1[1]
    D = sqrt(vx * vx + vy * vy)
    if D > 4.0:
        return []
    base = atan2(vy, vx)
    gam = acos(D / 4.0)
    res = []
    for sgn in (1.0, -1.0):
        ang = base + sgn * gam
        c2 = (c1[0] + 2 * cos(ang), c1[1] + 2 * sin(ang))
        th12 = ang                                        # c1 -> T12
        th23 = atan2(c3[1] - c2[1], c3[0] - c2[0])        # c2 -> T23
        t_ = _mod(th12 - (a - pi / 2))                    # ccw on circle 1
        p_ = _mod((th12 + pi) - th23)                     # cw on circle 2
        q_ = _mod((b - pi / 2) - (th23 + pi))             # ccw on circle 3
        res.append((t_, p_, q_))
    return res


def _ccc(a, b, d):
    out = [("LRL", w) for w in _lrl(a, b, d)]
    out += [("RLR", w) for w in _lrl(-a, -b, d)]          # mirror image
    return out


def dubins_words(x0, y0, th0, x1, y1, th1, rho):
    """Return list of (length, word, (t, p, q)) for every feasible CSC word; lengths in metres."""
    dx, dy = x1 - x0, y1 - y0
    D = sqrt(dx * dx + dy * dy)
    d = D / rho
    phi = atan2(dy, dx) if D > 1e-9 else 0.0
    a, b = _mod(th0 - phi), _mod(th1 - phi)
    sa, sb, ca, cb = sin(a), sin(b), cos(a), cos(b)
    cab = cos(a - b)
    out = []

    p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb)                         # LSL
    if p2 >= 0:
        tmp = atan2(cb - ca, d + sa - sb)
        out.append(("LSL", _mod(-a + tmp), sqrt(p2), _mod(b - tmp)))
    p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa)                         # RSR
    if p2 >= 0:
        tmp = atan2(ca - cb, d - sa + sb)
        out.append(("RSR", _mod(a - tmp), sqrt(p2), _mod(-b + tmp)))
    p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb)                        # LSR
    if p2 >= 0:
        p = sqrt(p2)
        tmp = atan2(-ca - cb, d + sa + sb) - atan2(-2.0, p)
        out.append(("LSR", _mod(-a + tmp), p, _mod(-b + tmp)))
    p2 = d * d - 2 + 2 * cab - 2 * d * (sa + sb)                         # RSL
    if p2 >= 0:
        p = sqrt(p2)
        tmp = atan2(ca + cb, d - sa - sb) - atan2(2.0, p)
        out.append(("RSL", _mod(a - tmp), p, _mod(b - tmp)))
    for word, (t_, p_, q_) in _ccc(a, b, d):
        out.append((word, t_, p_, q_))
    return [((t + p + q) * rho, w, (t, p, q)) for w, t, p, q in out]


def dubins_length(x0, y0, th0, x1, y1, th1, rho):
    words = dubins_words(x0, y0, th0, x1, y1, th1, rho)
    return min((w[0] for w in words), default=1e9)


def sample(x0, y0, th0, word, params, rho, step=0.25):
    """Points (x, y, th) along a Dubins path (for tests)."""
    x, y, th = x0, y0, th0
    pts = [(x, y, th)]
    segs = [(word[0], params[0]), (word[1], params[1]), (word[2], params[2])]
    for kind, length in segs:
        n = max(1, int(length * rho / step))
        ds = length * rho / n
        for _ in range(n):
            if kind == "S":
                x += ds * cos(th); y += ds * sin(th)
            else:
                k = 1.0 / rho if kind == "L" else -1.0 / rho
                nth = th + k * ds
                x += (sin(nth) - sin(th)) / k
                y += (-cos(nth) + cos(th)) / k
                th = nth
            pts.append((x, y, th))
    return pts
