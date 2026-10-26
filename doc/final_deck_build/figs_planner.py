"""Planner figures for the dark deck, from the real solver in v2/v2-design-3 (run after figs.py).

img/fig_primitives.png  the ten motion primitives (5 hitch targets x 2 gears) from one pose
img/fig_path.png        a planned route into a cross-layout bay, with rig footprints along it
Same drawings as doc/hybrid_astar_build/figs.py and figs2.py, re-coloured for the dark slides.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "v2", "v2-design-3"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Polygon

from sim import planner
from sim.collision import CollisionMap
from sim.lot import _rect_poly, build_layout
from sim.model import VEH, footprints

from figs import AMB, BG, CELL, GRIDC, MUTE, OBSC, OUT, PAMB, RED, TEAL

with open(os.path.join(OUT, "sizes.json")) as f:
    sizes = json.load(f)


def save(fig, name):
    fig.savefig(os.path.join(OUT, name + ".png"), dpi=250, transparent=True)
    w, h = fig.get_size_inches()
    sizes[name] = [round(float(w), 3), round(float(h), 3)]
    plt.close(fig)


class Free:
    def clearance_many(self, X):
        return np.full(len(X), 99.0)


def fig_primitives():
    fig = plt.figure(figsize=(4.9, 2.75))
    ax = fig.add_axes([0.02, 0.02, 0.96, 0.96])
    s0 = (0.0, 0.0, 0.0, 0.0)
    for g in (1, -1):
        for k in range(5):
            cur, pts = s0, [s0]
            for _ in range(5):
                r = planner._expand_node(cur, (g,), Free(), VEH)[k]
                if r is None:
                    break
                pts += [x for x, _ in r]
                cur = pts[-1]
            col = TEAL if g > 0 else RED
            ax.plot([p[0] for p in pts], [p[1] for p in pts], color=col, lw=2.2)
            ax.plot(pts[-1][0], pts[-1][1], "o", color=col, ms=4.5)
    tr, tl = footprints(s0)
    ax.add_patch(Polygon(tl, fc=AMB, alpha=0.9, ec=BG, lw=0.8))
    ax.add_patch(Polygon(tr, fc=TEAL, alpha=0.9, ec=BG, lw=0.8))
    ax.set_aspect("equal", adjustable="datalim")
    ax.axis("off")
    save(fig, "fig_primitives")


def fig_path():
    lay = build_layout("cross", 1)
    cm = CollisionMap(lay)
    bay = lay["bays"][6]
    wp, _ = planner.plan_bay(lay, cm, bay)
    b = lay["bounds"]
    w_in = 4.6
    h_in = w_in * (b["ymax"] - b["ymin"]) / (b["xmax"] - b["xmin"])
    fig = plt.figure(figsize=(w_in, h_in))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(b["xmin"], b["xmax"])
    ax.set_ylim(b["ymin"], b["ymax"])
    ax.set_aspect("equal")
    ax.axis("off")
    ax.add_patch(plt.Rectangle((b["xmin"], b["ymin"]), b["xmax"] - b["xmin"], b["ymax"] - b["ymin"], fc=CELL, ec=GRIDC, lw=1))
    for bb in lay["bays"]:
        sel = bb["id"] == 6
        ax.add_patch(Polygon(_rect_poly(bb["cx"], bb["cy"], bb["theta"], bb["l"], bb["w"]), fill=sel,
                             fc=PAMB if sel else "none", ec=RED if sel else MUTE, lw=1.8 if sel else 0.9))
    for poly in lay["obstacles"]:
        ax.add_patch(Polygon(poly, fc=OBSC, ec="none"))
    tr, tl = footprints(lay["start"])
    ax.add_patch(Polygon(tr, fc="none", ec=TEAL, lw=1.3, ls="--"))
    ax.add_patch(Polygon(tl, fc="none", ec=AMB, lw=1.3, ls="--"))
    xs, ys = [w["x"] for w in wp], [w["y"] for w in wp]
    for i in range(1, len(wp)):
        ax.plot(xs[i - 1:i + 1], ys[i - 1:i + 1], color=TEAL if wp[i]["gear"] > 0 else RED, lw=2.2, zorder=4)
    for i in range(0, len(wp), max(1, len(wp) // 6)):
        w = wp[i]
        tr, tl = footprints((w["x"], w["y"], w["th"], w["psi"]))
        ax.add_patch(Polygon(tl, fc=AMB, alpha=0.22, ec=AMB, lw=0.6, zorder=5))
        ax.add_patch(Polygon(tr, fc=TEAL, alpha=0.22, ec=TEAL, lw=0.6, zorder=5))
    w = wp[-1]
    tr, tl = footprints((w["x"], w["y"], w["th"], w["psi"]))
    ax.add_patch(Polygon(tl, fc=AMB, ec=BG, lw=0.6, zorder=6))
    ax.add_patch(Polygon(tr, fc=TEAL, ec=BG, lw=0.6, zorder=6))
    save(fig, "fig_path")


if __name__ == "__main__":
    fig_primitives()
    fig_path()
    with open(os.path.join(OUT, "sizes.json"), "w") as f:
        json.dump(sizes, f, indent=1)
    print("planner figures written")
