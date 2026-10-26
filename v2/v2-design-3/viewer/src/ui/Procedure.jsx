import { useEffect, useRef } from 'react'
import { clamp, fmt, stepIndexAt, turnsText } from '../data'
import { gearOf } from '../derive'
import { I } from './icons'

// The whole manoeuvre as a checklist. Click a step to jump to its start.
export default function Procedure({ steps, t, onSeek, lock }) {
  const box = useRef(null)
  const rows = useRef([])
  const cur = stepIndexAt(steps, t)

  useEffect(() => {
    const el = rows.current[cur], b = box.current
    if (!el || !b) return
    if (el.offsetTop < b.scrollTop) b.scrollTop = el.offsetTop - 4
    else if (el.offsetTop + el.offsetHeight > b.scrollTop + b.clientHeight) b.scrollTop = el.offsetTop + el.offsetHeight - b.clientHeight + 4
  }, [cur])

  return (
    <div className="scroll" ref={box}>
      <ol className="proc">
        {steps.map((s, i) => {
          const drive = s.kind === 'drive'
          const g = gearOf(s)
          const state = i === cur ? 'cur' : i < cur ? 'done' : ''
          const tone = !drive ? '' : s.margin_deg < 8 ? 'danger' : s.margin_deg < 20 ? 'warn' : ''
          const prog = clamp((t - s.t0) / Math.max(s.t1 - s.t0, 0.001), 0, 1)
          return (
            <li key={s.id} ref={(el) => { rows.current[i] = el }} className={state}>
              <button onClick={() => onSeek(s.t0)} aria-current={i === cur ? 'step' : undefined} title={`Jump to step ${i + 1}`}>
                <span className={`gtag g-${g}`}>{g}</span>
                <span className="p-l"><span className="p-n">{state === 'done' ? I.check : `${i + 1}.`}</span>{s.label}</span>
                <span className="p-t">{fmt(s.t0, 0)} s</span>
                <span className="p-m">
                  {drive ? <>{s.side === 'straight' ? 'straight' : `${turnsText(s.turns, lock)} ${s.side}`} · {fmt(s.speed_kmh, 0)} km/h · {fmt(s.dist, 0)} m · <span className={tone} title={`Hitch angle peaks at ${fmt(s.peak_psi, 0)}°, ${fmt(s.margin_deg, 0)}° below the limit`}>ψ {fmt(s.peak_psi, 0)}°</span></> : `hold ${fmt(Math.max(0, s.t1 - s.t0), 0)} s`}
                </span>
              </button>
              {i === cur && <i className="p-bar" style={{ transform: `scaleX(${prog})` }} />}
            </li>
          )
        })}
      </ol>
      <p className="keys">
        <span><kbd>Space</kbd> play / pause</span> <span><kbd>←</kbd><kbd>→</kbd> step</span>{' '}
        <span><kbd>Shift</kbd> + <kbd>←</kbd><kbd>→</kbd> ±5 s</span> <span><kbd>[</kbd><kbd>]</kbd> speed</span>
      </p>
    </div>
  )
}
