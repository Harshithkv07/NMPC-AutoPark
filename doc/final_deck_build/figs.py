"""Figures and equation images for the final four-part deck (build_deck.js places them).

Every figure is drawn at the size it is placed on the slide, so a 22 pt label here is 22 pt in the deck.
Geometry and numbers come from the real model: v2/v2-design-3/sim/model.py (L1 4 m, L2 8 m, d 0.5 m).
Run:  python figs.py   (writes img/*.png and img/sizes.json)
Light, print versions for the study guides: FIG_THEME=light FIG_OUT=<dir> python figs.py
"""
import json
import os
from math import cos, degrees, radians, sin, tan

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Arc, Circle, FancyArrowPatch, Polygon
from PIL import Image

OUT = os.environ.get("FIG_OUT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
os.makedirs(OUT, exist_ok=True)
DPI = 250

if os.environ.get("FIG_THEME") == "light":
    # Print palette (study guides): dark ink on white, same hues as the deck.
    BG, GRIDC, CELL, OBSC = "#FFFFFF", "#D5DCE2", "#FFFFFF", "#3E4C59"
    INK, INK2, MUTE = "#1E2A33", "#3E4C59", "#5B6B78"
    TEAL, AMB, AMB_D, RED, GREEN = "#1F7A8C", "#E8A33D", "#B26E12", "#C0392B", "#2E8B57"
    PALE, PAMB = "#DCEBEE", "#FBE7C6"
else:
    # Dark deck palette (must match THEME in build_deck.js): light ink on the slate slide background.
    BG, GRIDC, CELL, OBSC = "#11161C", "#2A333D", "#161C23", "#5B6773"
    INK, INK2, MUTE = "#E6EDF3", "#AEB8C2", "#7D8996"
    TEAL, AMB, AMB_D, RED, GREEN = "#4FB3C2", "#F0A847", "#F2B45A", "#F0705F", "#4CC38A"
    PALE, PAMB = "#163039", "#3A2F1C"

plt.rcParams.update({
    "font.family": "Segoe UI", "mathtext.fontset": "cm", "font.size": 15, "text.color": INK, "legend.labelcolor": INK,
    "axes.edgecolor": MUTE, "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
    "axes.spines.top": False, "axes.spines.right": False, "savefig.transparent": True,
})

L1, L2, D = 4.0, 8.0, 0.5
W = 2.5
sizes = {}


def save(fig, name):
    fig.savefig(os.path.join(OUT, name + ".png"), dpi=DPI, transparent=True)
    w, h = fig.get_size_inches()
    sizes[name] = [round(float(w), 3), round(float(h), 3)]
    plt.close(fig)


def u(th):
    return np.array([cos(th), sin(th)])


def n(th):
    return np.array([-sin(th), cos(th)])


def rect(c, th, front, back, width):
    """Corners of a box along heading th, from `back` behind c to `front` ahead of c."""
    a, b = u(th), n(th)
    return [c + a * front + b * width / 2, c - a * back + b * width / 2,
            c - a * back - b * width / 2, c + a * front - b * width / 2]


def wheel(ax, c, th, color=INK, length=1.0, width=0.32, z=6):
    ax.add_patch(Polygon(rect(c, th, length / 2, length / 2, width), closed=True, fc=color, ec="none", zorder=z))


def rig(ax, p1, th0, psi, delta):
    """Draws the tractor-trailer; returns the key points."""
    th1 = th0 - psi
    ph = p1 + D * u(th0)
    p2 = ph - L2 * u(th1)
    pf = p1 + L1 * u(th0)
    ax.add_patch(Polygon(rect(ph, th1, 0.3, L2 + 2.0, W), closed=True, fc=PAMB, ec=AMB, lw=2.2, zorder=2))
    ax.add_patch(Polygon(rect(p1, th0, L1 + 1.0, 1.0, W), closed=True, fc=PALE, ec=TEAL, lw=2.2, zorder=3))
    for s in (1, -1):
        wheel(ax, p1 + s * n(th0) * (W / 2 - 0.25), th0)
        wheel(ax, pf + s * n(th0) * (W / 2 - 0.25), th0 + delta)
        wheel(ax, p2 + s * n(th1) * (W / 2 - 0.25), th1)
    return dict(p1=p1, ph=ph, p2=p2, pf=pf, th1=th1)


def dot(ax, p, color, r=0.2, z=8, ring=False):
    if ring:
        ax.add_patch(Circle(p, r, fc=BG, ec=color, lw=3, zorder=z))
    else:
        ax.add_patch(Circle(p, r, fc=color, ec=BG, lw=1.5, zorder=z))


def arrow(ax, a, b, color=INK, lw=2.6, z=9, ms=22):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=ms, color=color, lw=lw, zorder=z,
                                 shrinkA=0, shrinkB=0))


def label(ax, p, text, color=INK, size=15, ha="center", va="center", **kw):
    ax.text(p[0], p[1], text, color=color, fontsize=size, ha=ha, va=va, zorder=15, **kw)


def angle(ax, c, r, a0, a1, color, lw=2.4):
    lo, hi = sorted((degrees(a0), degrees(a1)))
    ax.add_patch(Arc(c, 2 * r, 2 * r, theta1=lo, theta2=hi, color=color, lw=lw, zorder=10))


def dim(ax, a, b, off, col, txt, size=18):
    """Dimension line between a and b, offset sideways by the vector off."""
    ax.annotate("", xy=b + off, xytext=a + off,
                arrowprops=dict(arrowstyle="<|-|>", color=col, lw=1.8, mutation_scale=16, shrinkA=0, shrinkB=0))
    k = off / np.linalg.norm(off)
    for p in (a, b):
        ax.plot(*zip(p + 0.3 * k, p + off + 0.25 * k), color=col, lw=1.0, zorder=7)
    label(ax, (a + b) / 2 + off + 0.65 * k, txt, col, size=size)


def canvas(w, h, xlim, ylim):
    fig = plt.figure(figsize=(w, h))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


# ---------------------------------------------------------------- Part 1: two rigid bodies, one passive joint
def fig_bodies():
    fig, ax = canvas(7.4, 4.9, (-11.0, 6.4), (-5.0, 6.5))
    th0, psi = radians(12), radians(30)
    k = rig(ax, np.array([0.0, 0.0]), th0, psi, radians(0))
    p1, ph, p2, th1 = k["p1"], k["ph"], k["p2"], k["th1"]
    dot(ax, ph, AMB_D, r=0.34, ring=True, z=13)
    for c, th, col, name in ((p1, th0, TEAL, "{T}"), (p2, th1, AMB_D, "{R}")):
        arrow(ax, c, c + 2.3 * u(th), col, lw=2.6, ms=18)
        arrow(ax, c, c + 2.3 * n(th), col, lw=2.6, ms=18)
        dot(ax, c, col, r=0.17)
        label(ax, c + 3.0 * n(th) + 0.1 * u(th), name, col, size=15)
    o = np.array([-10.4, -4.5])
    arrow(ax, o, o + [2.2, 0], INK2, lw=2.4, ms=18)
    arrow(ax, o, o + [0, 2.2], INK2, lw=2.4, ms=18)
    label(ax, o + [2.55, 0.05], "x", INK2, size=14, ha="left", style="italic")
    label(ax, o + [0, 2.65], "y", INK2, size=14, style="italic")
    label(ax, o + [1.15, 0.85], "{W}", INK2, size=15)
    label(ax, p1 + 2.2 * u(th0) - 2.5 * n(th0), "Tractor (body 1)", TEAL, size=15, weight="semibold")
    label(ax, p2 + 4.2 * u(th1) - 2.6 * n(th1), "Trailer (body 2)", AMB_D, size=15, weight="semibold")
    label(ax, np.array([0.2, 5.6]), "Hitch: passive revolute joint", INK, size=15, weight="semibold")
    arrow(ax, np.array([0.4, 5.0]), ph + [0.05, 0.42], INK, lw=2.2, ms=18)
    save(fig, "fig_bodies")


# ---------------------------------------------------------------- Part 1: rolling without slipping
def fig_wheel():
    fig, ax = canvas(5.4, 4.2, (-4.0, 4.8), (-2.6, 4.2))
    th = radians(25)
    c = np.array([-0.8, -0.6])
    ax.add_patch(Polygon(rect(c, th, 1.6, 1.6, 0.9), closed=True, fc=INK2, ec="none", zorder=4))
    ax.plot(*zip(c - 3.2 * u(th), c + 4.6 * u(th)), color=MUTE, lw=1.6, ls=(0, (4, 4)), zorder=1)
    arrow(ax, c, c + 3.4 * u(th), GREEN, lw=3.4, ms=26)
    arrow(ax, c, c + 2.6 * n(th), RED, lw=3.4, ms=26)
    m = c + 1.6 * n(th)
    for s in (1, -1):
        ax.plot(*zip(m + 0.42 * (u(th) + s * n(th)), m - 0.42 * (u(th) + s * n(th))), color=RED, lw=4, zorder=11)
    label(ax, c + 3.4 * u(th) + np.array([0.9, 0.55]), "Rolls", GREEN, size=15, weight="semibold")
    label(ax, c + 2.6 * n(th) + np.array([0.2, 0.55]), "Cannot slide", RED, size=15, weight="semibold")
    ax.plot(*zip(c, c + [3.6, 0]), color=MUTE, lw=1.6, zorder=1)
    angle(ax, c, 2.9, 0, th, INK2)
    label(ax, c + 3.35 * u(th / 2) + [0.2, 0], r"$\theta$", INK, size=18)
    save(fig, "fig_wheel")


# ---------------------------------------------------------------- Part 1: state variables and inputs
def fig_geometry():
    fig, ax = canvas(7.6, 4.5, (-10.4, 9.8), (-4.6, 7.36))
    th0, psi, delta = radians(15), radians(30), radians(28)
    k = rig(ax, np.array([0.0, 0.0]), th0, psi, delta)
    p1, ph, p2, pf, th1 = k["p1"], k["ph"], k["p2"], k["pf"], k["th1"]
    ax.plot(*zip(p1, pf + 3.0 * u(th0)), color=TEAL, lw=1.8, ls=(0, (5, 4)), zorder=7)
    ax.plot(*zip(p2 - 1.0 * u(th1), ph + 2.6 * u(th1)), color=AMB_D, lw=1.8, ls=(0, (5, 4)), zorder=7)
    dot(ax, p1, TEAL, r=0.24, z=13)
    dot(ax, ph, AMB_D, r=0.26, ring=True, z=14)
    dot(ax, p2, AMB_D, r=0.24, z=13)
    # theta0: tractor heading, measured ahead of the tractor
    a = pf + 1.3 * u(th0)
    ax.plot(*zip(a, a + [2.8, 0]), color=MUTE, lw=1.6, zorder=7)
    angle(ax, a, 2.3, 0, th0, TEAL)
    label(ax, a + 3.0 * u(th0 / 2) + [0.35, 0.0], r"$\theta_0$", TEAL, size=19)
    # theta1: trailer heading, at the trailer axle
    ax.plot(*zip(p2, p2 + [3.4, 0]), color=MUTE, lw=1.6, zorder=7)
    angle(ax, p2, 2.8, th1, 0, AMB_D)
    label(ax, p2 + 3.4 * u(th1 / 2) + [0.35, -0.1], r"$\theta_1$", AMB_D, size=19)
    # psi at the hitch: trailer axis (extended) to tractor axis
    angle(ax, ph, 1.7, th1, th0, RED, lw=3.2)
    label(ax, ph + [2.3, 0.05], r"$\psi$", RED, size=20)
    # delta at the upper front wheel
    w = pf + n(th0) * (W / 2 - 0.25)
    ax.plot(*zip(w, w + 2.4 * u(th0 + delta)), color=INK, lw=1.6, zorder=7)
    ax.plot(*zip(w, w + 2.4 * u(th0)), color=MUTE, lw=1.6, zorder=7)
    angle(ax, w, 1.9, th0, th0 + delta, INK)
    label(ax, w + 2.45 * u(th0 + delta / 2) + [0.3, 0.15], r"$\delta$", INK, size=19)
    dim(ax, p1, pf, -2.0 * n(th0), TEAL, r"$L_1$")
    dim(ax, ph, p2, 2.0 * n(th1), AMB_D, r"$L_2$")
    label(ax, p1 + [-2.4, -3.6], r"$(x_1,\ y_1)$", TEAL, size=16)
    ax.plot(*zip(p1 + [-1.7, -3.0], p1 + [-0.15, -0.25]), color=TEAL, lw=1.2, zorder=12)
    label(ax, p2 - 2.15 * n(th1) + [-0.4, 0], "Trailer axle", AMB_D, size=14)
    label(ax, ph + [-3.6, -1.75], "Hitch", INK2, size=14)
    ax.plot(*zip(ph + [-2.9, -1.5], ph + [-0.25, -0.2]), color=INK2, lw=1.2, zorder=12)
    save(fig, "fig_geometry")


# ---------------------------------------------------------------- Part 2: the bicycle model and the ICR
def fig_bicycle():
    delta = radians(32)
    R = L1 / tan(delta)
    fig, ax = canvas(6.0, 5.9, (-3.4, 6.8), (-3.6, R + 1.4))
    p1, pf = np.array([0.0, 0.0]), np.array([L1, 0.0])
    ax.add_patch(Polygon(rect(p1, 0, L1 + 1, 1, W), closed=True, fc=PALE, ec=TEAL, lw=2, alpha=0.6, zorder=2))
    ax.plot([p1[0], pf[0]], [0, 0], color=TEAL, lw=3, zorder=5)
    wheel(ax, p1, 0, INK, 1.4, 0.42)
    wheel(ax, pf, delta, INK, 1.4, 0.42)
    icr = np.array([0.0, R])
    ax.plot(*zip(p1, icr), color=MUTE, lw=1.8, ls=(0, (5, 4)), zorder=4)
    ax.plot(*zip(pf, icr), color=MUTE, lw=1.8, ls=(0, (5, 4)), zorder=4)
    dot(ax, icr, RED, r=0.24)
    label(ax, icr + [-0.45, 0.45], "ICR", RED, size=15, weight="semibold", ha="right")
    ax.plot(*zip(pf, pf + [2.3, 0]), color=MUTE, lw=1.6)
    angle(ax, pf, 1.7, 0, delta, INK)
    label(ax, pf + 2.15 * u(delta / 2) + [0.3, 0], r"$\delta$", INK, size=19)
    angle(ax, icr, 2.0, -radians(90), -radians(90) + delta, INK)
    label(ax, icr + 2.55 * u(-radians(90) + delta / 2), r"$\delta$", INK, size=19)
    label(ax, (p1 + icr) / 2 + [-0.45, 0], r"$R$", INK, size=19, ha="right")
    ax.annotate("", xy=pf + [0, -2.3], xytext=p1 + [0, -2.3],
                arrowprops=dict(arrowstyle="<|-|>", color=TEAL, lw=1.8, mutation_scale=16, shrinkA=0, shrinkB=0))
    label(ax, (p1 + pf) / 2 + [0, -2.85], r"$L_1$", TEAL, size=19)
    arrow(ax, p1 + [-1.0, 1.75], p1 + [1.6, 1.75], GREEN, lw=3)
    label(ax, p1 + [-1.35, 1.75], r"$v$", GREEN, size=19, ha="right")
    label(ax, p1 + [0, -0.85], "Rear", TEAL, size=14)
    label(ax, pf + [0.1, -0.95], "Front", TEAL, size=14)
    save(fig, "fig_bicycle")


# ---------------------------------------------------------------- Part 2: hitch velocity and trailer rotation
def fig_hitch():
    fig, ax = canvas(7.2, 4.7, (-11.4, 6.6), (-4.6, 7.2))
    th0, psi = radians(26), radians(34)
    k = rig(ax, np.array([0.0, 0.0]), th0, psi, radians(10))
    ph, p2, th1 = k["ph"], k["p2"], k["th1"]
    ax.plot(*zip(p2 - 1.2 * u(th1), ph + 2.2 * u(th1)), color=AMB_D, lw=1.6, ls=(0, (5, 4)), zorder=7)
    dot(ax, ph, AMB_D, r=0.28, ring=True, z=13)
    dot(ax, p2, AMB_D, r=0.24, z=13)
    vh = 4.0 * u(th0 + radians(8))          # mostly along the tractor, a little sideways from d * th0'
    par = np.dot(vh, u(th1)) * u(th1)
    perp = vh - par
    ax.plot(*zip(ph + par, ph + vh), color=MUTE, lw=1.4, ls=":", zorder=8)
    ax.plot(*zip(ph + perp, ph + vh), color=MUTE, lw=1.4, ls=":", zorder=8)
    arrow(ax, ph, ph + par, AMB_D, lw=2.4, ms=20)
    arrow(ax, ph, ph + perp, RED, lw=3.2, ms=24)
    arrow(ax, ph, ph + vh, INK, lw=3.2, ms=24)
    label(ax, ph + vh + [0.5, 0.2], r"$v_h$", INK, size=19, ha="left")
    label(ax, ph + perp + [-0.35, 0.45], r"$v_\perp$", RED, size=19, ha="right")
    label(ax, ph + par + [0.35, -0.55], r"$v_\parallel$", AMB_D, size=19, ha="left")
    arrow(ax, p2, p2 + 2.8 * u(th1), GREEN, lw=3, ms=22)
    m = p2 + 1.4 * n(th1)
    ax.plot(*zip(p2, p2 + 1.9 * n(th1)), color=RED, lw=2.4, ls=(0, (3, 2)), zorder=9)
    for s in (1, -1):
        ax.plot(*zip(m + 0.36 * (u(th1) + s * n(th1)), m - 0.36 * (u(th1) + s * n(th1))), color=RED, lw=3.4, zorder=11)
    label(ax, p2 + 3.2 * n(th1) + [-0.3, 0], "No sideways slip", RED, size=14)
    label(ax, p2 - 2.2 * n(th1) + [0.4, 0], "Trailer axle", AMB_D, size=14)
    label(ax, ph + [1.4, -1.9], "Hitch", INK2, size=14)
    save(fig, "fig_hitch")


# ---------------------------------------------------------------- Part 2: reversing is unstable (exact, delta = 0)
def fig_unstable():
    fig = plt.figure(figsize=(6.6, 4.9))
    ax = fig.add_axes([0.17, 0.2, 0.78, 0.74])
    s = np.linspace(0, 40, 400)
    p0 = radians(2)
    rev = np.degrees(2 * np.arctan(np.tan(p0 / 2) * np.exp(s / L2)))
    fwd = np.degrees(2 * np.arctan(np.tan(p0 / 2) * np.exp(-s / L2)))
    s60 = L2 * np.log(tan(radians(30)) / tan(p0 / 2))
    ax.axhspan(60, 90, color=RED, alpha=0.16, lw=0)
    ax.axhline(60, color=RED, lw=1.8, ls=(0, (5, 4)))
    ax.plot(s, rev, color=RED, lw=3.6)
    ax.plot(s, fwd, color=GREEN, lw=3.6)
    ax.plot([s60], [60], "o", color=RED, ms=11, zorder=5)
    ax.annotate(f"60° after {s60:.0f} m", xy=(s60, 60), xytext=(4.5, 73), color=RED, fontsize=15,
                arrowprops=dict(arrowstyle="-|>", color=RED, lw=1.8, mutation_scale=16))
    ax.text(20.5, 18, "Reverse", color=RED, fontsize=15, weight="semibold")
    ax.text(29.5, 6, "Forward", color=GREEN, fontsize=15, weight="semibold")
    ax.set_xlim(0, 40)
    ax.set_ylim(0, 90)
    ax.set_yticks([0, 30, 60, 90])
    ax.set_xticks([0, 10, 20, 30, 40])
    ax.tick_params(labelsize=14)
    ax.set_xlabel("Distance travelled (m)", fontsize=14)
    ax.set_ylabel(r"Hitch angle $\psi$ (°)", fontsize=14)
    save(fig, "fig_unstable")
    return s60


# ---------------------------------------------------------------- Part 3: receding horizon
def fig_horizon():
    fig = plt.figure(figsize=(7.2, 5.0))
    a1 = fig.add_axes([0.12, 0.47, 0.85, 0.47])
    a2 = fig.add_axes([0.12, 0.12, 0.85, 0.28], sharex=a1)
    T = 9.6
    tp = np.linspace(-4.0, 0, 60)
    past = 22 + 8 * np.sin(tp * 0.6)
    tf = np.linspace(0, T, 120)
    pred = past[-1] + (34 - past[-1]) * (1 - np.exp(-tf / 2.0)) - 26 * (1 - np.exp(-np.maximum(tf - 3, 0) / 2.5))
    for a in (a1, a2):
        a.axvspan(0, T, color=PALE, alpha=0.6, lw=0)
        a.axvline(0, color=INK, lw=2)
    a1.axhspan(60, 80, color=RED, alpha=0.16, lw=0)
    a1.axhline(60, color=RED, lw=1.8, ls=(0, (5, 4)))
    a1.text(T - 0.15, 64, "Hard limit 60°", color=RED, fontsize=13, ha="right")
    a1.plot(tp, past, color=INK, lw=3.2)
    a1.plot(tf, pred, color=TEAL, lw=3.2, ls=(0, (5, 3)))
    a1.text(-3.85, 36, "Measured", color=INK, fontsize=13)
    a1.text(5.2, 26, "Predicted", color=TEAL, fontsize=13)
    a1.text(T / 2, 46, "Horizon: 24 steps × 0.4 s = 9.6 s", color=TEAL, fontsize=13, ha="center", weight="semibold")
    a1.set_ylim(-5, 80)
    a1.set_yticks([0, 30, 60])
    a1.set_ylabel(r"$\psi$ (°)", fontsize=14)
    a1.tick_params(labelsize=12, labelbottom=False)
    vals = [14, 18, 10, 2, -6, -10, -6, -2]
    for i, val in enumerate(vals):
        x0 = i * 1.2
        a2.bar(x0 + 0.6, val, width=1.1, color=RED if i == 0 else AMB, lw=0)
        a2.text(x0 + 0.6, (val + 2.5) if val >= 0 else (val - 2.5), rf"$u_{i + 1}$", ha="center",
                va="bottom" if val >= 0 else "top", fontsize=13, color=RED if i == 0 else INK2)
    a2.plot([-4, 0], [12, 12], color=INK, lw=2.6)
    a2.axhline(0, color=MUTE, lw=1)
    a2.set_ylim(-24, 32)
    a2.set_yticks([])
    a2.set_ylabel(r"$\delta$", fontsize=15)
    a2.set_xlim(-4, T + 0.2)
    a2.set_xticks([0, 4, 8])
    a2.set_xticklabels(["Now", "+4 s", "+8 s"])
    a2.tick_params(labelsize=12)
    save(fig, "fig_horizon")


# ---------------------------------------------------------------- Part 3: grid A* path against a drivable path
def fig_grid():
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
    path = path[::-1]
    fig = plt.figure(figsize=(4.9, 3.15))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, Wc)
    ax.set_ylim(0, Hc)
    ax.set_aspect("equal")
    ax.axis("off")
    for x in range(Wc):
        for y in range(Hc):
            ax.add_patch(plt.Rectangle((x, y), 1, 1, fc=OBSC if (x, y) in obst else CELL, ec=GRIDC, lw=0.8))
    ax.plot([c[0] + .5 for c in path], [c[1] + .5 for c in path], color=MUTE, lw=2.2, ls=(0, (3, 2)))
    t = np.linspace(0, 1, 200)[:, None]

    def cub(p0, p1, p2, p3):
        P = [np.array(p, float) for p in (p0, p1, p2, p3)]
        return (1 - t) ** 3 * P[0] + 3 * (1 - t) ** 2 * t * P[1] + 3 * (1 - t) * t ** 2 * P[2] + t ** 3 * P[3]
    B = np.vstack([cub((2.5, 2.5), (4.0, 2.5), (3.8, 0.5), (5.2, 0.5)), [[5.2, 0.5], [8.4, 0.5]],
                   cub((8.4, 0.5), (10.2, 0.5), (9.8, 4.5), (11.5, 4.5))])
    ax.plot(B[:, 0], B[:, 1], color=TEAL, lw=3.4)
    for c, tx, col in ((S, "S", TEAL), (G, "G", RED)):
        ax.add_patch(plt.Rectangle(c, 1, 1, fc=col, ec=GRIDC))
        ax.text(c[0] + .5, c[1] + .5, tx, color=BG, ha="center", va="center", fontsize=12, weight="bold")
    save(fig, "fig_grid")


# ---------------------------------------------------------------- Part 4: one bay, guided against unaided (real run)
RUN = os.path.join(os.path.dirname(OUT), "..", "..", "v2", "v2-design-3", "viewer", "public", "data", "cross_0.json")


def fig_compare():
    """Cross layout, fill 0, bay index 8 (shown as bay 9 in the viewer; the app_parked / app_jackknife screenshots)."""
    with open(RUN) as f:
        run = json.load(f)["plans"]["8"]
    g = np.array(run["frames"])
    b = np.array(run["baseline"]["frames"])
    fig = plt.figure(figsize=(5.2, 3.5))
    ax = fig.add_axes([0.16, 0.17, 0.8, 0.72])
    for lim in (60, -60):
        ax.axhline(lim, color=RED, lw=1.4, ls=(0, (5, 4)))
    ax.axhspan(60, 90, color=RED, alpha=0.16, lw=0)
    ax.axhspan(-90, -60, color=RED, alpha=0.16, lw=0)
    ax.plot(g[:, 0], np.degrees(g[:, 4]), color=TEAL, lw=2.6, label="With NMPC guidance")
    ax.plot(b[:, 0], np.degrees(b[:, 4]), color=RED, lw=2.6, label="Unaided driver")
    tj = run["baseline"]["t_jack"]
    ax.plot([b[-1, 0]], [np.degrees(b[-1, 4])], "X", color=RED, ms=10)
    ax.text(b[-1, 0] - 1.5, np.degrees(b[-1, 4]) + 1, f"Jackknife at {tj:.0f} s", color=RED, fontsize=12, ha="right", va="bottom")
    ax.text(g[-1, 0], 63, "Limit ±60°", color=RED, fontsize=11, ha="right", va="bottom")
    ax.set_xlim(0, g[-1, 0])
    ax.set_ylim(-90, 90)
    ax.set_yticks([-60, -30, 0, 30, 60])
    ax.tick_params(labelsize=11)
    ax.set_xlabel("Time (s)", fontsize=12)
    ax.set_ylabel(r"Hitch angle $\psi$ (°)", fontsize=12)
    ax.legend(loc="upper left", bbox_to_anchor=(0.0, 1.16), ncol=2, frameon=False, fontsize=11, handlelength=1.6)
    save(fig, "fig_compare")
    return run["metrics"]["max_psi_deg"], tj


# ---------------------------------------------------------------- equations
def eq(name, parts, size=20):
    """parts: (mathtext, color[, fontsize, baseline shift in pt]) or (None, gap in pt), left to right; saved tight."""
    fig = plt.figure(figsize=(14, 2.5))
    r = fig.canvas.get_renderer()
    x = 0.02
    for part in parts:
        if part[0] is None:                       # (None, gap in points): horizontal space
            x += part[1] / 72 / 14
            continue
        tex, col = part[0], part[1]
        fs = part[2] if len(part) > 2 else size
        dy = (part[3] if len(part) > 3 else 0) / 72 / 2.5
        t = fig.text(x, 0.4 + dy, tex, fontsize=fs, color=col, va="baseline")
        x += t.get_window_extent(renderer=r).width / fig.bbox.width
    path = os.path.join(OUT, name + ".png")
    fig.savefig(path, dpi=DPI, transparent=True, bbox_inches="tight", pad_inches=0.04)
    plt.close(fig)
    w, h = Image.open(path).size
    sizes[name] = [round(w / DPI, 3), round(h / DPI, 3)]


def equations():
    K = INK
    eq("eq_state", [(r"$X = [\,x_1,\ y_1,\ \theta_0,\ \psi\,]^{T}$", K)], 23)
    eq("eq_input", [(r"$U = [\,v,\ \delta\,]^{T}$", K)], 23)
    eq("eq_psi", [(r"$\psi = \theta_0 - \theta_1$", K)], 23)
    eq("eq_config", [(r"$q = (x_1,\ y_1,\ \theta_0,\ \theta_1)$", K)], 22)
    eq("eq_noslip", [(r"$\dot{x}\,\sin\theta - \dot{y}\,\cos\theta = 0$", K)], 22)
    eq("eq_bx", [(r"$\dot{x}_1 = v\,\cos\theta_0$", K)], 23)
    eq("eq_by", [(r"$\dot{y}_1 = v\,\sin\theta_0$", K)], 23)
    eq("eq_bth", [(r"$\dot{\theta}_0 = \dfrac{v}{R} = \dfrac{v}{L_1}\,\tan\delta$", K)], 23)
    eq("eq_R", [(r"$R = \dfrac{L_1}{\tan\delta}$", K)], 23)
    eq("eq_ph", [(r"$p_h = p_1 + d\,(\cos\theta_0,\ \sin\theta_0)$", K)], 20)
    eq("eq_p2", [(r"$p_2 = p_h - L_2\,(\cos\theta_1,\ \sin\theta_1)$", K)], 20)
    eq("eq_th1", [(r"$\dot{\theta}_1 = \dfrac{v_\perp}{L_2} = \dfrac{v\,\sin\psi + d\,\dot{\theta}_0\cos\psi}{L_2}$", K)], 22)
    eq("eq_psidef", [(r"$\dot{\psi} = \dot{\theta}_0 - \dot{\theta}_1$", K)], 22)
    G = (None, 7)
    eq("eq_psidot", [(r"$\dot{\psi} = v$", K), G, (r"$[$", K, 54, -9), (None, 4),
                     (r"$\dfrac{\tan\delta}{L_1}$", TEAL), G, (r"$-$", K), G,
                     (r"$\dfrac{\sin\psi}{L_2}$", RED), G, (r"$-$", K), G,
                     (r"$\dfrac{d\,\tan\delta\,\cos\psi}{L_1 L_2}$", MUTE), (None, 4), (r"$]$", K, 54, -9)], 34)
    eq("eq_lin", [(r"$\dot{\psi} \approx -\dfrac{v}{L_2}\,\psi \quad\Rightarrow\quad \lambda = -\dfrac{v}{L_2}$", K)], 23)
    eq("eq_astar", [(r"$f(n) = g(n) + h(n)$", K)], 23)
    eq("eq_cost", [(r"$J = \sum_{i=1}^{24} \Vert X_i - X_i^{\mathrm{ref}} \Vert_Q^2\ +\ "
                    r"\sum_{j=1}^{8} \left( R\,u_j^2 + S\,(u_j - u_{j-1})^2 \right)$", K)], 20)
    eq("eq_dyn", [(r"$X_{i+1} = \mathrm{RK4}\,(X_i,\ v_i,\ \delta_i)$", K)], 20)
    eq("eq_cons", [(r"$|\psi_i| \leq 60^\circ \qquad |\delta_i| \leq 35^\circ \qquad "
                    r"\mathrm{clearance}_i \geq 0.25\ \mathrm{m}$", K)], 20)


if __name__ == "__main__":
    fig_bodies()
    fig_wheel()
    fig_geometry()
    fig_bicycle()
    fig_hitch()
    s60 = fig_unstable()
    fig_horizon()
    fig_grid()
    print("compare run: peak %.1f deg, unaided jackknife at %.1f s" % fig_compare())
    equations()
    with open(os.path.join(OUT, "sizes.json"), "w") as f:
        json.dump(sizes, f, indent=1)
    print("60 deg after", round(s60, 1), "m;", len(sizes), "images")
