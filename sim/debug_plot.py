"""Debug renderer: python -m sim.debug_plot <layout> <seed> <bay_id> [out.png]  (dev tool only)"""
import sys
from math import degrees

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon

from .lot import build_layout
from .collision import CollisionMap
from .model import footprints
from .planner import plan_bay


def draw(name, seed, bay_id, out):
    lay = build_layout(name, seed)
    cm = CollisionMap(lay)
    bay = lay["bays"][bay_id]
    wp, n = plan_bay(lay, cm, bay, max_expansions=30000)
    fig, ax = plt.subplots(figsize=(9, 9 * (lay["bounds"]["ymax"] - lay["bounds"]["ymin"]) /
                                    (lay["bounds"]["xmax"] - lay["bounds"]["xmin"]) + 0.6))
    b = lay["bounds"]
    ax.set_xlim(b["xmin"], b["xmax"]); ax.set_ylim(b["ymin"], b["ymax"]); ax.set_aspect("equal")
    for bb in lay["bays"]:
        from .lot import _rect_poly
        col = "#3a86ff" if bb["id"] == bay_id else "#bbbbbb"
        ax.add_patch(Polygon(_rect_poly(bb["cx"], bb["cy"], bb["theta"], bb["l"], bb["w"]), fill=False, ec=col, lw=1.5))
        ax.text(bb["cx"], bb["cy"], str(bb["id"]), ha="center", va="center", color=col)
    for poly in lay["obstacles"]:
        ax.add_patch(Polygon(poly, fc="#e63946", alpha=0.6))
    if wp is None:
        ax.set_title(f"{name} seed {seed} bay {bay_id}: NO PATH ({n} exp)")
    else:
        ax.plot([w["x"] for w in wp], [w["y"] for w in wp], "k-", lw=1)
        for i in range(0, len(wp), max(1, len(wp) // 9)):
            w = wp[i]
            tr, tl = footprints((w["x"], w["y"], w["th"], w["psi"]))
            ax.add_patch(Polygon(tr, fc="#2a9d8f", alpha=0.35, ec="k", lw=0.5))
            ax.add_patch(Polygon(tl, fc="#f4a261", alpha=0.35, ec="k", lw=0.5))
        w = wp[-1]
        tr, tl = footprints((w["x"], w["y"], w["th"], w["psi"]))
        ax.add_patch(Polygon(tr, fc="#2a9d8f", alpha=0.8, ec="k")); ax.add_patch(Polygon(tl, fc="#f4a261", alpha=0.8, ec="k"))
        ax.set_title(f"{name} seed {seed} bay {bay_id}: {len(wp)} pts, {n} exp, max|psi|={max(abs(degrees(v['psi'])) for v in wp):.0f} deg")
    fig.savefig(out, dpi=80, bbox_inches="tight")


if __name__ == "__main__":
    draw(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else "debug.png")
