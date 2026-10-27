// Small derived quantities for the panels. Pure functions; data.js stays the single source of the model.
import { DEG, frameIndexAt, kinematics, trailerAxle, turnsText } from './data.js'

const SHORT = { cross: 'Cross 90°', angled: 'Angled 60°', parallel: 'Parallel', tandem: 'Tandem' }
export const layoutShort = (l) => SHORT[l.name] || l.label

export const gearOf = (s) => (s.kind === 'stop' ? 'N' : s.gear > 0 ? 'D' : 'R')
export const GEAR_NAME = { D: 'Drive', R: 'Reverse', N: 'Stopped', P: 'Parked' }

export const steerText = (s, lock) => (s.side === 'straight' ? 'wheel straight' : `${turnsText(s.turns, lock)} ${s.side}`)

// NMPC prediction snapshot -> [[seconds ahead, psi deg]] and its peak |psi|. Snapshots hold 12 states spaced 0.8 s,
// the first 0.4 s ahead (the same spacing the reference panel used).
export function prediction(hor) {
  if (!hor) return null
  const pts = hor[1].map((s, i) => [0.4 + 0.8 * i, s[3] * DEG])
  let peak = pts[0]
  for (const p of pts) if (Math.abs(p[1]) > Math.abs(peak[1])) peak = p
  return { pts, peak: { at: peak[0], psi: peak[1] } }
}

// psi over the last `span` seconds, for the history half of the look-ahead chart: [[seconds before now (<= 0), psi deg]]
export function history(frames, t, span = 10) {
  if (!frames || !frames.length) return []
  const i1 = frameIndexAt(frames, t)
  const out = []
  for (let i = i1; i >= 0; i--) {
    const dt = frames[i][0] - t
    if (dt < -span) break
    out.push([dt, frames[i][4] * DEG])
  }
  return out.reverse()
}

// A fixed scale for the psi-dot term bars, per run, so bars do not jump while playing: the largest term magnitude
// seen in the run, rounded up to a readable figure (deg/s).
export function termScale(frames, veh) {
  let m = 1
  for (const f of frames) {
    const k = kinematics(f, veh)
    m = Math.max(m, Math.abs(k.steer), Math.abs(k.hitch), Math.abs(k.offset), Math.abs(k.psid))
  }
  const deg = m * DEG
  return [2, 4, 6, 8, 10, 15, 20, 30, 45, 60].find((v) => v >= deg) || Math.ceil(deg)
}

// Nice length (m) for a scale bar that is roughly `targetPx` long at `pxPerM`.
export function scaleLength(pxPerM, targetPx = 90) {
  const want = targetPx / pxPerM
  return [1, 2, 5, 10, 20, 25, 50, 100].reduce((best, v) => (Math.abs(v - want) < Math.abs(best - want) ? v : best), 10)
}

// ---------- the rig as a robot arm (ui/ArmInset.jsx) ----------
export const ARM_W = 240, ARM_H = 172     // drawing, px

// The rig as a 2-link planar arm, in screen pixels: world frame (x east, y north, as in Plan view), centred on the
// hitch joint and scaled so the whole chain fits at any joint angle. Pure, for the tests.
//   P0 tractor rear axle, H hitch (revolute joint psi), F front axle (steering joint delta), T trailer axle (end effector)
export function armChain(frame, veh, w = ARM_W, h = ARM_H, margin = 14) {
  const [, x, y, th, psi, , delta] = frame
  const c = Math.cos(th), sn = Math.sin(th)
  const hx = x + veh.d * c, hy = y + veh.d * sn
  const tl = trailerAxle(x, y, th, psi, veh)
  const s = (Math.min(w, h) / 2 - margin) / Math.max(veh.L1 - veh.d + 0.8, veh.L2 + 0.8)
  const P = (wx, wy) => [w / 2 + (wx - hx) * s, h / 2 - (wy - hy) * s]
  return { s, th, psi, delta, th1: tl.th, P0: P(x, y), H: P(hx, hy), F: P(x + veh.L1 * c, y + veh.L1 * sn), T: P(tl.x, tl.y) }
}
