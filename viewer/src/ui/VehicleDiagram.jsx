import { trailerAxle } from '../data'

// Pixels per metre and the tractor rear axle's place in the 320 x 166 drawing: 17 px/m with the axle at (198, 100)
// when the rig fits that way, else scaled down and centred (long rigs).
function fitView(v, psi) {
  const tl = trailerAxle(0, 0, 0, psi, v), hw = v.width / 2
  const xs = [], ys = []
  const add = (cx, cy, th, back, front) => {
    const c = Math.cos(th), sn = Math.sin(th)
    for (const [a, b] of [[-back, -hw], [front, -hw], [front, hw], [-back, hw]]) { xs.push(cx + a * c - b * sn); ys.push(cy + a * sn + b * c) }
  }
  add(tl.x, tl.y, tl.th, v.trailer_rear, v.L2 + v.trailer_front)
  add(0, 0, 0, v.tractor_rear, v.L1 + v.tractor_front + 0.6)     // + where the centre line ends
  ys.push(-hw - 2.3)                                               // the L1 label under the tractor
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  if (198 + x0 * 17 >= 6 && 198 + x1 * 17 <= 314 && 100 - y1 * 17 >= 4 && 100 - y0 * 17 <= 162) return { s: 17, ox: 198, oy: 100 }
  const s = Math.min(17, 308 / (x1 - x0), 158 / (y1 - y0))
  return { s, ox: 160 - ((x0 + x1) / 2) * s, oy: 83 + ((y0 + y1) / 2) * s }
}

// A closed polygon, given as local points (metres, before placement) with one rounding radius per corner, drawn
// via a short quadratic curve through the corner itself. `toScreen` is a rigid transform (rotate + translate +
// uniform scale), so a corner rounded this way in local space comes out correctly rounded on screen too.
function roundedPath(pts, radii, toScreen) {
  const n = pts.length
  const d = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n]
    const inLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
    const outLen = Math.hypot(next[0] - cur[0], next[1] - cur[1])
    const r = Math.min(radii[i] ?? 0, inLen / 2, outLen / 2)
    const a = [cur[0] + (prev[0] - cur[0]) / inLen * r, cur[1] + (prev[1] - cur[1]) / inLen * r]
    const b = [cur[0] + (next[0] - cur[0]) / outLen * r, cur[1] + (next[1] - cur[1]) / outLen * r]
    const [ax, ay] = toScreen(...a), [bx, by] = toScreen(...b), [cx, cy] = toScreen(...cur)
    d.push(`${i === 0 ? 'M' : 'L'} ${ax.toFixed(1)} ${ay.toFixed(1)}`)
    d.push(`Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`)
  }
  d.push('Z')
  return d.join(' ')
}

// Top view of the rig, drawn from the real parameters, with the symbols the model uses. A rounded cab/trailer
// silhouette, real tyre shapes and a proper hitch (kingpin + plate) glyph, every dimension/angle annotation in
// one accent colour ("drafting ink") against the one warm shape -- the vehicle body itself.
export default function VehicleDiagram({ v }) {
  const psi = 24 * Math.PI / 180                 // a hitch angle, to show psi
  const delta = 22 * Math.PI / 180               // a steering angle, to show delta
  const { s, ox, oy } = fitView(v, psi)          // px per metre; tractor rear axle, heading east
  const X = (x) => ox + x * s, Y = (y) => oy - y * s
  const tl = trailerAxle(0, 0, 0, psi, v)        // trailer axle and heading in the tractor's frame
  const W = v.width, hw = W / 2

  // A rigid placement (rotate by th, move to (cx, cy) in the same metres frame, then project to screen px).
  const place = (cx, cy, th) => (lx, ly) => {
    const c = Math.cos(th), sn = Math.sin(th)
    return [X(cx + lx * c - ly * sn), Y(cy + lx * sn + ly * c)]
  }
  const body = (cx, cy, th, back, front, rNose, rRear) =>
    roundedPath([[-back, -hw], [front, -hw], [front, hw], [-back, hw]], [rRear, rNose, rNose, rRear], place(cx, cy, th))

  const hx = v.d, fx = v.L1
  const t1 = tl.th
  const off = W / 2 - 0.2                        // wheel track, each side of the centre line
  const wheel = (x, y, th, len = 1.0) => {
    const toScreen = place(x, y, th)
    const tw = 0.34                               // tyre width, metres
    const path = roundedPath(
      [[-len / 2, -tw / 2], [len / 2, -tw / 2], [len / 2, tw / 2], [-len / 2, tw / 2]],
      [tw * 0.32, tw * 0.32, tw * 0.32, tw * 0.32], toScreen)
    const [hcx, hcy] = toScreen(0, 0)
    return <g className="vd-wheel"><path d={path} /><circle cx={hcx} cy={hcy} r={Math.max(1, 0.1 * s)} /></g>
  }
  const [hxpx, hypx] = [X(hx), Y(0)]
  const plateR = Math.max(4.5, 0.32 * s)

  return (
    <svg className="vdiag" viewBox="0 0 320 166" role="img" aria-label="Tractor-trailer seen from above with wheelbase L1, trailer length L2, hitch offset d, hitch angle psi and steering angle delta">
      {/* trailer and tractor bodies: rounded corners, the tractor nose rounded more than the trailer's */}
      <path className="vd-body trailer" d={body(tl.x, tl.y, t1, v.trailer_rear, v.L2 + v.trailer_front, 0.18, 0.12)} />
      <path className="vd-body tractor" d={body(0, 0, 0, v.tractor_rear, v.L1 + v.tractor_front, 0.5, 0.18)} />

      {/* axles and wheels: a real tyre rectangle + hub per wheel */}
      {[1, -1].map((sd) => (
        <g key={sd}>
          {wheel(fx, sd * off, delta)}
          {wheel(0, sd * off, 0)}
          {wheel(tl.x - sd * off * Math.sin(t1), tl.y + sd * off * Math.cos(t1), t1)}
        </g>
      ))}

      {/* centre lines (structural guides, not measurements -- kept neutral) */}
      <line className="vd-center" x1={X(hx)} y1={Y(0)} x2={X(tl.x)} y2={Y(tl.y)} />
      <line className="vd-center" x1={X(-1.2)} y1={Y(0)} x2={X(fx + 1.4)} y2={Y(0)} />

      {/* psi: angle between the tractor axis (extended back) and the trailer axis at the hitch */}
      {(() => {
        const r = 2.4
        const a0 = Math.PI, a1 = Math.PI + t1
        const [x0, y0] = [X(hx + r * Math.cos(a0)), Y(r * Math.sin(a0))]
        const [x1, y1] = [X(hx + r * Math.cos(a1)), Y(r * Math.sin(a1))]
        return <path className="vd-psi" d={`M ${x0} ${y0} A ${r * s} ${r * s} 0 0 1 ${x1} ${y1}`} />
      })()}
      <text className="vd-t" x={X(hx - 4.5)} y={Y(0.7) + 4}>ψ</text>
      {/* delta at the front wheels */}
      <text className="vd-t" x={X(fx + 0.75)} y={Y(W / 2 + 0.45)}>δ</text>

      {/* dimensions: L1 below the tractor, d at the hitch, L2 along the trailer */}
      <g className="vd-dim">
        <line x1={X(0)} y1={Y(-hw - 0.9)} x2={X(fx)} y2={Y(-hw - 0.9)} markerStart="url(#vd-a)" markerEnd="url(#vd-a)" />
        <line x1={X(0)} y1={Y(-hw - 0.3)} x2={X(0)} y2={Y(-hw - 1.3)} />
        <line x1={X(fx)} y1={Y(-hw - 0.3)} x2={X(fx)} y2={Y(-hw - 1.3)} />
      </g>
      <text className="vd-t" x={X(fx / 2) - 7} y={Y(-hw - 2.1)}>L<tspan className="vd-s" dy="3">1</tspan></text>

      {/* the hitch: a kingpin inside a small coupling plate, the one mechanically "real" joint drawn in detail */}
      <g className="vd-hitch">
        <rect x={hxpx - plateR} y={hypx - plateR} width={plateR * 2} height={plateR * 2} rx={plateR * 0.32} />
        <circle cx={hxpx} cy={hypx} r={Math.max(1.6, 0.1 * s)} />
      </g>
      <circle className="vd-axle" cx={X(0)} cy={Y(0)} r="2.4" />
      <text className="vd-t" x={X(hx) + 5} y={Y(0.55)}>d</text>
      <text className="vd-t" x={(X(hx) + X(tl.x)) / 2 - 4} y={(Y(0) + Y(tl.y)) / 2 - 9}>L<tspan className="vd-s" dy="3">2</tspan></text>
      <circle className="vd-axle" cx={X(tl.x)} cy={Y(tl.y)} r="2.4" />

      <defs>
        <marker id="vd-a" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L6 3L0 6z" fill="var(--accent)" />
        </marker>
      </defs>
    </svg>
  )
}
