"""Signed-distance-field collision checking.

The lot is rasterised once (obstacles + everything outside the bounds = solid). A rig pose is then
covered by discs (tractor + trailer); a disc of radius r at c is clear when sdf(c) > r.
sdf > 0 in free space, < 0 inside solid. Lookup is bilinear so the NMPC sees a smooth clearance.
"""
from math import cos, sin, hypot

import numpy as np
from scipy.ndimage import distance_transform_edt, map_coordinates

from .model import VEH, trailer_pose

RES = 0.25
PAD = 4.0          # solid border around the bounds, metres
DISC_STEP = 1.0    # spacing of covering discs along each body


def _disc_layout(length_back, length_front, width):
    n = max(2, int(round((length_back + length_front) / DISC_STEP)))
    offs = np.linspace(-length_back + DISC_STEP / 2, length_front - DISC_STEP / 2, n)
    r = hypot(DISC_STEP / 2, width / 2)
    return offs, r


class CollisionMap:
    def __init__(self, layout, veh=VEH):
        b = layout["bounds"]
        self.veh = veh
        self.x0, self.y0 = b["xmin"] - PAD, b["ymin"] - PAD
        w = int(np.ceil((b["xmax"] - b["xmin"] + 2 * PAD) / RES))
        h = int(np.ceil((b["ymax"] - b["ymin"] + 2 * PAD) / RES))
        gx = self.x0 + (np.arange(w) + 0.5) * RES
        gy = self.y0 + (np.arange(h) + 0.5) * RES
        X, Y = np.meshgrid(gx, gy)              # shape (h, w)
        solid = (X < b["xmin"]) | (X > b["xmax"]) | (Y < b["ymin"]) | (Y > b["ymax"])
        for poly in layout["obstacles"]:
            solid |= self._inside(poly, X, Y)
        # distance in metres, negative inside solid
        self.sdf = (distance_transform_edt(~solid) - distance_transform_edt(solid)) * RES
        self.shape = (h, w)
        self.bounds = b

        self.tr_offs, self.tr_r = _disc_layout(veh.tractor_rear, veh.L1 + veh.tractor_front, veh.width)
        self.tl_offs, self.tl_r = _disc_layout(veh.trailer_rear, veh.L2 + veh.trailer_front, veh.width)

    @staticmethod
    def _inside(poly, X, Y):
        """Point-in-convex-polygon (corners CCW)."""
        inside = np.ones(X.shape, dtype=bool)
        n = len(poly)
        for i in range(n):
            ax, ay = poly[i]
            bx, by = poly[(i + 1) % n]
            inside &= (bx - ax) * (Y - ay) - (by - ay) * (X - ax) >= 0
        return inside

    def sdf_at(self, px, py):
        """Bilinear SDF lookup for arrays of world points."""
        ix = (np.asarray(px) - self.x0) / RES - 0.5
        iy = (np.asarray(py) - self.y0) / RES - 0.5
        return map_coordinates(self.sdf, [iy, ix], order=1, mode="nearest")

    def disc_centres(self, s):
        x, y, th, psi = s
        tx, ty, th1 = trailer_pose(s, self.veh)
        c0, s0, c1, s1 = cos(th), sin(th), cos(th1), sin(th1)
        px = np.concatenate([x + self.tr_offs * c0, tx + self.tl_offs * c1])
        py = np.concatenate([y + self.tr_offs * s0, ty + self.tl_offs * s1])
        r = np.concatenate([np.full(self.tr_offs.shape, self.tr_r), np.full(self.tl_offs.shape, self.tl_r)])
        return px, py, r

    def clearance_many(self, states):
        """Vectorised clearance (nearest-cell lookup) for a list of states; returns array."""
        a = np.asarray(states, dtype=float)
        x, y, th, psi = a[:, 0], a[:, 1], a[:, 2], a[:, 3]
        th1 = th - psi
        hx, hy = x + self.veh.d * np.cos(th), y + self.veh.d * np.sin(th)
        tx, ty = hx - self.veh.L2 * np.cos(th1), hy - self.veh.L2 * np.sin(th1)
        px = np.concatenate([x[:, None] + self.tr_offs[None, :] * np.cos(th)[:, None],
                             tx[:, None] + self.tl_offs[None, :] * np.cos(th1)[:, None]], axis=1)
        py = np.concatenate([y[:, None] + self.tr_offs[None, :] * np.sin(th)[:, None],
                             ty[:, None] + self.tl_offs[None, :] * np.sin(th1)[:, None]], axis=1)
        r = np.concatenate([np.full(self.tr_offs.shape, self.tr_r), np.full(self.tl_offs.shape, self.tl_r)])
        ix = np.clip(((px - self.x0) / RES).astype(int), 0, self.shape[1] - 1)
        iy = np.clip(((py - self.y0) / RES).astype(int), 0, self.shape[0] - 1)
        return (self.sdf[iy, ix] - r[None, :]).min(axis=1)

    def clearance_batch(self, states):
        """Bilinear (differentiable-ish) clearance for an array of states (..., 4); returns shape (...).

        One map_coordinates call for every covering disc of every state: the NMPC evaluates a whole
        batch of candidate horizons at once."""
        a = np.asarray(states, dtype=float)
        lead = a.shape[:-1]
        a = a.reshape(-1, 4)
        x, y, th, psi = a[:, 0], a[:, 1], a[:, 2], a[:, 3]
        c0, s0 = np.cos(th), np.sin(th)
        th1 = th - psi
        c1, s1 = np.cos(th1), np.sin(th1)
        hx, hy = x + self.veh.d * c0, y + self.veh.d * s0
        tx, ty = hx - self.veh.L2 * c1, hy - self.veh.L2 * s1
        px = np.concatenate([x[:, None] + self.tr_offs[None, :] * c0[:, None],
                             tx[:, None] + self.tl_offs[None, :] * c1[:, None]], axis=1)
        py = np.concatenate([y[:, None] + self.tr_offs[None, :] * s0[:, None],
                             ty[:, None] + self.tl_offs[None, :] * s1[:, None]], axis=1)
        r = np.concatenate([np.full(self.tr_offs.shape, self.tr_r), np.full(self.tl_offs.shape, self.tl_r)])
        d = self.sdf_at(px.ravel(), py.ravel()).reshape(px.shape) - r[None, :]
        return d.min(axis=1).reshape(lead)

    def clearance_smooth(self, states):
        """Bilinear (differentiable-ish) clearance for each state in a list; returns array."""
        return self.clearance_batch(states)

    def clearance(self, s):
        """Smallest gap (m) between the rig and any obstacle/wall; negative = collision."""
        px, py, r = self.disc_centres(s)
        return float(np.min(self.sdf_at(px, py) - r))

    def collides(self, s, margin=0.0):
        return self.clearance(s) < margin
