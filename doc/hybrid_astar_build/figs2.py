import sys; sys.path.insert(0, r"C:\Users\harshithKV\Desktop\Robotics\v2\v2-design-1")
import numpy as np, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from math import radians, degrees
from sim import planner
from sim.model import VEH, step, footprints
class Free:
    def clearance_many(self, X): return np.full(len(X), 99.0)
cm = Free()
FW, RV, TR, TL = "#1F7A8C", "#C0392B", "#1F7A8C", "#E8A33D"
# primitives fan
fig, ax = plt.subplots(figsize=(9, 5))
s0 = (0.0, 0.0, 0.0, 0.0)
for gi, g in enumerate((1, -1)):
    for k in range(5):
        cur, pts = s0, [s0]
        for _ in range(5):
            r = planner._expand_node(cur, (g,), cm, VEH)[k]
            if r is None: break
            pts += [x for x, _ in r]; cur = pts[-1]
        ax.plot([p[0] for p in pts], [p[1] for p in pts], color=FW if g > 0 else RV, lw=2.5)
        ax.plot(pts[-1][0], pts[-1][1], "o", color=FW if g > 0 else RV, ms=5)
tr, tl = footprints(s0)
ax.add_patch(Polygon(tr, fc=TR, alpha=0.85, ec="k", lw=0.6)); ax.add_patch(Polygon(tl, fc=TL, alpha=0.85, ec="k", lw=0.6))
ax.set_aspect("equal"); ax.axis("off")
fig.savefig("primitives.png", dpi=200, bbox_inches="tight", pad_inches=0.05, facecolor="white"); plt.close(fig)
# reverse stability
def run(mode, n=500, dt=0.1):
    s = (0, 0, 0, radians(3)); out = [3.0]; d = [0.0]
    for i in range(n):
        delta = 0.0 if mode == "fixed" else planner.hitch_regulator(s[3], -1.0, 0.0, VEH)
        s = step(s, -1.0, delta, dt, VEH); out.append(degrees(s[3])); d.append(d[-1] + dt)
        if abs(out[-1]) > 75: break
    return d, out
fig, ax = plt.subplots(figsize=(7, 3.6))
d, o = run("fixed"); ax.plot(d, np.abs(o), color=RV, lw=3, label="Steering held straight")
d2, o2 = run("reg"); ax.plot(d2, np.abs(o2), color=FW, lw=3, label="Hitch regulator (ours)")
ax.axhline(degrees(VEH.psi_crit) if hasattr(VEH, "psi_crit") else 60, color="#3E4C59", ls="--", lw=1.2)
ax.text(0.3, 62, "jackknife limit 60°", color="#3E4C59", fontsize=11)
ax.set_xlabel("distance reversed (m)", fontsize=12, color="#3E4C59"); ax.set_ylabel("|hitch angle| (deg)", fontsize=12, color="#3E4C59")
ax.set_ylim(0, 80); ax.set_xlim(0, 30)
for sp in ("top", "right"): ax.spines[sp].set_visible(False)
for sp in ("left", "bottom"): ax.spines[sp].set_color("#9AA5B1")
ax.tick_params(colors="#3E4C59", labelsize=11); ax.legend(frameon=False, fontsize=11, loc="upper left", bbox_to_anchor=(0.02, 0.68))
fig.savefig("unstable.png", dpi=200, bbox_inches="tight", pad_inches=0.05, facecolor="white")
print("fixed reaches", o[-1], "at", d[-1], "m; reg end", o2[-1], VEH)
