import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html, Line, OrthographicCamera } from '@react-three/drei'
import * as THREE from 'three'
import Rig, { ParkedRig, Ghost } from './Rig'
import { bayCorners, sampleFrames, trailerAxle, frameIndexAt, horizonAt } from '../data'
import { scaleLength } from '../derive'
import { MAT, asphaltTexture, concreteTexture, boomTexture, fillMaterial } from './materials'

// World (x east, y north, metres) -> three (x, up, -y).
const P = (x, y, h = 0) => [x, h, -y]
const TILT = { el: 0.98, az: -0.36 }   // 3-D view: 56 deg above the ground, looking from the south-south-west
const ROAD_W = 12                      // entry road
const ROAD_LEN = 70

// ---------- camera ----------

// Orthographic camera: the whole lot fitted to the stage (or following the rig), in plan or in the 3-D view.
// Reports pixels per metre in plan view so the stage can carry a true scale bar.
// The part of the lot worth framing: every bay and the rig at the gate, plus a margin (the paved area is larger).
function interest(layout) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  for (const b of layout.bays) for (const [x, y] of bayCorners(b)) add(x, y)
  const [sx, sy, sth] = layout.start, c = Math.cos(sth), sn = Math.sin(sth)     // the rig at the start, any heading
  for (const [a, d] of [[6, 0], [-11, 2], [-11, -2]]) add(sx + a * c - d * sn, sy + a * sn + d * c)
  for (const o of layout.blocks || []) add(o.cx, o.cy)
  const m = 5, b = layout.bounds
  return { xmin: Math.max(b.xmin, x0 - m), xmax: Math.min(b.xmax, x1 + m), ymin: Math.max(b.ymin, y0 - m), ymax: Math.min(b.ymax, y1 + m) }
}

// `angle` ({el, az}) overrides the 3-D view's direction; `padLeft` keeps that fraction of the width clear (text over
// the canvas) and fits the lot into the rest.
function Camera({ bounds, focus, view, onScale, angle = null, padLeft = 0 }) {
  const { size, invalidate } = useThree()
  const ref = useRef()
  useEffect(() => {
    const cam = ref.current
    if (!cam || !size.width || !size.height) return
    const top = view !== 'tilt'
    const b = bounds
    const wide = (b.xmax - b.xmin) / (b.ymax - b.ymin) > 2.2      // parallel and tandem lots: look along them, not across
    const el = top ? Math.PI / 2 - 1e-6 : angle ? angle.el : TILT.el
    const az = top ? 0 : angle ? angle.az : wide ? -0.1 : TILT.az
    const [fx, fy] = focus || [(b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2]
    const D = 600
    if (top) cam.up.set(0, 0, -1)
    else cam.up.set(0, 1, 0)
    cam.position.set(fx + D * Math.cos(el) * Math.sin(az), D * Math.sin(el), -fy + D * Math.cos(el) * Math.cos(az))
    cam.lookAt(fx, 0, -fy)
    cam.updateMatrixWorld()
    let zoom
    if (focus) {
      zoom = Math.min(size.width / 44, size.height / 28)        // following the rig: close enough to read the vehicles
    } else {
      // fit the lot's corners (on the ground and at truck height) in view space, then centre them
      const inv = cam.matrixWorldInverse
      const v = new THREE.Vector3()
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const [x, y] of [[b.xmin, b.ymin], [b.xmax, b.ymin], [b.xmax, b.ymax], [b.xmin, b.ymax]]) {
        for (const h of [0, 4]) {
          v.set(x, h, -y).applyMatrix4(inv)
          x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
        }
      }
      zoom = Math.min((size.width * (1 - padLeft)) / (x1 - x0), size.height / (y1 - y0)) * (top ? 0.93 : 0.99)
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
      cam.position.addScaledVector(right, (x0 + x1) / 2 - (size.width * padLeft) / 2 / zoom).addScaledVector(up, (y0 + y1) / 2)
      cam.updateMatrixWorld()
    }
    cam.zoom = zoom
    cam.updateProjectionMatrix()
    onScale(top ? zoom : null)
    invalidate()                     // the canvas renders on demand while a bay is being chosen
  }, [bounds, size, view, focus, onScale, invalidate, angle, padLeft])
  return <OrthographicCamera ref={ref} makeDefault near={-2000} far={4000} />
}

// ---------- light ----------

function Sun({ bounds }) {
  const b = bounds
  const cx = (b.xmin + b.xmax) / 2, cy = (b.ymin + b.ymax) / 2
  const half = Math.max(b.xmax - b.xmin, b.ymax - b.ymin) / 2 + 30
  const target = useMemo(() => { const o = new THREE.Object3D(); o.position.set(cx, 0, -cy); return o }, [cx, cy])
  return (
    <>
      <primitive object={target} />
      <hemisphereLight args={['#dfe6ef', '#2e3034', 1.7]} />
      <directionalLight target={target} position={[cx + 30, 120, -cy + 38]} intensity={2.05} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.04}
        shadow-camera-left={-half} shadow-camera-right={half} shadow-camera-top={half} shadow-camera-bottom={-half}
        shadow-camera-near={1} shadow-camera-far={500} />
    </>
  )
}

// ---------- ground and paint ----------

// Quads for painted lines in the ground plane: one mesh for every line of one colour.
function paintGeometry(segs, width) {
  const pos = [], nrm = [], idx = []
  segs.forEach(([x0, y0, x1, y1], i) => {
    const L = Math.hypot(x1 - x0, y1 - y0) || 1
    const nx = (-(y1 - y0) / L) * width / 2, ny = ((x1 - x0) / L) * width / 2
    for (const [x, y] of [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]) {
      pos.push(x, 0.012, -y)
      nrm.push(0, 1, 0)
    }
    const k = i * 4
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3)
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setIndex(idx)
  return g
}

function dashes(x0, x1, y, dash = 3, gap = 3) {
  const out = []
  for (let x = x0; x + dash <= x1; x += dash + gap) out.push([x, y, x + dash, y])
  return out
}

const Ground = memo(function Ground({ layout }) {
  const b = layout.bounds
  const w = b.xmax - b.xmin, h = b.ymax - b.ymin
  const cx = (b.xmin + b.xmax) / 2, cy = (b.ymin + b.ymax) / 2
  const APRON = 800
  const tex = useMemo(() => ({ asphalt: asphaltTexture(w, h), road: asphaltTexture(ROAD_LEN, ROAD_W), concrete: concreteTexture(APRON, APRON) }), [w, h])
  useEffect(() => () => Object.values(tex).forEach((t) => t.dispose()), [tex])
  const drawn = !!layout.drawn                    // a yard drawn in the editor: closed all round, no entry road
  const curb = useMemo(() => {
    const t = 0.35, gap = ROAD_W / 2
    return [
      [cx, b.ymax + t / 2, w + 2 * t, t], [cx, b.ymin - t / 2, w + 2 * t, t],
      [b.xmax + t / 2, cy, t, h],
      ...(drawn ? [[b.xmin - t / 2, cy, t, h]]
        : [[b.xmin - t / 2, (b.ymax + gap) / 2, t, b.ymax - gap], [b.xmin - t / 2, (b.ymin - gap) / 2, t, -gap - b.ymin]]),
    ]
  }, [b, w, h, cx, cy, drawn])
  return (
    <group>
      <mesh position={P(cx, cy, -0.04)} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[APRON, APRON]} />
        <meshStandardMaterial map={tex.concrete} roughness={0.95} />
      </mesh>
      <mesh position={P(cx, cy, 0)} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex.asphalt} roughness={0.9} />
      </mesh>
      {!drawn && (
        <mesh position={P(b.xmin - ROAD_LEN / 2, 0, 0)} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[ROAD_LEN, ROAD_W]} />
          <meshStandardMaterial map={tex.road} roughness={0.9} />
        </mesh>
      )}
      {curb.map(([x, y, sx, sy], i) => (
        <mesh key={i} position={P(x, y, 0.07)} scale={[sx, 0.14, sy]} material={MAT.curb} receiveShadow>
          <boxGeometry />
        </mesh>
      ))}
    </group>
  )
})

// White bay lines (open at the mouth), the yellow aisle centre line and an entry arrow.
const Markings = memo(function Markings({ layout }) {
  const geo = useMemo(() => {
    const white = [], yellow = []
    for (const bay of layout.bays) {
      const c = bayCorners(bay)
      const seg = (a, z) => white.push([c[a][0], c[a][1], c[z][0], c[z][1]])
      seg(0, 1); seg(3, 2)                                    // the two long sides
      if (bay.approach === 'reverse') seg(3, 0)               // closed end: the back of a reverse bay
      else seg(1, 2)                                          // forward (tandem) slots: closed at the far end
    }
    const b = layout.bounds
    if (layout.drawn) {
      // the start box: where the rig waits, and an arrow the way it faces
      const [sx, sy, th] = layout.start, c = Math.cos(th), sn = Math.sin(th)
      const pt = (a, d) => [sx + a * c - d * sn, sy + a * sn + d * c]
      const box = [pt(-11, -1.8), pt(6.5, -1.8), pt(6.5, 1.8), pt(-11, 1.8)]
      for (let i = 0; i < 4; i++) yellow.push([...box[i], ...box[(i + 1) % 4]])
      const [a0, a1, h1, h2] = [pt(8, 0), pt(12, 0), pt(10.8, 1), pt(10.8, -1)]
      white.push([...a0, ...a1], [...a1, ...h1], [...a1, ...h2])
    } else {
      yellow.push(...dashes(b.xmin + 3, b.xmax - 3, 0), ...dashes(b.xmin - ROAD_LEN + 2, b.xmin - 2, 0))
      const ax = layout.start[0] + 9                          // entry arrow, pointing into the yard
      white.push([ax, 0 - 3.2, ax + 5, -3.2], [ax + 5, -3.2, ax + 3.6, -2.2], [ax + 5, -3.2, ax + 3.6, -4.2])
    }
    return { white: paintGeometry(white, 0.16), yellow: paintGeometry(yellow, 0.14) }
  }, [layout])
  useEffect(() => () => { geo.white.dispose(); geo.yellow.dispose() }, [geo])
  return (
    <group>
      <mesh geometry={geo.white} material={MAT.paint} receiveShadow />
      <mesh geometry={geo.yellow} material={MAT.paintYellow} receiveShadow />
    </group>
  )
})

// Entry gate on the approach road, just outside the lot (the planner never drives there): a raised red-and-white
// boom on a yellow post, and a small gatehouse.
const Gate = memo(function Gate({ x }) {
  const boom = useMemo(() => new THREE.MeshStandardMaterial({ map: boomTexture(), roughness: 0.5 }), [])
  return (
    <group>
      <group position={P(x, ROAD_W / 2 + 0.5)}>
        <mesh position={[0, 0.6, 0]} scale={[0.45, 1.2, 0.45]} material={MAT.post} castShadow><boxGeometry /></mesh>
        <group position={[0, 1.05, 0]} rotation={[-1.22, 0, 0]}>
          <mesh position={[0, 0, 3.6]} scale={[0.14, 0.14, 7.2]} material={boom} castShadow><boxGeometry /></mesh>
        </group>
      </group>
      <group position={P(x - 3, -(ROAD_W / 2 + 2.4))}>
        <mesh position={[0, 1.35, 0]} scale={[2.6, 2.7, 2.6]} material={MAT.curb} castShadow receiveShadow><boxGeometry /></mesh>
        <mesh position={[0, 2.84, 0]} scale={[3.0, 0.18, 3.0]} material={MAT.dark} castShadow><boxGeometry /></mesh>
        <mesh position={[0.75, 1.75, -1.31]} scale={[1.0, 0.8, 0.04]} material={MAT.glass}><boxGeometry /></mesh>
      </group>
    </group>
  )
})

// Obstacles of a drawn yard (walls, pillars, buildings): concrete blocks of the drawn footprint, 2.4 m tall.
const BLOCK_H = 2.4
const Blocks = memo(function Blocks({ blocks }) {
  return (
    <group>
      {blocks.map((o, i) => (
        <mesh key={i} position={P(o.cx, o.cy, BLOCK_H / 2)} rotation={[0, o.theta, 0]} scale={[o.l, BLOCK_H, o.w]}
          material={MAT.curb} castShadow receiveShadow>
          <boxGeometry />
        </mesh>
      ))}
    </group>
  )
})

// ---------- bays ----------

const pointer = (on) => { document.body.style.cursor = on ? 'pointer' : '' }

// Status colours painted into the bays (on dark asphalt) and the matching outline.
const LOOK = {
  sel: { fill: '#3b82f6', a: 0.34, line: '#93c5fd', w: 3 },
  ok: { fill: '#22c55e', a: 0.2, hot: 0.36, line: '#4ade80', w: 2.2 },
  pend: { fill: '#3b82f6', a: 0.14, hot: 0.26, line: '#60a5fa', w: 1.6, dash: true },
  bad: { fill: '#94a3b8', a: 0.08, hot: 0.14, line: '#94a3b8', w: 1.2, dash: true },
  draft: { fill: '#ffffff', a: 0.05, hot: 0.16, line: '#e2e8f0', w: 1.2 },
  occ: { fill: '#ffffff', a: 0.001, hot: 0.12, line: null },
}

const Bay = memo(function Bay({ bay, selected, hovered, onHover, onPick, live, editing, onToggle }) {
  const st = bay.status
  const ok = st === 'ok', bad = st === 'infeasible', pend = st === 'pending' || st === 'solving' || st === 'deepening', draft = st === 'draft'
  const key = selected ? 'sel' : ok ? 'ok' : pend ? 'pend' : bad ? 'bad' : draft ? 'draft' : 'occ'
  const look = LOOK[key]
  const clickable = editing || (live && (ok || pend))
  const hot = hovered && clickable
  const inset = useMemo(() => bayCorners({ ...bay, l: bay.l - 0.8, w: bay.w - 0.7 }).map(([x, y]) => P(x, y, 0.03)), [bay])
  const mat = useMemo(() => fillMaterial(look.fill, hot && look.hot ? look.hot : look.a), [look, hot])
  useEffect(() => () => mat.dispose(), [mat])
  const showFill = key !== 'occ' || editing
  return (
    <group>
      {showFill && (
        <mesh position={P(bay.cx, bay.cy, 0.02)} rotation={[-Math.PI / 2, 0, bay.theta]} material={mat}
          onPointerOver={(e) => { e.stopPropagation(); if (live || editing) { onHover(bay.id); pointer(clickable) } }}
          onPointerOut={() => { onHover(null); pointer(false) }}
          onClick={(e) => {
            e.stopPropagation()
            if (editing) onToggle(bay.id)
            else if (live && (ok || pend)) { pointer(false); onPick(bay.id) }
          }}>
          <planeGeometry args={[bay.l - 0.3, bay.w - 0.3]} />
        </mesh>
      )}
      {look.line && (
        <Line points={inset} color={look.line} lineWidth={hot ? look.w + 1 : look.w} dashed={!!look.dash} dashSize={0.9} gapSize={0.6} />
      )}
      <Html position={P(bay.cx + Math.cos(bay.theta) * (bay.l / 2 - 1.8), bay.cy + Math.sin(bay.theta) * (bay.l / 2 - 1.8), 0.2)}
        center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`bay-tag ${key}`}>{bay.id + 1}</div>
      </Html>
    </group>
  )
})

// ---------- guidance overlays ----------

// Keyed on the frame index (4 Hz samples), not on the 60 Hz clock, so geometry is rebuilt only on a new sample.
function Overlays({ plan, frames, veh, t, guided }) {
  const idx = frameIndexAt(frames, t)
  const pathPts = useMemo(() => plan.path.map(([x, y]) => P(x, y, 0.05)), [plan])
  const trail = useMemo(() => frames.slice(0, idx + 1).map((f) => P(f[1], f[2], 0.08)), [frames, idx])
  const hor = guided ? horizonAt(plan.hor, frames[idx][0]) : null
  const horTr = useMemo(() => (hor ? hor[1].map(([x, y]) => P(x, y, 0.1)) : []), [hor])
  const horTl = useMemo(() => (hor ? hor[1].map(([x, y, th, psi]) => { const a = trailerAxle(x, y, th, psi, veh); return P(a.x, a.y, 0.09) }) : []), [hor, veh])
  const ghosts = hor ? [3, 7, 11].map((i) => hor[1][i]).filter(Boolean) : []
  return (
    <group>
      {pathPts.length > 1 && <Line points={pathPts} color="#f8fafc" lineWidth={2} dashed dashSize={1.4} gapSize={1.1} transparent opacity={0.8} />}
      {trail.length > 1 && <Line points={trail} color={guided ? '#fb923c' : '#f87171'} lineWidth={3.4} />}
      {ghosts.map((s, i) => <Ghost key={i} state={s} veh={veh} opacity={0.3 - i * 0.07} />)}
      {horTl.length > 1 && <Line points={horTl} color="#93c5fd" lineWidth={3} />}
      {horTr.length > 1 && <Line points={horTr} color="#3b82f6" lineWidth={3.6} />}
    </group>
  )
}

function ScaleBar({ pxPerM }) {
  const m = scaleLength(pxPerM)
  const px = m * pxPerM
  return (
    <div className="scalebar" aria-label={`Scale bar: ${m} metres`}>
      <svg className="axes" viewBox="0 0 34 34" aria-hidden="true">
        <path d="M6 28V6M6 28h22" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M3 9l3-4 3 4M25 25l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <text x="11" y="9" fontSize="8">y</text><text x="24" y="22" fontSize="8">x</text>
      </svg>
      <div>
        <div className="sb-bar" style={{ width: px }}><i /><i /></div>
        <div className="sb-lbl" style={{ width: px }}><span>0</span><span>{m} m</span></div>
      </div>
    </div>
  )
}

const none = () => {}

// `preview`: a non-interactive yard (the home page). `frame` (bounds to fit), `angle`, `padLeft` and `frameloop`
// override the defaults for the home page's hero.
export default function Yard({ lot, plan = null, baseline = false, selected = null, hovered = null, onHover = none, onPick = none, t = 0,
  mode = 'select', view = 'tilt', focusRig = false, editing = false, onToggle = none, preview = false,
  frame: frameOverride = null, angle = null, padLeft = 0, frameloop = null, rig = true }) {
  const { layout, vehicle } = lot
  const [pxPerM, setPxPerM] = useState(null)
  const frames = mode === 'guide' && plan ? (baseline ? plan.baseline.frames : plan.frames) : null
  const state = useMemo(() => {
    const f = frames ? sampleFrames(frames, t) : null
    const s = layout.start
    return f ? [f[1], f[2], f[3], f[4]] : [s[0], s[1], s[2], s[3]]
  }, [layout, frames, t])
  const alarm = Math.abs(state[3]) > vehicle.psi_crit * 0.92
  const focus = useMemo(() => (focusRig && mode === 'guide' ? [state[0], state[1]] : null), [focusRig, mode, state])
  const frame = useMemo(() => frameOverride || interest(layout), [frameOverride, layout])
  useEffect(() => () => pointer(false), [])
  return (
    <>
      {/* nothing moves while a bay is being chosen, so render only on change: the live solver gets the CPU */}
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
        frameloop={frameloop || (mode === 'guide' ? 'always' : 'demand')} onPointerMissed={() => onHover(null)}
        aria-label="Parking yard: bays, parked trucks and the rig being guided">
        <color attach="background" args={['#30353c']} />
        <Camera bounds={frame} focus={focus} view={view} onScale={setPxPerM} angle={angle} padLeft={padLeft} />
        <Sun bounds={layout.bounds} />
        <Ground layout={layout} />
        <Markings layout={layout} />
        {!layout.drawn && <Gate x={layout.bounds.xmin - 4} />}
        {layout.blocks?.length > 0 && <Blocks blocks={layout.blocks} />}
        {layout.bays.map((b) => (
          <group key={b.id}>
            <Bay bay={b} selected={selected === b.id} hovered={hovered === b.id} onHover={onHover} onPick={onPick}
              live={!preview && mode === 'select' && !editing} editing={!preview && mode === 'select' && editing} onToggle={onToggle} />
            {b.parked && <ParkedRig p={b.parked} veh={vehicle} id={b.id} />}
          </group>
        ))}
        {frames && <Overlays plan={plan} frames={frames} veh={vehicle} t={t} guided={!baseline} />}
        {rig && <Rig state={state} veh={vehicle} unaided={baseline && mode === 'guide'} alarm={alarm} />}
      </Canvas>
      {pxPerM && !preview && <ScaleBar pxPerM={pxPerM} />}
    </>
  )
}
