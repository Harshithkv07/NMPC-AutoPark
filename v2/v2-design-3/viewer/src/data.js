// Data loading + geometry helpers shared by scene and UI.

const cache = new Map()

export async function loadManifest() {
  const r = await fetch('./data/manifest.json')
  if (!r.ok) throw new Error('manifest.json missing - run: python -m sim.export')
  return r.json()
}

export async function loadLot(file) {
  if (cache.has(file)) return cache.get(file)
  const r = await fetch(`./data/${file}`)
  if (!r.ok) throw new Error(`${file} not found`)
  const data = await r.json()
  cache.set(file, data)
  return data
}

// ---------- version 2: the live solver (server.py). Absent when the viewer is served as plain files. ----------

async function api(path, body) {
  const r = await fetch(path, body === undefined ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(data.error || `${path}: HTTP ${r.status}`)
    e.problems = data.problems                    // a drawn yard the server refused, item by item
    throw e
  }
  return data
}

// {version, workers} when the live solver answers within `ms`, else null
export async function detectLive(ms = 800) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch('./api/health', { signal: ctl.signal, cache: 'no-store' })
    const h = r.ok ? await r.json() : null
    return h && h.version === 2 ? h : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const createLot = (spec) => api('./api/lots', spec)                 // {layout, seed?, occupied?, vehicle?} -> {lot_id, lot}
export const previewLot = (spec) => api('./api/layout', spec)             // {layout, seed | custom, occupied?, vehicle?} -> {lot, problems}, unsolved

// ---------- version 2 design 2: the NMPC driving live (server.py /api/live) ----------
export const liveStart = (body) => api('./api/live', body)                 // {lot_id, bay, controller, speed} -> {run_id}
export const livePoll = (id, n = [0, 0, 0]) =>
  api(`./api/live/${encodeURIComponent(id)}?from=${n[0]}&hfrom=${n[1]}&efrom=${n[2]}`)
export const liveCmd = (id, cmd, body = {}) => api(`./api/live/${encodeURIComponent(id)}/${cmd}`, body)   // push | speed | stop
export const pollLot = (id) => api(`./api/lots/${encodeURIComponent(id)}`)   // -> {bays: [{id, status, reason?}], done, elapsed}
export const fetchPlan = (id, bay) => api(`./api/lots/${encodeURIComponent(id)}/plans/${bay}`)

// Apply server verdicts and fetched plans to a lot (pure; unchanged bays keep their identity). A bay only
// becomes 'ok' once its plan is here, so a certified bay is never clickable before it can be played.
export function mergeLot(lot, statuses, plans = {}) {
  const allPlans = { ...lot.plans }
  for (const [k, p] of Object.entries(plans)) allPlans[String(k)] = p
  const byId = new Map(statuses.map((s) => [s.id, s]))
  const bays = lot.layout.bays.map((b) => {
    const s = byId.get(b.id)
    if (!s || b.status === 'occupied') return b
    const status = s.status === 'ok' && !allPlans[String(b.id)] ? 'solving' : s.status
    const reason = status === 'infeasible' ? s.reason : undefined
    if (status === b.status && reason === b.reason && s.s === b.solveS) return b
    const next = { ...b, status, solveS: s.s }
    if (reason) next.reason = reason
    else delete next.reason
    return next
  })
  return { ...lot, layout: { ...lot.layout, bays }, plans: allPlans }
}

// Overall rig length (tractor nose to trailer tail) from the vehicle parameters
export const rigLength = (v) => v.L1 + v.tractor_front + v.L2 - v.d + v.trailer_rear

// ---------- the vehicle as the set-up step edits it ----------
// A spec is what server.py takes as `vehicle`: lengths in metres (0.01 m), angles in whole DEGREES. A lot file's
// vehicle carries radians rounded to 4 decimals; whole degrees recover the exact values the solver used.
export const VEHICLE_KEYS = ['L1', 'L2', 'd', 'delta_max', 'psi_crit', 'psi_jack']
const ANGLE_KEYS = new Set(['delta_max', 'psi_crit', 'psi_jack'])
export const specOf = (veh) => Object.fromEntries(VEHICLE_KEYS.map((k) =>
  [k, ANGLE_KEYS.has(k) ? Math.round(veh[k] * DEG) : Math.round(veh[k] * 100) / 100]))
export const sameSpec = (a, b) => !!a && !!b && VEHICLE_KEYS.every((k) => a[k] === b[k])
// The lot-file vehicle for a spec, keeping the parameters a spec does not cover (width, overhangs) from `base`
export const vehicleOf = (spec, base) => ({ ...base, ...Object.fromEntries(VEHICLE_KEYS.map((k) =>
  [k, ANGLE_KEYS.has(k) ? spec[k] / DEG : spec[k]])) })

// Change one parameter of a spec, keeping the jackknife angle at least `gap` degrees above the hitch limit
// (whichever of the two was not edited moves). `limits`: {key: [lo, hi]} from the server.
export function setParam(spec, key, value, limits, gap) {
  const next = { ...spec, [key]: value }
  if (key === 'psi_crit' && next.psi_jack < value + gap) next.psi_jack = Math.min(limits.psi_jack[1], value + gap)
  if (key === 'psi_jack' && next.psi_crit > value - gap) next.psi_crit = Math.max(limits.psi_crit[0], value - gap)
  return next
}

// The lot as it looks while the fill is being edited: `occupied` bays hold a rig (existing rigs stay where they
// are, new ones sit centred), every other bay is an unsolved 'draft'. Pure.
export function draftLot(lot, occupied) {
  const occ = new Set(occupied)
  const L = rigLength(lot.vehicle), W = lot.vehicle.width
  const bays = lot.layout.bays.map((b) => {
    const { reason, solveS, ...rest } = b
    if (occ.has(b.id)) {
      return b.occupied ? { ...rest, status: 'occupied' }
        : { ...rest, occupied: true, status: 'occupied', parked: { cx: b.cx, cy: b.cy, theta: b.theta, l: L, w: W } }
    }
    return { ...rest, occupied: false, parked: null, status: 'draft' }
  })
  return { ...lot, layout: { ...lot.layout, bays }, plans: {} }
}

export const occupiedIds = (lot) => lot.layout.bays.filter((b) => b.occupied).map((b) => b.id)

export const sameIds = (a, b) => {
  const A = new Set(a), B = new Set(b)
  return A.size === B.size && [...A].every((x) => B.has(x))
}

// A random set of filled bays for the lot-setup step, like sim/lot.py: about half the bays filled, at least three
// free. Tandem lanes fill from their far end so every free slot can still be driven into. `rnd` is injectable for tests.
export function randomOccupancy(lot, rnd = Math.random) {
  const bays = lot.layout.bays
  if (lot.layout.name === 'tandem') {
    const per = bays.length / 2, out = []
    for (let lane = 0; lane < 2; lane++) {
      const n = 1 + Math.floor(rnd() * 3)                     // 1-3 trucks at the far end of each lane
      for (let k = per - n; k < per; k++) out.push(lane * per + k)
    }
    return out
  }
  const ids = bays.map((b) => b.id)
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]] }
  const filled = Math.min(ids.length - 3, Math.max(3, Math.round(ids.length * (0.45 + 0.2 * rnd()))))
  return ids.slice(0, filled).sort((a, b) => a - b)
}

// Progress of a live lot: bays with a verdict / free bays, and how many free bays are in each state
export function liveProgress(lot) {
  const free = lot.layout.bays.filter((b) => b.status !== 'occupied')
  const n = (s) => free.filter((b) => b.status === s).length
  return { free: free.length, decided: n('ok') + n('infeasible'), ok: n('ok'), failed: n('infeasible'),
    solving: n('solving'), pending: n('pending'), deepening: n('deepening') }
}

// How far a lot being certified has got, 0-1, for the progress bar. A bay with a verdict counts 1. The solver cannot
// say how far into a bay it is, so a bay being solved earns up to half of its share as time passes (most first
// attempts take 5-25 s), and a bay being retried creeps on from half (retries take about a minute). It never runs
// backwards and only a verdict completes a bay. `since`: {bayId: [status, lot elapsed s when the bay entered it]}.
export const SOLVE_S = 15, RETRY_S = 60
export function certifyFraction(lot, since, elapsed) {
  const free = lot.layout.bays.filter((b) => b.status !== 'occupied')
  if (!free.length) return 1
  let sum = 0
  for (const b of free) {
    const s = since[b.id]
    const dt = s && s[0] === b.status ? Math.max(0, elapsed - s[1]) : 0
    if (b.status === 'ok' || b.status === 'infeasible') sum += 1
    else if (b.status === 'solving') sum += 0.5 * (1 - Math.exp(-dt / SOLVE_S))
    else if (b.status === 'deepening') sum += 0.5 + 0.45 * (1 - Math.exp(-dt / RETRY_S))
  }
  return sum / free.length
}

export const DEG = 180 / Math.PI
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, f) => a + (b - a) * f

export const RATIO = 20 // steering-wheel degrees per road-wheel degree
export const turnsOf = (delta) => (delta * DEG * RATIO) / 360

// frame layout: [t, x, y, th, psi, v, delta]
export function frameIndexAt(frames, t) {
  let lo = 0, hi = frames.length - 1
  if (t <= frames[0][0]) return 0
  if (t >= frames[hi][0]) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (frames[mid][0] <= t) lo = mid
    else hi = mid
  }
  return lo
}

export function sampleFrames(frames, t) {
  if (!frames.length) return null
  const last = frames[frames.length - 1]
  if (t <= frames[0][0]) return frames[0]
  if (t >= last[0]) return last
  const i = frameIndexAt(frames, t)
  const a = frames[i], b = frames[i + 1]
  const f = (t - a[0]) / (b[0] - a[0] || 1)
  return [t, lerp(a[1], b[1], f), lerp(a[2], b[2], f), lerp(a[3], b[3], f),
    lerp(a[4], b[4], f), lerp(a[5], b[5], f), lerp(a[6], b[6], f)]
}

export function trailerAxle(x, y, th, psi, veh) {
  const th1 = th - psi
  const hx = x + veh.d * Math.cos(th)
  const hy = y + veh.d * Math.sin(th)
  return { x: hx - veh.L2 * Math.cos(th1), y: hy - veh.L2 * Math.sin(th1), th: th1 }
}

export function stepIndexAt(steps, t) {
  let idx = 0
  for (let i = 0; i < steps.length; i++) if (steps[i].t0 <= t + 1e-6) idx = i
  return idx
}

// NMPC prediction snapshots, sorted by time: [t, [[x, y, th, psi] ...]]
export function horizonAt(hor, t) {
  if (!hor.length || t < hor[0][0]) return null
  let lo = 0, hi = hor.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (hor[mid][0] <= t) lo = mid
    else hi = mid - 1
  }
  return hor[lo]
}

// The model of PPT slide 9, evaluated at one frame. Angles in rad, rates in rad/s.
export function kinematics(frame, veh) {
  const [, , , th, psi, v, delta] = frame
  const tn = Math.tan(delta)
  const steer = (v * tn) / veh.L1
  const hitch = (-v * Math.sin(psi)) / veh.L2
  const offset = (-v * veh.d * tn * Math.cos(psi)) / (veh.L1 * veh.L2)
  // the hitch term pushes |psi| up when it has the same sign as psi (reversing), otherwise it pulls it back
  const mode = Math.abs(psi) < 0.03 || Math.abs(hitch) < 1e-4 ? 'neutral' : hitch * psi > 0 ? 'destabilising' : 'restoring'
  return {
    xd: v * Math.cos(th), yd: v * Math.sin(th), thd: (v * tn) / veh.L1,
    psid: steer + hitch + offset, steer, hitch, offset, mode,
    radius: Math.abs(delta) < 0.008 ? null : veh.L1 / Math.abs(tn),
  }
}

export function bayCorners(b) {
  const c = Math.cos(b.theta), s = Math.sin(b.theta)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, d]) => {
    const px = (a * b.l) / 2, py = (d * b.w) / 2
    return [b.cx + px * c - py * s, b.cy + px * s + py * c]
  })
}

// Wheel turns from which an instruction reads "full lock": the last whole quarter turn before the steering lock
// (1.75 of the 1.94 turns of a 35 deg lock), as sim/advisor.py:lock_turns.
export const lockTurns = (veh) => Math.floor(Math.round(veh.delta_max * DEG) * RATIO / 360 * 4 + 1e-6) / 4

export function turnsText(turns, lock = 1.75) {
  const q = Math.round(Math.abs(turns) * 4) / 4
  if (q === 0) return 'straight'
  if (q >= lock) return 'full lock'
  const whole = Math.floor(q)
  const frac = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' }[q - whole]
  return whole === 0 ? `${frac} turn` : `${whole}${frac} turn${q > 1 ? 's' : ''}`
}

export const sideOf = (turns) => (Math.abs(turns) < 0.12 ? 'straight' : turns > 0 ? 'left' : 'right')
export const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-')
