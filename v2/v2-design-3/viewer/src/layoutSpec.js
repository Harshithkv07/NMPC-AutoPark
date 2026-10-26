// Drawn yards (version 2 design 2): the layout spec the editor edits and the server solves (sim/custom.py).
// Spec: {label, size: {w, h}, start: [x, y, headingDeg], bays: [{cx, cy, theta, approach, w?, l?}],
//        obstacles: [{cx, cy, w, l, theta}]}; metres and DEGREES; the yard is x in [0, w], y in [0, h].
// Pure functions, so the Node tests can run them.
import { rigLength } from './data.js'

const RAD = Math.PI / 180
export const BAY_W = 4.2
export const BAY_SPARE = 3.5                     // bay length beyond the rig (sim/lot.py BAY_L - RIG_LEN)
export const MIN_BAY_L = 18
export const SNAP_M = 0.5, SNAP_DEG = 5

// The bay length a template gives this rig (sim/lot.py Yard.bay_l)
export const bayLength = (veh) => Math.max(MIN_BAY_L, rigLength(veh) + BAY_SPARE)

export const snap = (v, step = SNAP_M) => Math.round(v / step) * step
export const snapDeg = (a, step = SNAP_DEG) => ((Math.round(a / step) * step) % 360 + 540) % 360 - 180
const r2 = (v) => Math.round(v * 100) / 100

// Corners of a rectangle of length l along heading th (rad) and width w across it, centred on (cx, cy); counter-clockwise.
export function rect(cx, cy, th, l, w) {
  const c = Math.cos(th), s = Math.sin(th), hl = l / 2, hw = w / 2
  return [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([a, b]) => [cx + a * c - b * s, cy + a * s + b * c])
}

// Separating-axis overlap test of two convex polygons (as sim/custom.py:_overlap)
export function overlap(p, q) {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]
      const nx = by - ay, ny = ax - bx
      const a = p.map(([x, y]) => nx * x + ny * y), b = q.map(([x, y]) => nx * x + ny * y)
      if (Math.max(...a) <= Math.min(...b) || Math.max(...b) <= Math.min(...a)) return false
    }
  }
  return true
}

export const inside = (pts, size) => pts.every(([x, y]) => x >= -1e-6 && x <= size.w + 1e-6 && y >= -1e-6 && y <= size.h + 1e-6)

// A bay with its size resolved for the rig (no w / l drawn: the template size for this rig)
export const baySize = (b, veh) => ({ w: b.w ?? BAY_W, l: b.l ?? bayLength(veh) })
export const bayPoly = (b, veh, shrink = 0) => { const { w, l } = baySize(b, veh); return rect(b.cx, b.cy, b.theta * RAD, l - 2 * shrink, w - 2 * shrink) }
export const obstaclePoly = (o) => rect(o.cx, o.cy, o.theta * RAD, o.l, o.w)

// The rig's footprint (tractor, trailer) for a pose [x, y, headingDeg] of the tractor rear axle, hitch straight
export function rigPolys(pose, veh) {
  const [x, y, hd] = pose, th = hd * RAD, c = Math.cos(th), s = Math.sin(th)
  const front = veh.L1 + veh.tractor_front, back = veh.L2 - veh.d + veh.trailer_rear
  const tr = rect(x + c * (front - veh.tractor_rear) / 2, y + s * (front - veh.tractor_rear) / 2, th, front + veh.tractor_rear, veh.width)
  const tlc = (veh.d - veh.L2 + (veh.L2 + veh.trailer_front - veh.trailer_rear) / 2)     // trailer centre along the axis
  const tl = rect(x + c * tlc, y + s * tlc, th, veh.L2 + veh.trailer_front + veh.trailer_rear, veh.width)
  return [tr, tl]
}

// The open end of a bay: +u for a reverse bay (the truck backs in), -u for a forward one (it pulls in)
export function mouth(b, veh) {
  const { l } = baySize(b, veh), th = b.theta * RAD, sg = b.approach === 'forward' ? -1 : 1
  return { x: b.cx + sg * Math.cos(th) * l / 2, y: b.cy + sg * Math.sin(th) * l / 2, dir: th + (sg < 0 ? Math.PI : 0) }
}

// Checks that need no collision map, as you draw (the server adds the run-in check: /api/layout "problems").
// Returns [{item, message, key, severity}] where key is 'bay:i' | 'obstacle:i' | 'start' | 'yard'.
// Everything surfaced here is an error (geometric overlap, bay outside the yard, start in collision);
// the server adds advisory warnings with severity 'warn' that do not block the solver.
export function quickProblems(spec, veh) {
  const out = [], add = (key, item, message) => out.push({ key, item, message, severity: 'error' })
  const needL = rigLength(veh) + 1, needW = veh.width + 0.8
  if (!spec.bays.length) add('yard', 'yard', 'add at least one bay')
  const polys = spec.bays.map((b) => bayPoly(b, veh, 0.05))
  const obs = spec.obstacles.map(obstaclePoly)
  spec.bays.forEach((b, i) => {
    const key = `bay:${i}`, name = `bay ${i + 1}`, { w, l } = baySize(b, veh)
    if (l < needL - 1e-9) add(key, name, `${l.toFixed(1)} m long: this rig needs at least ${needL.toFixed(1)} m`)
    if (w < needW - 1e-9) add(key, name, `${w.toFixed(1)} m wide: this rig needs at least ${needW.toFixed(1)} m`)
    if (!inside(bayPoly(b, veh), spec.size)) add(key, name, 'reaches outside the yard')
    obs.forEach((o, j) => { if (overlap(polys[i], o)) add(key, name, `overlaps obstacle ${j + 1}`) })
    for (let j = 0; j < i; j++) if (overlap(polys[i], polys[j])) add(key, name, `overlaps bay ${j + 1}`)
  })
  spec.obstacles.forEach((o, j) => {
    if (o.cx < 0 || o.cx > spec.size.w || o.cy < 0 || o.cy > spec.size.h) add(`obstacle:${j}`, `obstacle ${j + 1}`, 'its centre is outside the yard')
  })
  const rig = rigPolys(spec.start, veh)
  if (!rig.every((p) => inside(p, spec.size)) || rig.some((p) => obs.some((o) => overlap(p, o))))
    add('start', 'start', 'the rig at the start overlaps an obstacle or the yard edge')
  return out
}

// A row of n bays side by side, starting at (x, y), all facing theta (deg), `pitch` m apart across the bays
export function bayRow({ x, y, theta, n = 5, pitch = BAY_W, approach = 'reverse' }) {
  const a = theta * RAD, nx = -Math.sin(a), ny = Math.cos(a)
  return Array.from({ length: n }, (_, i) => ({ cx: r2(x + nx * pitch * i), cy: r2(y + ny * pitch * i), theta, approach }))
}

// An empty yard to start drawing in
export function blankYard(veh) {
  const w = 140, h = 90, L = bayLength(veh)
  return {
    label: 'New yard', size: { w, h }, start: [16, h / 2, 0],
    bays: bayRow({ x: 70, y: h - L / 2 - 1, theta: -90, n: 5 }),
    obstacles: [],
  }
}

// A template lot (a library file or a /api/layout preview) as a spec: the yard shifted so it starts at (0, 0). Bays keep
// their drawn length only where it differs from this rig's default (so the parallel bays stay long and the others
// resize with the rig). Occupancy is not part of a spec.
export function specFromLot(lot) {
  const L = lot.layout, b = L.bounds, dx = -b.xmin, dy = -b.ymin, def = bayLength(lot.vehicle)
  const deg = (a) => r2(a / RAD)
  return {
    label: L.label || 'Yard',
    size: { w: r2(b.xmax - b.xmin), h: r2(b.ymax - b.ymin) },
    start: [r2(L.start[0] + dx), r2(L.start[1] + dy), deg(L.start[2])],
    bays: L.bays.map((x) => {
      const out = { cx: r2(x.cx + dx), cy: r2(x.cy + dy), theta: deg(x.theta), approach: x.approach }
      if (Math.abs(x.w - BAY_W) > 1e-6) out.w = x.w
      if (Math.abs(x.l - def) > 1e-6) out.l = x.l
      return out
    }),
    obstacles: (L.blocks || []).map((o) => ({ cx: r2(o.cx + dx), cy: r2(o.cy + dy), w: o.w, l: o.l, theta: deg(o.theta) })),
  }
}

// Read a spec from a file's text: the shape the editor saves, checked enough to be edited safely. Throws Error.
export function readSpec(text) {
  const s = JSON.parse(text)
  const num = (v, what) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} is not a number`); return v }
  if (!s || typeof s !== 'object' || !s.size) throw new Error('not a yard file: no size')
  if (!Array.isArray(s.bays) || !Array.isArray(s.obstacles || []) || !Array.isArray(s.start) || s.start.length !== 3)
    throw new Error('not a yard file: needs bays, obstacles and a start [x, y, heading]')
  return {
    label: String(s.label || 'Yard').slice(0, 60),
    size: { w: num(s.size.w, 'size.w'), h: num(s.size.h, 'size.h') },
    start: s.start.map((v, i) => num(v, `start[${i}]`)),
    bays: s.bays.map((b, i) => {
      const out = { cx: num(b.cx, `bay ${i + 1} cx`), cy: num(b.cy, `bay ${i + 1} cy`), theta: num(b.theta, `bay ${i + 1} theta`),
        approach: b.approach === 'forward' ? 'forward' : 'reverse' }
      if (b.w != null) out.w = num(b.w, `bay ${i + 1} w`)
      if (b.l != null) out.l = num(b.l, `bay ${i + 1} l`)
      return out
    }),
    obstacles: (s.obstacles || []).map((o, i) => ({ cx: num(o.cx, `obstacle ${i + 1} cx`), cy: num(o.cy, `obstacle ${i + 1} cy`),
      w: num(o.w, `obstacle ${i + 1} w`), l: num(o.l, `obstacle ${i + 1} l`), theta: num(o.theta ?? 0, `obstacle ${i + 1} theta`) })),
  }
}

export const sameYard = (a, b) => JSON.stringify(a) === JSON.stringify(b)
