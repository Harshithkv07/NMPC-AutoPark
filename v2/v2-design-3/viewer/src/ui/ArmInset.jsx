import { DEG, fmt } from '../data'
import { armChain, ARM_W as W, ARM_H as H } from '../derive'
import { M } from './math'

// A point `r` px from `o` in the world direction `a` (screen y points down)
const at = (o, r, a) => [o[0] + r * Math.cos(a), o[1] - r * Math.sin(a)]
const xy = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
// Arc of radius r around o from world angle a0 to a1 (the short way)
function arc(o, r, a0, a1) {
  const d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))
  return `M${xy(at(o, r, a0))}A${r} ${r} 0 0 ${d < 0 ? 1 : 0} ${xy(at(o, r, a0 + d))}`
}
const signed = (v, d = 1) => { const r = Number(v.toFixed(d)); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}` }
const wrapDeg = (a) => ((a * DEG + 540) % 360) - 180

// Live inset on the map: the tractor-trailer drawn as the 2-link planar arm the model treats it as, moving with the rig.
export default function ArmInset({ frame, vehicle: v }) {
  const k = armChain(frame, v)
  const lim = v.psi_crit
  const alarm = Math.abs(k.psi) > lim * 0.92                       // the yard's alarm threshold
  const back = k.th + Math.PI                                       // tractor axis, extended behind the hitch
  const rw = Math.max(26, v.L2 * k.s * 0.72)                        // joint-limit wedge radius
  const lo = at(k.H, rw, back - lim), hi = at(k.H, rw, back + lim)
  const wheel = Math.max(9, 1.4 * k.s) / 2
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const label = (a, b, ang, text) => {                              // a link name beside the link's middle
    const m = at(mid(a, b), 10, ang + Math.PI / 2)
    return <text className="arm-l" x={m[0]} y={m[1] + 4} textAnchor="middle">L<tspan className="arm-s" dy="2">{text}</tspan></text>
  }
  return (
    <figure className="arm" aria-label="The rig as a two-link planar arm">
      <figcaption className="arm-h"><b>Kinematic chain</b><span>2-link planar arm</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Hitch joint ${signed(k.psi * DEG)} degrees, steering joint ${signed(k.delta * DEG)} degrees`}>
        {/* world frame */}
        <g className="arm-ax">
          <path d={`M12 ${H - 10}h18M12 ${H - 10}v-18`} />
          <path d={`M27 ${H - 13}l4 3-4 3M9 ${H - 25}l3-4 3 4`} />
          <text x="33" y={H - 7}>x</text><text x="16" y={H - 27}>y</text>
        </g>
        {/* joint limit of the hitch: the trailer link may point anywhere in this wedge (|psi| <= limit) */}
        <path className="arm-lim" d={`M${xy(k.H)}L${xy(lo)}A${rw} ${rw} 0 0 0 ${xy(hi)}Z`} />
        <path className="arm-lim-e" d={`M${xy(k.H)}L${xy(lo)}M${xy(k.H)}L${xy(hi)}`} />
        <text className="arm-t lim" x={at(k.H, rw + 9, back + lim)[0]} y={at(k.H, rw + 9, back + lim)[1] + 3} textAnchor="middle">±{fmt(lim * DEG, 0)}°</text>
        {/* links */}
        <line className="arm-link trailer" x1={k.H[0]} y1={k.H[1]} x2={k.T[0]} y2={k.T[1]} />
        <line className="arm-link tractor" x1={k.P0[0]} y1={k.P0[1]} x2={k.F[0]} y2={k.F[1]} />
        {label(k.H, k.T, k.th1, '2')}
        {label(k.P0, k.F, k.th, '1')}
        {/* steering joint at the front axle */}
        <line className="arm-wheel" x1={at(k.F, wheel, k.th + k.delta + Math.PI)[0]} y1={at(k.F, wheel, k.th + k.delta + Math.PI)[1]}
          x2={at(k.F, wheel, k.th + k.delta)[0]} y2={at(k.F, wheel, k.th + k.delta)[1]} />
        {Math.abs(k.delta) > 0.01 && <path className="arm-arc delta" d={arc(k.F, 13, k.th, k.th + k.delta)} />}
        {/* revolute hitch joint psi */}
        {Math.abs(k.psi) > 0.01 && <path className={`arm-arc psi ${alarm ? 'alarm' : ''}`} d={arc(k.H, 17, back, k.th1 + Math.PI)} />}
        <circle className="arm-axle" cx={k.P0[0]} cy={k.P0[1]} r="2.6" />
        <circle className={`arm-joint ${alarm ? 'alarm' : ''}`} cx={k.H[0]} cy={k.H[1]} r="4.6" />
        {/* end effector: the trailer axle */}
        <circle className="arm-ee" cx={k.T[0]} cy={k.T[1]} r="5" />
        <path className="arm-ee" d={`M${k.T[0] - 8} ${k.T[1]}h16M${k.T[0]} ${k.T[1] - 8}v16`} />
      </svg>
      <dl className="arm-vals">
        <div><dt><M>θ</M><sub>0</sub></dt><dd>{Math.round(wrapDeg(k.th)) || 0}°</dd></div>
        <div className={alarm ? 'alarm' : ''}><dt><M>ψ</M></dt><dd>{signed(k.psi * DEG)}°</dd></div>
        <div><dt><M>δ</M></dt><dd>{signed(k.delta * DEG)}°</dd></div>
        <div><dt><M>v</M></dt><dd>{signed(frame[5], 2)}</dd></div>
      </dl>
    </figure>
  )
}
