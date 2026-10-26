import heapq, numpy as np, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrow
from math import cos, sin, pi, hypot
INK, MUTE, LINE, OBS, TEAL, AMB, RED, PALE = "#1E2A33", "#5B6B78", "#D5DBE1", "#3E4C59", "#1F7A8C", "#E8A33D", "#C0392B", "#DCEBEE"
W, H = 14, 9
obst = {(x, y) for x in range(6, 8) for y in range(1, 7)} | {(x, 6) for x in range(3, 6)}
S, G = (2, 2), (11, 4)
def astar():
    op = [(0, 0, S)]; g = {S: 0}; par = {}; closed = []
    while op:
        f, gg, c = heapq.heappop(op)
        if c in closed: continue
        closed.append(c)
        if c == G: break
        for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
            n = (c[0]+dx, c[1]+dy)
            if not (0 <= n[0] < W and 0 <= n[1] < H) or n in obst: continue
            ng = gg + 1
            if ng < g.get(n, 1e9):
                g[n] = ng; par[n] = c; heapq.heappush(op, (ng + abs(n[0]-G[0]) + abs(n[1]-G[1]), ng, n))
    p = [G]
    while p[-1] != S: p.append(par[p[-1]])
    return closed, p[::-1]
closed, path = astar()
def grid(ax):
    for x in range(W):
        for y in range(H):
            ax.add_patch(Rectangle((x, y), 1, 1, fc=OBS if (x, y) in obst else "white", ec=LINE, lw=0.8))
    ax.set_xlim(0, W); ax.set_ylim(0, H); ax.set_aspect("equal"); ax.axis("off")
fig, ax = plt.subplots(figsize=(7, 4.5)); grid(ax)
for c in closed: ax.add_patch(Rectangle(c, 1, 1, fc=PALE, ec=LINE, lw=0.8))
ax.plot([c[0]+.5 for c in path], [c[1]+.5 for c in path], color=TEAL, lw=4, solid_joinstyle="miter")
for c, t, col in ((S, "S", TEAL), (G, "G", RED)):
    ax.add_patch(Rectangle(c, 1, 1, fc=col, ec=LINE)); ax.text(c[0]+.5, c[1]+.5, t, color="white", ha="center", va="center", fontsize=15, weight="bold")
fig.savefig("astar.png", dpi=200, bbox_inches="tight", pad_inches=0.02); plt.close(fig)
print("closed", len(closed), "path", len(path))
# grid path vs drivable path, same map
fig, ax = plt.subplots(figsize=(7, 4.5)); grid(ax)
ax.plot([c[0]+.5 for c in path], [c[1]+.5 for c in path], color=MUTE, lw=2.5, ls=(0, (3, 2)), solid_joinstyle="miter")
# smooth drivable curve (bezier through gaps) for illustration
t = np.linspace(0, 1, 200)
def cub(p0, p1, p2, p3):
    P = np.array([p0, p1, p2, p3], float); return bez(P, t)
def bez(P, t):
    n = len(P)-1; from math import comb
    return sum(comb(n, i)*((1-t)**(n-i))*(t**i)*P[i][:, None] for i in range(n+1)).T
B = np.vstack([cub((2.5,2.5),(4.0,2.5),(3.8,0.5),(5.2,0.5)), np.array([[5.2,0.5],[8.4,0.5]]), cub((8.4,0.5),(10.2,0.5),(9.8,4.5),(11.5,4.5))])

ax.plot(B[:, 0], B[:, 1], color=TEAL, lw=4)
for c, tx, col in ((S, "S", TEAL), (G, "G", RED)):
    ax.add_patch(Rectangle(c, 1, 1, fc=col, ec=LINE)); ax.text(c[0]+.5, c[1]+.5, tx, color="white", ha="center", va="center", fontsize=15, weight="bold")
fig.savefig("grid_vs_drive.png", dpi=200, bbox_inches="tight", pad_inches=0.02); plt.close(fig)
# hybrid concept: continuous node, arcs, endpoints off-centre
fig, ax = plt.subplots(figsize=(6.5, 4.5))
for x in range(9):
    for y in range(6): ax.add_patch(Rectangle((x, y), 1, 1, fc="white", ec=LINE, lw=0.8))
ax.set_xlim(0, 9); ax.set_ylim(0, 6); ax.set_aspect("equal"); ax.axis("off")
x0, y0, th0 = 3.35, 2.7, 0.15
def arc(x, y, th, k, L, d):
    xs, ys = [x], [y]
    for _ in range(40):
        ds = d * L/40; th += k*ds; x += ds*cos(th); y += ds*sin(th); xs.append(x); ys.append(y)
    return xs, ys, th
for d, col in ((1, TEAL), (-1, RED)):
    for k in (-0.55, -0.25, 0, 0.25, 0.55):
        xs, ys, th = arc(x0, y0, th0, k, 2.3, d)
        ax.plot(xs, ys, color=col, lw=2.5); ax.plot(xs[-1], ys[-1], "o", color=col, ms=8, mec="white", mew=1.2)
        if d == 1 and k == 0.25:
            ex, ey = xs[-1], ys[-1]
            for k2 in (-0.4, 0, 0.4):
                x2, y2, _ = arc(ex, ey, th, k2, 1.6, 1); ax.plot(x2, y2, color=TEAL, lw=1.3, alpha=0.45)
ax.annotate("", xy=(x0+0.75*cos(th0), y0+0.75*sin(th0)), xytext=(x0, y0), arrowprops=dict(arrowstyle="-|>", color=INK, lw=2.5, mutation_scale=22))
ax.plot(x0, y0, "o", color=INK, ms=11, mec="white", mew=1.5)
fig.savefig("hybrid.png", dpi=200, bbox_inches="tight", pad_inches=0.02); plt.close(fig)
