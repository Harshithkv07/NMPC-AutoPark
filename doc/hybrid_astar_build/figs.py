import sys; sys.path.insert(0, r"C:\Users\harshithKV\Desktop\Robotics")
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from sim import planner
from sim.lot import build_layout, _rect_poly
from sim.collision import CollisionMap
from sim.model import footprints

lay = build_layout("cross", 1); cm = CollisionMap(lay); bay = lay["bays"][6]
seen, arcs, shots = [], [], []
orig = planner._expand_node
def rec(s, *a, **k):
    seen.append(s); r = orig(s, *a, **k)
    arcs.extend([[s] + [x for x, _ in p] for p in r if p is not None]); return r
planner._expand_node = rec
otry = planner.try_shot
def rshot(*a, **k):
    r = otry(*a, **k); shots.append(r); return r
planner.try_shot = rshot
raw, n = planner.search(cm, lay["start"], tuple(bay["goal"]), final_reverse=bay["approach"] == "reverse", lead=bay.get("lead", 10.0))
planner._expand_node = orig; planner.try_shot = otry
shot = [x for x, _ in shots[-1]]; ns = len(shot); searched = [p[0] for p in raw[:len(raw)-ns]]
print("shots tried", len(shots), "shot pts", ns, "arcs", len(arcs))
wp, _ = planner.plan_bay(lay, cm, bay)
print("expansions", n, "raw pts", len(raw), "wp", len(wp), "approach", bay["approach"])

BG, GRID, BAY, OBS, PATH, TR, TL, NODE, HL = "#FFFFFF", "#E6E9ED", "#9AA5B1", "#3E4C59", "#E8A33D", "#1F7A8C", "#E8A33D", "#7FB7C4", "#C0392B"
b = lay["bounds"]
def base(ax):
    ax.set_xlim(b["xmin"], b["xmax"]); ax.set_ylim(b["ymin"], b["ymax"]); ax.set_aspect("equal"); ax.axis("off")
    ax.add_patch(plt.Rectangle((b["xmin"], b["ymin"]), b["xmax"]-b["xmin"], b["ymax"]-b["ymin"], fc="#F4F6F8", ec="none"))
    for bb in lay["bays"]:
        sel = bb["id"] == 6
        ax.add_patch(Polygon(_rect_poly(bb["cx"], bb["cy"], bb["theta"], bb["l"], bb["w"]), fill=sel, fc="#FBE7C6" if sel else "none", ec=HL if sel else BAY, lw=2 if sel else 1))
    for poly in lay["obstacles"]:
        ax.add_patch(Polygon(poly, fc=OBS, ec="none"))
    s0 = lay["start"]; tr, tl = footprints(s0)
    ax.add_patch(Polygon(tr, fc="none", ec=TR, lw=1.5, ls="--")); ax.add_patch(Polygon(tl, fc="none", ec=TL, lw=1.5, ls="--"))
W = 9; H = W * (b["ymax"]-b["ymin"])/(b["xmax"]-b["xmin"])
# fig 1: explored nodes
fig, ax = plt.subplots(figsize=(W, H)); base(ax)
for a in arcs:
    ax.plot([p[0] for p in a], [p[1] for p in a], color=NODE, lw=0.6, alpha=0.8, zorder=2)
ax.scatter([s[0] for s in seen], [s[1] for s in seen], s=7, c="#1F7A8C", lw=0, zorder=3)
ax.plot([p[0] for p in searched], [p[1] for p in searched], color="#1F7A8C", lw=3, zorder=4)
ax.plot([p[0] for p in shot], [p[1] for p in shot], color=PATH, lw=3, zorder=4, ls=(0, (4, 2)))
fig.savefig("search.png", dpi=200, bbox_inches="tight", pad_inches=0.02, facecolor=BG); plt.close(fig)
# fig 2: final path with footprints
fig, ax = plt.subplots(figsize=(W, H)); base(ax)
for i, w in enumerate(wp):
    pass
xs = [w["x"] for w in wp]; ys = [w["y"] for w in wp]
for i in range(1, len(wp)):
    ax.plot(xs[i-1:i+1], ys[i-1:i+1], color=TR if wp[i]["gear"] > 0 else HL, lw=2.5, zorder=4)
for i in range(0, len(wp), max(1, len(wp)//6)):
    w = wp[i]; tr, tl = footprints((w["x"], w["y"], w["th"], w["psi"]))
    ax.add_patch(Polygon(tr, fc=TR, alpha=0.25, ec=TR, lw=0.6, zorder=5)); ax.add_patch(Polygon(tl, fc=TL, alpha=0.25, ec=TL, lw=0.6, zorder=5))
w = wp[-1]; tr, tl = footprints((w["x"], w["y"], w["th"], w["psi"]))
ax.add_patch(Polygon(tr, fc=TR, alpha=0.9, ec="k", lw=0.6, zorder=6)); ax.add_patch(Polygon(tl, fc=TL, alpha=0.9, ec="k", lw=0.6, zorder=6))
fig.savefig("path.png", dpi=200, bbox_inches="tight", pad_inches=0.02, facecolor=BG); plt.close(fig)
import math
print("nodes", len(seen), "aspect", H/W, "gears", sorted(set(w["gear"] for w in wp)), "switches", sum(1 for i in range(1,len(wp)) if wp[i]["gear"]!=wp[i-1]["gear"]), "len", sum(math.hypot(xs[i]-xs[i-1], ys[i]-ys[i-1]) for i in range(1,len(wp))))
