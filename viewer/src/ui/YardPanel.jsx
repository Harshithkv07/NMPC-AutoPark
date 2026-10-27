import { useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { bayLength, BAY_W } from '../layoutSpec'
import { fmt } from '../data'
import SegToggle from './SegToggle'
import { whenMotionOk } from '../motion'

// A number field that applies a typed value as soon as it parses and is in range; leaving it restores or clamps.
function Num({ label, value, unit, lo, hi, step = 0.5, dp = 1, placeholder, onChange, title }) {
  const [text, setText] = useState(null)
  const show = text ?? (value == null ? '' : Number(value).toFixed(dp))
  const ok = (v) => Number.isFinite(v) && v >= lo && v <= hi
  return (
    <label className="ynum" title={title}>
      <span className="k">{label}</span>
      <span className="v">
        <input inputMode="decimal" value={show} placeholder={placeholder} spellCheck="false"
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value.trim() === '' && placeholder) return onChange(null)
            const v = Number(e.target.value.replace(',', '.'))
            if (ok(v)) onChange(Math.round(v / step) * step)
          }}
          onBlur={() => setText(null)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <small>{unit}</small>
      </span>
    </label>
  )
}

// Right-hand panel of the "Define the yard" step: the yard, the selected item's numbers, and what still has to be fixed.
export default function YardPanel({ spec, veh, sel, onSelect, onChange, problems }) {
  const set = (kind, i, patch) => {
    if (kind === 'start') return onChange({ ...spec, start: patch })
    const key = kind === 'bay' ? 'bays' : 'obstacles'
    onChange({ ...spec, [key]: spec[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  }
  const defL = bayLength(veh)
  const item = sel && sel.kind === 'bay' ? spec.bays[sel.i] : sel && sel.kind === 'obstacle' ? spec.obstacles[sel.i] : null
  const ref = useRef(null)
  useGSAP(() => {
    whenMotionOk(() => gsap.from(ref.current.children, { x: 12, opacity: 0, duration: 0.35, stagger: 0.07, ease: 'power1.out' }))
  }, { scope: ref })
  return (
    <div ref={ref}>
      <section className="panel" aria-label="The yard">
        <header className="panel-h"><h3>The yard</h3><span className="panel-m">{spec.bays.length} bays &middot; {spec.obstacles.length} obstacles</span></header>
        <label className="ytext"><span className="k">Name</span>
          <input value={spec.label} maxLength={60} onChange={(e) => onChange({ ...spec, label: e.target.value })} />
        </label>
        <div className="ygrid">
          <Num label="Width" unit="m" lo={30} hi={300} step={1} dp={0} value={spec.size.w} onChange={(v) => onChange({ ...spec, size: { ...spec.size, w: v } })} />
          <Num label="Depth" unit="m" lo={30} hi={300} step={1} dp={0} value={spec.size.h} onChange={(v) => onChange({ ...spec, size: { ...spec.size, h: v } })} />
        </div>
      </section>

      <section className="panel" aria-label="Selected item">
        <header className="panel-h">
          <h3>{!sel || sel.kind === 'yard' ? 'Nothing selected' : sel.kind === 'start' ? 'Start' : `${sel.kind === 'bay' ? 'Bay' : 'Obstacle'} ${sel.i + 1}`}</h3>
          {sel?.kind === 'bay' && <span className="panel-m">{item.approach === 'forward' ? 'drive in' : 'reverse in'}</span>}
        </header>
        {(!sel || sel.kind === 'yard') && <p className="fine">Click a bay, an obstacle or the truck at the start to edit it here. Drag to move it; the handle on a selected item rotates it.</p>}
        {sel?.kind === 'start' && (
          <div className="ygrid three">
            <Num label="x" unit="m" lo={0} hi={spec.size.w} value={spec.start[0]} onChange={(v) => set('start', 0, [v, spec.start[1], spec.start[2]])} />
            <Num label="y" unit="m" lo={0} hi={spec.size.h} value={spec.start[1]} onChange={(v) => set('start', 0, [spec.start[0], v, spec.start[2]])} />
            <Num label="Heading" unit="°" lo={-180} hi={180} step={5} dp={0} value={spec.start[2]} onChange={(v) => set('start', 0, [spec.start[0], spec.start[1], v])} />
          </div>
        )}
        {item && (
          <>
            <div className="ygrid three">
              <Num label="x" unit="m" lo={-50} hi={350} value={item.cx} onChange={(v) => set(sel.kind, sel.i, { cx: v })} />
              <Num label="y" unit="m" lo={-50} hi={350} value={item.cy} onChange={(v) => set(sel.kind, sel.i, { cy: v })} />
              <Num label="Angle" unit="°" lo={-180} hi={180} step={5} dp={0} value={item.theta} onChange={(v) => set(sel.kind, sel.i, { theta: v })}
                title={sel.kind === 'bay' ? 'The way the tractor faces once parked' : 'Direction of the long side'} />
            </div>
            {sel.kind === 'bay' ? (
              <>
                <div className="ygrid">
                  <Num label="Length" unit="m" lo={5} hi={80} placeholder={`auto ${fmt(defL, 1)}`} value={item.l ?? null}
                    title="Empty: sized for the rig, as in the templates" onChange={(v) => set('bay', sel.i, { l: v ?? undefined })} />
                  <Num label="Width" unit="m" lo={2} hi={10} step={0.1} placeholder={`auto ${fmt(BAY_W, 1)}`} value={item.w ?? null}
                    onChange={(v) => set('bay', sel.i, { w: v ?? undefined })} />
                </div>
                <SegToggle ariaLabel="How the truck enters" tone="yfull"
                  value={item.approach === 'forward' ? 'forward' : 'reverse'}
                  onChange={(v) => set('bay', sel.i, { approach: v })}
                  options={[{ value: 'reverse', label: 'Reverse in' }, { value: 'forward', label: 'Drive in' }]} />
              </>
            ) : (
              <div className="ygrid">
                <Num label="Length" unit="m" lo={0.5} hi={300} value={item.l} onChange={(v) => set('obstacle', sel.i, { l: v })} />
                <Num label="Width" unit="m" lo={0.5} hi={300} value={item.w} onChange={(v) => set('obstacle', sel.i, { w: v })} />
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel" aria-label="Problems">
        <header className="panel-h">
          <h3>Checks</h3>
          {(() => {
            const errs = problems.filter((p) => (p.severity ?? 'error') === 'error').length
            const warns = problems.length - errs
            if (errs) return <span className="panel-m warn-ink">{errs} to fix{warns ? ` · ${warns} ${warns === 1 ? 'note' : 'notes'}` : ''}</span>
            if (warns) return <span className="panel-m warn-ink">{warns} {warns === 1 ? 'note' : 'notes'} (the solver still tries)</span>
            return <span className="panel-m ok-ink">ready to solve</span>
          })()}
        </header>
        {problems.length ? (
          <ul className="yprob">
            {problems.map((p, k) => (
              <li key={k}>
                <button onClick={() => {
                  const [kind, i] = (p.key || '').split(':')
                  if (kind === 'bay' || kind === 'obstacle') onSelect({ kind, i: Number(i) })
                  else if (kind === 'start') onSelect({ kind: 'start' })
                }}><b>{p.item}</b> {p.message}</button>
              </li>
            ))}
          </ul>
        ) : <p className="fine">Every bay fits the rig, nothing overlaps, the start is clear and every bay has room to drive in.</p>}
      </section>
    </div>
  )
}
