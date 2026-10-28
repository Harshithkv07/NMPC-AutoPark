import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { baySize, mouth, obstaclePoly, bayPoly, rigPolys, snap, snapDeg, SNAP_M } from '../layoutSpec'
import { I } from './icons'
import { whenMotionOk } from '../motion'

const MARGIN = 6                          // m of ground drawn around the yard
const RAD = Math.PI / 180
const pts = (poly, H) => poly.map(([x, y]) => `${x.toFixed(2)},${(H - y).toFixed(2)}`).join(' ')

// Top-down editor of a drawn yard. World x east, y north, metres; the SVG is in metres too.
// `sel`: {kind: 'bay' | 'obstacle' | 'start' | 'yard', i?}. Every change goes through `onChange(spec)`.
export default function Editor({ spec, veh, sel, onSelect, onChange, bad }) {
  const svg = useRef(null)
  const drag = useRef(null)
  const [hover, setHover] = useState(null)
  const W = spec.size.w, H = spec.size.h
  const vb = `${-MARGIN} ${-MARGIN} ${W + 2 * MARGIN} ${H + 2 * MARGIN}`

  // pointer position in world metres
  const world = useCallback((e) => {
    const s = svg.current, p = s.createSVGPoint()
    p.x = e.clientX; p.y = e.clientY
    const q = p.matrixTransform(s.getScreenCTM().inverse())
    return [q.x, H - q.y]
  }, [H])

  const set = (kind, i, patch) => {
    if (kind === 'yard') return onChange({ ...spec, size: { ...spec.size, ...patch } })
    if (kind === 'start') return onChange({ ...spec, start: patch })
    const key = kind === 'bay' ? 'bays' : 'obstacles'
    onChange({ ...spec, [key]: spec[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  }

  // drag modes: move (body), rot (handle), size (obstacle corner), yard (yard corner)
  const begin = (e, kind, i, mode) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const [x, y] = world(e)
    const item = kind === 'bay' ? spec.bays[i] : kind === 'obstacle' ? spec.obstacles[i] : null
    const cx = kind === 'start' ? spec.start[0] : item?.cx, cy = kind === 'start' ? spec.start[1] : item?.cy
    drag.current = { kind, i, mode, dx: x - cx, dy: y - cy }
    onSelect({ kind, i })
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const [x, y] = world(e)
    if (d.mode === 'yard') return set('yard', 0, { w: Math.max(30, Math.min(300, snap(x, 1))), h: Math.max(30, Math.min(300, snap(y, 1))) })
    if (d.kind === 'start') {
      const s = spec.start
      if (d.mode === 'move') return set('start', 0, [snap(x - d.dx), snap(y - d.dy), s[2]])
      return set('start', 0, [s[0], s[1], snapDeg(Math.atan2(y - s[1], x - s[0]) / RAD)])
    }
    const item = d.kind === 'bay' ? spec.bays[d.i] : spec.obstacles[d.i]
    if (d.mode === 'move') return set(d.kind, d.i, { cx: snap(x - d.dx), cy: snap(y - d.dy) })
    if (d.mode === 'rot') return set(d.kind, d.i, { theta: snapDeg(Math.atan2(y - item.cy, x - item.cx) / RAD) })
    if (d.mode === 'size') {                                   // obstacle corner: the pointer in the block's own frame
      const th = item.theta * RAD, ux = x - item.cx, uy = y - item.cy
      const a = ux * Math.cos(th) + uy * Math.sin(th), b = -ux * Math.sin(th) + uy * Math.cos(th)
      return set('obstacle', d.i, { l: Math.max(SNAP_M, snap(2 * Math.abs(a))), w: Math.max(SNAP_M, snap(2 * Math.abs(b))) })
    }
  }
  const end = () => { drag.current = null }

  // keyboard: Delete removes the selection, arrows nudge it
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !sel || (sel.kind !== 'bay' && sel.kind !== 'obstacle')) return
      const key = sel.kind === 'bay' ? 'bays' : 'obstacles'
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onChange({ ...spec, [key]: spec[key].filter((_, j) => j !== sel.i) })
        onSelect(null)
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const st = e.shiftKey ? 5 : SNAP_M, it = spec[key][sel.i]
        const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0
        const dy = e.key === 'ArrowDown' ? -st : e.key === 'ArrowUp' ? st : 0
        set(sel.kind, sel.i, { cx: it.cx + dx, cy: it.cy + dy })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const grid = useMemo(() => {
    const out = []
    for (let x = 0; x <= W + 1e-6; x += 5) out.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={H} className={x % 25 === 0 ? 'ed-grid major' : 'ed-grid'} />)
    for (let y = 0; y <= H + 1e-6; y += 5) out.push(<line key={`y${y}`} x1={0} y1={H - y} x2={W} y2={H - y} className={y % 25 === 0 ? 'ed-grid major' : 'ed-grid'} />)
    return out
  }, [W, H])

  const isSel = (kind, i) => sel && sel.kind === kind && (kind === 'start' || kind === 'yard' || sel.i === i)
  const handle = (x, y, kind, i, mode, title) => (
    <circle className={`ed-h ${mode}`} cx={x} cy={H - y} r={1.1} onPointerDown={(e) => begin(e, kind, i, mode)}><title>{title}</title></circle>
  )
  const rotHandle = (cx, cy, th, reach, kind, i) => {
    const hx = cx + Math.cos(th) * reach, hy = cy + Math.sin(th) * reach
    return (
      <g>
        <line className="ed-stick" x1={cx} y1={H - cy} x2={hx} y2={H - hy} />
        {handle(hx, hy, kind, i, 'rot', 'Drag to rotate (5° steps)')}
      </g>
    )
  }

  const [rigTr, rigTl] = rigPolys(spec.start, veh)
  const sth = spec.start[2] * RAD
  return (
    <svg ref={svg} className="editor" viewBox={vb} preserveAspectRatio="xMidYMid meet" role="application"
      aria-label="Yard editor: drag bays, obstacles and the start to move them; drag a handle to rotate or resize"
      onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerDown={() => onSelect({ kind: 'yard' })}>
      <rect className="ed-ground" x={-MARGIN} y={-MARGIN} width={W + 2 * MARGIN} height={H + 2 * MARGIN} />
      <rect className={`ed-yard ${isSel('yard') ? 'sel' : ''}`} x={0} y={0} width={W} height={H} />
      {grid}
      <text className="ed-dim" x={W / 2} y={H + 3.4} textAnchor="middle">{W} m</text>
      <text className="ed-dim" x={-2.2} y={H / 2} textAnchor="middle" transform={`rotate(-90 ${-2.2} ${H / 2})`}>{H} m</text>

      {spec.bays.map((b, i) => {
        const on = isSel('bay', i), { l } = baySize(b, veh), th = b.theta * RAD, m = mouth(b, veh)
        const poly = bayPoly(b, veh)
        // the closed sides of the bay, as painted lines: both long sides and the end away from the mouth
        const back = b.approach === 'forward' ? [poly[1], poly[2]] : [poly[3], poly[0]]
        return (
          <g key={`b${i}`} className={`ed-bay ${on ? 'sel' : ''} ${bad.has(`bay:${i}`) ? 'bad' : ''} ${hover === `bay:${i}` ? 'hot' : ''}`}>
            <polygon className="ed-bay-fill" points={pts(poly, H)} onPointerDown={(e) => begin(e, 'bay', i, 'move')}
              onPointerEnter={() => setHover(`bay:${i}`)} onPointerLeave={() => setHover(null)} />
            <polyline className="ed-bay-line" points={pts([poly[0], poly[1]], H)} />
            <polyline className="ed-bay-line" points={pts([poly[3], poly[2]], H)} />
            <polyline className="ed-bay-line" points={pts(back, H)} />
            {/* the way in: an arrow at the mouth, pointing into the bay */}
            <path className="ed-in" d={`M${m.x + Math.cos(m.dir) * 2.6},${H - (m.y + Math.sin(m.dir) * 2.6)} L${m.x + Math.cos(m.dir) * 0.6},${H - (m.y + Math.sin(m.dir) * 0.6)}`} />
            <text className="ed-num" x={b.cx} y={H - b.cy + 0.6} textAnchor="middle">{i + 1}</text>
            {on && rotHandle(b.cx, b.cy, th, l / 2 + 2.5, 'bay', i)}
          </g>
        )
      })}

      {/* obstacles above the bays, so one placed inside a bay can still be picked up */}
      {spec.obstacles.map((o, i) => {
        const th = o.theta * RAD, c = Math.cos(th), s = Math.sin(th), on = isSel('obstacle', i)
        return (
          <g key={`o${i}`} className={`ed-obs ${on ? 'sel' : ''} ${bad.has(`obstacle:${i}`) ? 'bad' : ''}`}>
            <polygon points={pts(obstaclePoly(o), H)} onPointerDown={(e) => begin(e, 'obstacle', i, 'move')}
              onPointerEnter={() => setHover(`obstacle:${i}`)} onPointerLeave={() => setHover(null)} />
            {on && rotHandle(o.cx, o.cy, th, o.l / 2 + 2.5, 'obstacle', i)}
            {on && handle(o.cx + c * o.l / 2 - s * o.w / 2, o.cy + s * o.l / 2 + c * o.w / 2, 'obstacle', i, 'size', 'Drag to resize (0.5 m steps)')}
          </g>
        )
      })}

      <g className={`ed-start ${isSel('start') ? 'sel' : ''} ${bad.has('start') ? 'bad' : ''}`}>
        <polygon className="ed-trailer" points={pts(rigTl, H)} onPointerDown={(e) => begin(e, 'start', 0, 'move')} />
        <polygon className="ed-tractor" points={pts(rigTr, H)} onPointerDown={(e) => begin(e, 'start', 0, 'move')} />
        <text className="ed-tag" x={spec.start[0]} y={H - spec.start[1] - 2.6} textAnchor="middle">start</text>
        {isSel('start') && rotHandle(spec.start[0], spec.start[1], sth, veh.L1 + veh.tractor_front + 2.5, 'start', 0)}
      </g>

      {handle(W, H, 'yard', 0, 'yard', 'Drag to resize the yard (1 m steps)')}
    </svg>
  )
}

// The band above the editor: what to do, the drawing tools, and the way on.
export function DesignBand({ onAdd, onRow, onObstacle, onDuplicate, onDelete, canEdit, onLoad, onSave, onContinue, onBack, busy, problems, blockers, label }) {
  const file = useRef(null)
  const bandRef = useRef(null)
  const bl = (blockers ?? problems).length                       // errors only (fallback: treat all as blockers)
  const warns = problems.length - bl
  useGSAP(() => {
    whenMotionOk(() => gsap.from(bandRef.current, { y: -12, opacity: 0, duration: 0.35, ease: 'power1.out' }))
  }, { scope: bandRef })
  return (
    <section className="band select design" ref={bandRef} aria-label="Define the yard">
      <div className="band-body">
        <h2>Define the yard <span className="band-sub">{label}</span></h2>
        <p className="band-note">
          Drag bays, obstacles and the start to place them; a selected item has a handle to rotate it (and an obstacle one
          to resize it). Arrow keys nudge, Delete removes.{bl ? <> <b className="warn-ink">{bl} {bl === 1 ? 'problem' : 'problems'}</b> to fix before solving.</> : null}
          {warns ? <> <span className="warn-ink">{warns} {warns === 1 ? 'note' : 'notes'}</span> (the solver still tries).</> : null}
        </p>
      </div>
      <div className="band-actions wrap">
        <div className="seg tools" role="group" aria-label="Add">
          <button onClick={() => onAdd('reverse')} title="Add a bay the truck reverses into">+ Bay (reverse in)</button>
          <button onClick={() => onAdd('forward')} title="Add a bay the truck drives into forwards">+ Bay (drive in)</button>
          <button onClick={onRow} title="Add five bays side by side">+ Row of 5</button>
          <button onClick={onObstacle} title="Add a rectangular obstacle: a wall, pillar or building">+ Obstacle</button>
        </div>
        <div className="seg tools" role="group" aria-label="Selection">
          <button onClick={onDuplicate} disabled={!canEdit} title="Copy the selected bay or obstacle">Duplicate</button>
          <button onClick={onDelete} disabled={!canEdit} title="Remove the selected bay or obstacle (Delete)">Delete</button>
        </div>
        <div className="seg tools" role="group" aria-label="File">
          <button onClick={() => file.current?.click()} title="Open a yard saved as a .json file">Open file</button>
          <button onClick={onSave} title="Save this yard as a .json file">Save file</button>
        </div>
        <input ref={file} type="file" accept=".json,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(onLoad); e.target.value = '' }} />
        <button className="btn" onClick={onBack} disabled={busy} title="Back to the home page: the yard is not kept">{I.chevL}Back</button>
        <button className="btn primary" onClick={onContinue} disabled={busy || bl > 0}
          title={bl ? 'Fix the problems listed on the right first' : 'Next: choose which bays are filled and set the vehicle'}>
          Continue{I.chevR}
        </button>
      </div>
    </section>
  )
}
