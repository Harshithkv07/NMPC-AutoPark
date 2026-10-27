"""Figures for the three study guides (print colours, written to fig/).

Re-draws the deck's figures in the light palette (doc/final_deck_build/figs.py, figs_planner.py) and adds the
guide-only ones: the hand-drawing sequence, parallel parking, unit vectors, the front-wheel and hitch velocity
derivations, the hold-steering curve, the reversing heading plot, the hitch regulator and the cost-versus-limit plot.
Numbers come from the real model (sim/). Run:  python guide_figs.py
"""
import json
import os
import sys
from math import atan, cos, degrees, log, radians, sin, tan

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ["FIG_THEME"] = "light"
os.environ["FIG_OUT"] = os.path.join(HERE, "fig")
sys.path.insert(0, os.path.join(HERE, "..", "final_deck_build"))
sys.path.insert(0, os.path.join(HERE, "..", ".."))

import numpy as np                                   # noqa: E402
import figs                                          # noqa: E402
from figs import (AMB, AMB_D, D, GREEN, INK, INK2, L1, L2, MUTE, PALE, RED, TEAL, angle, arrow, canvas, dim,  # noqa: E402
                  dot, label, n, plt, rect, rig, save, u, wheel, Polygon)
from sim.model import VEH, step                      # noqa: E402
from sim.planner import hitch_regulator              # noqa: E402


def panel_sketch(ax, stage):
    """The rig as it should look after drawing step `stage` (1-4) by hand."""
    th0, psi, delta = radians(15), radians(30), radians(28)
    th1 = th0 - psi
    p1 = np.array([0.0, 0.0])
    ph, pf = p1 + D * u(th0), p1 + L1 * u(th0)
    p2 = ph - L2 * u(th1)
    ax.add_patch(Polygon(rect(p1, th0, L1 + 1.0, 1.0, 2.5), closed=True, fc=PALE, ec=TEAL, lw=1.6, zorder=3))
    dot(ax, p1, TEAL, r=0.24, z=13)
    ax.plot(*zip(p1, pf + 3.0 * u(th0)), color=TEAL, lw=1.3, ls=(0, (5, 4)), zorder=7)
    a = pf + 1.3 * u(th0)
    ax.plot(*zip(a, a + [2.8, 0]), color=MUTE, lw=1.2, zorder=7)
    angle(ax, a, 2.3, 0, th0, TEAL, lw=1.8)
    label(ax, a + 3.0 * u(th0 / 2) + [0.5, 0.0], r"$\theta_0$", TEAL, size=13)
    label(ax, p1 + [-2.6, -2.2], r"$(x_1, y_1)$", TEAL, size=12)
    ax.plot(*zip(p1 + [-1.7, -1.8], p1 + [-0.2, -0.2]), color=TEAL, lw=1.0, zorder=12)
    if stage >= 2:
        ax.add_patch(Polygon(rect(ph, th1, 0.3, L2 + 2.0, 2.5), closed=True, fc=figs.PAMB, ec=AMB, lw=1.6, zorder=2))
        dot(ax, ph, AMB_D, r=0.26, ring=True, z=14)
        dot(ax, p2, AMB_D, r=0.24, z=13)
        ax.plot(*zip(p2 - 1.0 * u(th1), ph), color=AMB_D, lw=1.3, ls=(0, (5, 4)), zorder=7)
        ax.plot(*zip(p2, p2 + [3.4, 0]), color=MUTE, lw=1.2, zorder=7)
        angle(ax, p2, 2.8, th1, 0, AMB_D, lw=1.8)
        label(ax, p2 + 3.4 * u(th1 / 2) + [0.5, -0.1], r"$\theta_1$", AMB_D, size=13)
    if stage >= 3:
        ax.plot(*zip(ph, ph + 2.6 * u(th1)), color=AMB_D, lw=1.3, ls=(0, (2, 2)), zorder=7)
        angle(ax, ph, 1.7, th1, th0, RED, lw=2.2)
        label(ax, ph + [2.3, 0.0], r"$\psi$", RED, size=14)
        w = pf + n(th0) * (2.5 / 2 - 0.25)
        ax.plot(*zip(w, w + 2.4 * u(th0 + delta)), color=INK, lw=1.2, zorder=7)
        ax.plot(*zip(w, w + 2.4 * u(th0)), color=MUTE, lw=1.2, zorder=7)
        angle(ax, w, 1.9, th0, th0 + delta, INK, lw=1.8)
        label(ax, w + 2.5 * u(th0 + delta / 2) + [0.4, 0.15], r"$\delta$", INK, size=13)
    if stage >= 4:
        dim(ax, p1, pf, -2.0 * n(th0), TEAL, r"$L_1$", size=13)
        dim(ax, ph, p2, 2.0 * n(th1), AMB_D, r"$L_2$", size=13)


def fig_sketch_steps():
    fig, axes = plt.subplots(2, 2, figsize=(7.2, 4.6))
    titles = ["1  Tractor, rear axle, heading", "2  Hitch, trailer, trailer heading",
              "3  Hitch angle and steering", "4  Lengths"]
    for k, ax in enumerate(axes.flat):
        ax.set_xlim(-10.4, 9.8)
        ax.set_ylim(-4.0, 6.6)
        ax.set_aspect("equal")
        ax.axis("off")
        panel_sketch(ax, k + 1)
        ax.set_title(titles[k], fontsize=11, color=INK, loc="left", pad=2)
    fig.subplots_adjust(left=0.01, right=0.99, top=0.95, bottom=0.01, wspace=0.04, hspace=0.12)
    save(fig, "g_sketch_steps")


def fig_parallel_park():
    """A car moves sideways without ever sliding: reverse with right lock, then left lock (bicycle model)."""
    Lc, dl = 2.7, radians(30)

    def drive(s, v, delta, dist, n_step=60):
        out = [s]
        for _ in range(n_step):
            x, y, th = out[-1]
            ds = dist / n_step
            out.append((x + v * ds * cos(th), y + v * ds * sin(th), th + v * ds * tan(delta) / Lc))
        return out

    a = drive((0.0, 0.0, 0.0), -1, -dl, 3.2)
    b = drive(a[-1], -1, dl, 3.2)
    fig, ax = canvas(6.2, 2.6, (-9.4, 6.6), (-3.9, 2.7))
    for s, col, al in ((a[0], TEAL, 1.0), (b[-1], AMB, 1.0)):
        ax.add_patch(Polygon(rect(np.array(s[:2]), s[2], Lc + 0.9, 0.9, 1.8), closed=True, fc="none", ec=col, lw=2, alpha=al))
        dot(ax, np.array(s[:2]), col, r=0.14)
    pts = np.array([p[:2] for p in a + b])
    ax.plot(pts[:, 0], pts[:, 1], color=INK, lw=2, ls=(0, (4, 3)))
    label(ax, np.array(a[0][:2]) + [0.3, 1.5], "Start", TEAL, size=13)
    label(ax, np.array(b[-1][:2]) + [0.6, -1.5], "End: same heading, moved sideways", AMB_D, size=13)
    dy = b[-1][1] - a[0][1]
    ax.annotate("", xy=(4.7, b[-1][1]), xytext=(4.7, a[0][1]),
                arrowprops=dict(arrowstyle="<|-|>", color=RED, lw=1.6, mutation_scale=12))
    label(ax, np.array([5.0, (a[0][1] + b[-1][1]) / 2]), f"{abs(dy):.1f} m", RED, size=12, ha="left")
    save(fig, "g_parallel_park")


def fig_unit_vectors():
    fig, ax = canvas(4.6, 3.2, (-2.0, 4.6), (-0.9, 3.4))
    th = radians(28)
    o = np.array([0.0, 0.0])
    ax.plot([o[0], 3.6], [0, 0], color=MUTE, lw=1.3)
    arrow(ax, o, o + 2.6 * u(th), TEAL, lw=2.6, ms=18)
    arrow(ax, o, o + 1.9 * n(th), RED, lw=2.6, ms=18)
    angle(ax, o, 1.3, 0, th, INK2, lw=1.8)
    label(ax, o + 1.6 * u(th / 2) + [0.15, 0], r"$\theta$", INK, size=17)
    label(ax, o + 2.6 * u(th) + [0.65, 0.05], r"$\hat u(\theta)$", TEAL, size=17)
    label(ax, o + 1.9 * n(th) + [-0.2, 0.35], r"$\hat n(\theta)$", RED, size=17)
    label(ax, np.array([1.9, -0.55]), "heading (along)   and   normal (sideways)", INK2, size=11)
    save(fig, "g_unit_vectors")


def fig_front_wheel():
    """Front-axle velocity = rear-axle velocity + rotation part; it must lie along the front wheel."""
    th0, delta = radians(0), radians(30)
    fig, ax = canvas(5.6, 2.75, (-1.8, 7.6), (-1.6, 3.0))
    p1, pf = np.array([0.0, 0.0]), np.array([L1, 0.0])
    ax.add_patch(Polygon(rect(p1, th0, L1 + 1, 1, 2.5), closed=True, fc=PALE, ec=TEAL, lw=1.6, alpha=0.7))
    ax.plot(*zip(p1, pf), color=TEAL, lw=2.4)
    wheel(ax, p1, th0, INK, 1.2, 0.36)
    wheel(ax, pf, th0 + delta, INK, 1.2, 0.36)
    vr = 2.2 * u(th0)
    vf = vr + 2.2 * tan(delta) * n(th0)
    arrow(ax, p1, p1 + vr, GREEN, lw=2.6, ms=16)
    arrow(ax, pf, pf + vr, GREEN, lw=2.2, ms=14)
    arrow(ax, pf + vr, pf + vf, RED, lw=2.2, ms=14)
    arrow(ax, pf, pf + vf, INK, lw=2.6, ms=16)
    ax.plot(*zip(pf, pf + 3.4 * u(th0 + delta)), color=MUTE, lw=1.2, ls=(0, (4, 3)))
    label(ax, p1 + vr + [0.1, -0.45], r"$v\,\hat u_0$", GREEN, size=15)
    label(ax, pf + vr + [0.7, -0.35], r"$v\,\hat u_0$", GREEN, size=14)
    label(ax, pf + (vr + vf) / 2 + [1.25, 0.0], r"$L_1\dot\theta_0\,\hat n_0$", RED, size=15)
    label(ax, pf + vf + [-0.4, 0.45], r"$\dot p_f$", INK, size=16)
    angle(ax, pf, 1.1, th0, th0 + delta, INK2, lw=1.6)
    label(ax, pf + 1.45 * u(delta / 2) + [0.1, -0.05], r"$\delta$", INK, size=15)
    label(ax, p1 + [0, -1.15], "rear axle", TEAL, size=11)
    label(ax, pf + [0.2, -1.15], "front axle", TEAL, size=11)
    save(fig, "g_front_wheel")


def fig_hold_curve():
    c = D / L2
    psi = np.linspace(0, 90, 400)
    tand = (L1 / L2) * np.sin(np.radians(psi)) / (1 - c * np.cos(np.radians(psi)))
    dh = np.degrees(np.arctan(tand))
    fig = plt.figure(figsize=(5.4, 3.3))
    ax = fig.add_axes([0.14, 0.17, 0.82, 0.76])
    ax.plot(psi, dh, color=TEAL, lw=2.6)
    ax.axhline(35, color=MUTE, lw=1.2, ls=(0, (4, 3)))
    ax.text(2, 35.8, "Steering lock 35°", color=MUTE, fontsize=10)
    p60 = degrees(atan((L1 / L2) * sin(radians(60)) / (1 - c * cos(radians(60)))))
    pmax = degrees(atan((L1 / L2) / (1 - c * c) ** 0.5))
    ax.plot([60], [p60], "o", color=RED, ms=7)
    ax.annotate(f"At ψ = 60°: hold {p60:.1f}°,\n{35 - p60:.0f}° of lock left to recover", xy=(60, p60), xytext=(14, 29),
                fontsize=10, color=RED, arrowprops=dict(arrowstyle="-|>", color=RED, lw=1.2, mutation_scale=10))
    psis = degrees(np.arccos(c))
    ax.plot([psis], [pmax], "o", color=INK, ms=6)
    ax.text(psis - 1, pmax + 2.2, f"Peak {pmax:.1f}° at ψ = {psis:.0f}°", fontsize=10, color=INK, ha="right")
    ax.set_xlim(0, 90)
    ax.set_ylim(0, 40)
    ax.set_xlabel("Hitch angle to hold, ψ (°)", fontsize=11)
    ax.set_ylabel("Steering needed, δ (°)", fontsize=11)
    ax.tick_params(labelsize=10)
    save(fig, "g_hold_curve")
    return p60, pmax, psis


def fig_reverse_headings():
    """Reversing with constant steering: the tractor heading goes one way, the trailer heading the other."""
    s = (0.0, 0.0, 0.0, 0.0)
    dist, th0, th1 = [0.0], [0.0], [0.0]
    dt = 0.05
    for _ in range(int(12 / dt)):
        s = step(s, -1.0, radians(10), dt, VEH)
        dist.append(dist[-1] + dt)
        th0.append(degrees(s[2]))
        th1.append(degrees(s[2] - s[3]))
    fig = plt.figure(figsize=(5.0, 3.0))
    ax = fig.add_axes([0.15, 0.18, 0.8, 0.76])
    ax.axhline(0, color=MUTE, lw=0.9)
    ax.plot(dist, th0, color=TEAL, lw=2.6)
    ax.plot(dist, th1, color=AMB_D, lw=2.6)
    ax.text(1.0, -18, r"Tractor heading $\theta_0$", color=TEAL, fontsize=11, ha="left", va="top")
    ax.text(dist[-1], th1[-1] + 3, r"Trailer heading $\theta_1$", color=AMB_D, fontsize=11, ha="right", va="bottom")
    ax.set_xlabel("Distance reversed (m), steering held at δ = +10°", fontsize=10)
    ax.set_ylabel("Heading (°)", fontsize=11)
    ax.tick_params(labelsize=10)
    ax.set_xlim(0, 12)
    save(fig, "g_reverse_headings")
    return th0[-1], th1[-1]


def fig_regulator():
    """Reversing from a 3° hitch angle: steering held straight versus the hitch regulator (k = 0.5 per m)."""
    out = {}
    for name in ("straight", "regulator"):
        s, d, p = (0.0, 0.0, 0.0, radians(3)), [0.0], [3.0]
        for _ in range(400):
            delta = 0.0 if name == "straight" else hitch_regulator(s[3], -1.0, 0.0, VEH)
            s = step(s, -1.0, delta, 0.1, VEH)
            d.append(d[-1] + 0.1)
            p.append(abs(degrees(s[3])))
            if p[-1] > 75:
                break
        out[name] = (d, p)
    fig = plt.figure(figsize=(5.2, 3.0))
    ax = fig.add_axes([0.14, 0.18, 0.82, 0.76])
    ax.plot(*out["straight"], color=RED, lw=2.6, label="Steering held straight")
    ax.plot(*out["regulator"], color=TEAL, lw=2.6, label="Hitch regulator")
    ax.axhline(60, color=MUTE, lw=1.2, ls=(0, (4, 3)))
    ax.text(0.4, 61.5, "Limit 60°", color=MUTE, fontsize=10)
    ax.set_xlim(0, 30)
    ax.set_ylim(0, 80)
    ax.set_xlabel("Distance reversed (m)", fontsize=11)
    ax.set_ylabel("|Hitch angle| (°)", fontsize=11)
    ax.tick_params(labelsize=10)
    ax.legend(frameon=False, fontsize=10, loc="upper left", bbox_to_anchor=(0.02, 0.72))
    save(fig, "g_regulator")


def fig_soft_hard():
    psi = np.linspace(-80, 80, 400)
    fig = plt.figure(figsize=(5.2, 3.0))
    ax = fig.add_axes([0.13, 0.18, 0.83, 0.76])
    ax.axvspan(60, 80, color=RED, alpha=0.12, lw=0)
    ax.axvspan(-80, -60, color=RED, alpha=0.12, lw=0)
    ax.plot(psi, 15 * np.radians(psi - 10) ** 2, color=TEAL, lw=2.6)
    ax.axvline(60, color=RED, lw=1.6)
    ax.axvline(-60, color=RED, lw=1.6)
    ax.text(61.5, 21, "Hard\nlimit", color=RED, fontsize=10, va="top")
    ax.text(-30, 9, r"Soft cost $15(\psi-\psi_{ref})^2$" + "\n" + r"(here $\psi_{ref}=10^\circ$)", color=TEAL, fontsize=10)
    ax.set_xlim(-80, 80)
    ax.set_ylim(0, 22)
    ax.set_xlabel("Predicted hitch angle ψ (°)", fontsize=11)
    ax.set_ylabel("Cost added", fontsize=11)
    ax.tick_params(labelsize=10)
    save(fig, "g_soft_hard")


def fig_astar():
    import heapq
    Wc, Hc = 14, 9
    obst = {(x, y) for x in range(6, 8) for y in range(1, 7)} | {(x, 6) for x in range(3, 6)}
    S, G = (2, 2), (11, 4)
    op, g, par, closed = [(0, 0, S)], {S: 0}, {}, []
    while op:
        _, gg, c = heapq.heappop(op)
        if c in closed:
            continue
        closed.append(c)
        if c == G:
            break
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = (c[0] + dx, c[1] + dy)
            if not (0 <= nb[0] < Wc and 0 <= nb[1] < Hc) or nb in obst:
                continue
            if gg + 1 < g.get(nb, 1e9):
                g[nb] = gg + 1
                par[nb] = c
                heapq.heappush(op, (gg + 1 + abs(nb[0] - G[0]) + abs(nb[1] - G[1]), gg + 1, nb))
    path = [G]
    while path[-1] != S:
        path.append(par[path[-1]])
    fig = plt.figure(figsize=(4.6, 2.96))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, Wc)
    ax.set_ylim(0, Hc)
    ax.set_aspect("equal")
    ax.axis("off")
    for x in range(Wc):
        for y in range(Hc):
            fc = figs.OBSC if (x, y) in obst else (PALE if (x, y) in closed else "white")
            ax.add_patch(plt.Rectangle((x, y), 1, 1, fc=fc, ec=figs.GRIDC, lw=0.8))
    ax.plot([c[0] + .5 for c in path], [c[1] + .5 for c in path], color=TEAL, lw=3)
    for c, tx, col in ((S, "S", TEAL), (G, "G", RED)):
        ax.add_patch(plt.Rectangle(c, 1, 1, fc=col, ec=figs.GRIDC))
        ax.text(c[0] + .5, c[1] + .5, tx, color="white", ha="center", va="center", fontsize=11, weight="bold")
    save(fig, "g_astar")
    return len(closed), len(path) - 1


if __name__ == "__main__":
    for f in (figs.fig_bodies, figs.fig_wheel, figs.fig_geometry, figs.fig_bicycle, figs.fig_hitch, figs.fig_unstable,
              figs.fig_horizon, figs.fig_grid, figs.fig_compare):
        f()
    fig_sketch_steps()
    fig_parallel_park()
    fig_unit_vectors()
    fig_front_wheel()
    print("hold: 60 deg needs %.1f deg; peak %.1f deg at psi %.1f deg" % fig_hold_curve())
    print("reverse 12 m at +10 deg: theta0 %.1f deg, theta1 %.1f deg" % fig_reverse_headings())
    fig_regulator()
    fig_soft_hard()
    print("A*: %d cells expanded, path %d steps" % fig_astar())
    with open(os.path.join(figs.OUT, "sizes.json"), "w") as f:
        json.dump(figs.sizes, f, indent=1)
    import figs_planner                              # noqa: E402  (reads the sizes just written)
    figs_planner.fig_primitives()
    figs_planner.fig_path()
    print("written to", figs.OUT, ";", len(figs.sizes), "figures")
