import { DEG, clamp, fmt, kinematics } from '../data'
import { M, Dot } from './math'

// Sign follows the rounded value, so a tiny negative number never prints as "−0.0".
const signed = (v, d = 1) => { const r = Number(v.toFixed(d)); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}` }
const num = (v, d = 1) => { const r = Number(v.toFixed(d)); return `${r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}` }

// A column vector: its name, then one row per component (symbol, value, unit).
function Vec({ name, rows }) {
  return (
    <div className="vec">
      <div className="vec-h">{name}</div>
      {rows.map(([sym, v, u], i) => (
        <div className="vec-r" key={i}><span className="vs">{sym}</span><span className="vv">{v}</span><span className="vu">{u}</span></div>
      ))}
    </div>
  )
}

// One term of psi-dot as a bar growing left (negative) or right (positive) from zero, on a per-run fixed scale.
function Term({ name, value, scale, tone, tag, total }) {
  const w = clamp(Math.abs(value) / scale, 0, 1) * 50
  return (
    <div className={`term ${total ? 'total' : ''}`}>
      <span className="t-name">{name}</span>
      <span className="t-bar" aria-hidden="true">
        <i className={tone} style={{ left: `${value < 0 ? 50 - w : 50}%`, width: `${w}%` }} />
      </span>
      <span className="t-val">{signed(value)}</span>
      <span className={`t-tag ${tone || ''}`}>{tag}</span>
    </div>
  )
}

const NOTE = {
  destabilising: 'Reversing: hitch term grows |ψ|; steering cancels it.',
  restoring: 'Forward: hitch term pulls ψ back to zero.',
  neutral: 'ψ ≈ 0, so the hitch term is idle.',
}

// The kinematic model of the slides, evaluated with the current numbers. X = [x1, y1, theta0, psi], U = [v, delta].
export default function ModelPanel({ frameText, vehicle, scale, tText }) {
  const [, x, y, th, psi, v, delta] = frameText
  const k = kinematics(frameText, vehicle)
  const d = (r) => r * DEG
  return (
    <section className="panel model" aria-label="Live model">
      <header className="panel-h"><h3>Live model</h3><span className="panel-m">evaluated at&nbsp;<M>t</M>&nbsp;=&nbsp;{fmt(tText, 1)} s</span></header>

      <div className="vecs">
        <Vec name={<M>X</M>} rows={[
          [<><M>x</M><sub>1</sub></>, num(x), 'm'],
          [<><M>y</M><sub>1</sub></>, num(y), 'm'],
          [<><M>θ</M><sub>0</sub></>, num(d(th), 0), '°'],
          [<M>ψ</M>, signed(d(psi)), '°'],
        ]} />
        <Vec name={<Dot tall>X</Dot>} rows={[
          [<><Dot>x</Dot><sub>1</sub></>, signed(k.xd, 2), 'm/s'],
          [<><Dot>y</Dot><sub>1</sub></>, signed(k.yd, 2), 'm/s'],
          [<><Dot tall>θ</Dot><sub>0</sub></>, signed(d(k.thd)), '°/s'],
          [<Dot tall>ψ</Dot>, signed(d(k.psid)), '°/s'],
        ]} />
        <Vec name={<M>U</M>} rows={[
          [<M>v</M>, signed(v, 2), 'm/s'],
          [<M>δ</M>, signed(d(delta)), '°'],
          [<abbr className="m" title="Tractor turn radius, L1 / tan δ">R</abbr>, k.radius == null ? '∞' : fmt(k.radius, 1), k.radius == null ? '' : 'm'],
        ]} />
      </div>

      {/* each term is unbreakable, so the equation only wraps between terms */}
      <div className="eq" aria-label="Hitch angle rate equation">
        <span className="nw"><Dot tall>ψ</Dot> = <M>v</M> tan <M>δ</M> / <M>L</M><sub>1</sub></span>{' '}
        <span className="nw">− <M>v</M> sin <M>ψ</M> / <M>L</M><sub>2</sub></span>{' '}
        <span className="nw">− <M>v</M><M>d</M> tan <M>δ</M> cos <M>ψ</M> / <M>L</M><sub>1</sub><M>L</M><sub>2</sub></span>
      </div>
      <div className="terms" aria-label="Terms of the hitch angle rate, degrees per second">
        <Term name="steering" value={d(k.steer)} scale={scale} />
        <Term name="hitch" value={d(k.hitch)} scale={scale} tone={k.mode === 'destabilising' ? 'danger' : k.mode === 'restoring' ? 'ok' : ''} tag={k.mode} />
        <Term name="offset" value={d(k.offset)} scale={scale} />
        <Term name={<>sum = <Dot tall>ψ</Dot></>} value={d(k.psid)} scale={scale} total tag="°/s" />
      </div>
      <p className={`mnote ${k.mode}`}>{NOTE[k.mode]}</p>
    </section>
  )
}
