import random
from math import pi, cos, sin

from sim.dubins import dubins_words, sample, dubins_length

RHO = 8.0


def _angdiff(a, b):
    return abs((a - b + pi) % (2 * pi) - pi)


def test_every_word_lands_on_the_target():
    """Integrate each closed-form path and check it reaches the goal pose."""
    rng = random.Random(3)
    checked = 0
    for _ in range(300):
        x0, y0, th0 = 0.0, 0.0, rng.uniform(-pi, pi)
        x1, y1, th1 = rng.uniform(-40, 40), rng.uniform(-40, 40), rng.uniform(-pi, pi)
        for length, word, (t, p, q) in dubins_words(x0, y0, th0, x1, y1, th1, RHO):
            # sample() takes lengths in units of rho for (t, p, q)
            pts = sample(x0, y0, th0, word, (t, p, q), RHO, step=0.02)
            x, y, th = pts[-1]
            assert abs(x - x1) < 0.15 and abs(y - y1) < 0.15, (word, x, y, x1, y1)
            assert _angdiff(th, th1) < 0.03, (word, th, th1)
            checked += 1
    assert checked > 500


def test_straight_line_has_euclidean_length():
    assert abs(dubins_length(0, 0, 0, 30, 0, 0, RHO) - 30.0) < 1e-6


def test_length_at_least_euclidean():
    rng = random.Random(5)
    for _ in range(200):
        x1, y1 = rng.uniform(-40, 40), rng.uniform(-40, 40)
        L = dubins_length(0, 0, rng.uniform(-pi, pi), x1, y1, rng.uniform(-pi, pi), RHO)
        assert L >= (x1 * x1 + y1 * y1) ** 0.5 - 1e-6
