import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { trailerAxle } from '../data'
import { MAT, cabMaterial, trailerMaterials, FLEET_CABS, FLEET_TRAILERS } from './materials'

// World (x east, y north) -> three (x, up, -y). A rotation.y of `th` maps local +x to world heading th.
const P = (x, y, h = 0) => [x, h, -y]

// Unit geometries shared by every vehicle; each part is a scaled instance of one of them.
const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 28)
const R_WHEEL = 0.5

export const RIG_COLOR = '#ea580c'       // the rig being guided
const UNAIDED_COLOR = '#b91c1c'
const TRAILER_WHITE = '#f3f4f1'

function Box({ p, s, m, shadow = true }) {
  return <mesh geometry={BOX} material={m} position={p} scale={s} castShadow={shadow} receiveShadow />
}

function Cyl({ p, r, len, m, axis = 'y' }) {
  const rot = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
  return <mesh geometry={CYL} material={m} position={p} rotation={rot} scale={[r, len, r]} castShadow receiveShadow />
}

// A tyre with a hub cap on its outer face; `dual` puts two tyres side by side, as on a drive or trailer axle.
function Wheel({ x, side, dual = false, width }) {
  const w = 0.3
  const zs = dual ? [side * (width / 2 - 0.2), side * (width / 2 - 0.53)] : [side * (width / 2 - 0.22)]
  return zs.map((z, i) => (
    <group key={i} position={[x, R_WHEEL, z]}>
      <mesh geometry={CYL} material={MAT.tyre} rotation={[Math.PI / 2, 0, 0]} scale={[R_WHEEL, w, R_WHEEL]} castShadow />
      {i === 0 && <mesh geometry={CYL} material={MAT.hub} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, side * (w / 2 + 0.006)]} scale={[R_WHEEL * 0.56, 0.02, R_WHEEL * 0.56]} />}
    </group>
  ))
}

// Cab-over tractor in its own frame: origin at the rear (drive) axle, +x forward, y up.
export const Tractor = memo(function Tractor({ veh, cab }) {
  const W = veh.width
  const xf = veh.L1 + veh.tractor_front          // front bumper
  const xr = -veh.tractor_rear                   // tail
  const cabLen = 2.1
  const xc = xf - cabLen                         // back of the cab
  return (
    <group>
      {/* frame rails and the deck behind the cab */}
      <Box p={[(xr + xf) / 2 - 0.1, 0.92, 0.42]} s={[xf - xr - 0.2, 0.24, 0.16]} m={MAT.chassis} />
      <Box p={[(xr + xf) / 2 - 0.1, 0.92, -0.42]} s={[xf - xr - 0.2, 0.24, 0.16]} m={MAT.chassis} />
      <Box p={[(xr + xc) / 2, 1.09, 0]} s={[xc - xr, 0.08, W - 0.8]} m={MAT.dark} />
      <Cyl p={[veh.d, 1.18, 0]} r={0.55} len={0.1} m={MAT.chassis} />
      {/* cab, roof fairing, glass */}
      <Box p={[xc + cabLen / 2, 2.35, 0]} s={[cabLen, 2.4, W - 0.04]} m={cab} />
      <Box p={[xc + cabLen / 2 - 0.15, 3.72, 0]} s={[cabLen - 0.5, 0.34, W - 0.24]} m={cab} />
      <Box p={[xf + 0.012, 2.86, 0]} s={[0.04, 0.95, W - 0.3]} m={MAT.glass} shadow={false} />
      {[1, -1].map((sd) => (
        <group key={sd}>
          <Box p={[xf - 0.55, 2.86, sd * (W / 2 - 0.005)]} s={[0.75, 0.72, 0.03]} m={MAT.glass} shadow={false} />
          <Box p={[xf + 0.12, 2.55, sd * (W / 2 + 0.22)]} s={[0.1, 0.46, 0.08]} m={MAT.dark} />
          <Box p={[xf + 0.1, 2.75, sd * (W / 2 + 0.09)]} s={[0.05, 0.04, 0.26]} m={MAT.dark} />
          <Box p={[xf + 0.19, 0.86, sd * (W / 2 - 0.36)]} s={[0.05, 0.16, 0.42]} m={MAT.headlight} shadow={false} />
          <Cyl p={[1.75, 0.86, sd * (W / 2 - 0.26)]} r={0.28} len={1.25} m={MAT.chrome} axis="x" />
          <Box p={[0, 1.13, sd * (W / 2 - 0.36)]} s={[1.25, 0.06, 0.74]} m={MAT.dark} />
        </group>
      ))}
      <Box p={[xf + 0.02, 1.72, 0]} s={[0.04, 0.8, W - 0.7]} m={MAT.grille} shadow={false} />
      <Box p={[xf + 0.06, 0.74, 0]} s={[0.3, 0.4, W]} m={MAT.dark} />
      <Cyl p={[xc - 0.16, 2.55, W / 2 - 0.3]} r={0.08} len={2.7} m={MAT.chrome} />
      {/* steer axle single tyres, drive axle duals */}
      <Wheel x={veh.L1} side={1} width={W} />
      <Wheel x={veh.L1} side={-1} width={W} />
      <Wheel x={0} side={1} width={W} dual />
      <Wheel x={0} side={-1} width={W} dual />
    </group>
  )
})

// Box trailer in its own frame: origin at the trailer axle, +x towards the hitch.
export const Trailer = memo(function Trailer({ veh, mats }) {
  const W = veh.width
  const xf = veh.L2 + veh.trailer_front
  const xr = -veh.trailer_rear
  const len = xf - xr
  return (
    <group>
      <mesh geometry={BOX} material={mats} position={[(xf + xr) / 2, 2.625, 0]} scale={[len, 2.65, W]} castShadow receiveShadow />
      <Box p={[(xf + xr) / 2, 1.2, 0]} s={[len - 0.4, 0.2, 1.2]} m={MAT.chassis} />
      <Box p={[xr + 0.06, 0.56, 0]} s={[0.1, 0.14, W - 0.3]} m={MAT.dark} />
      {[1, -1].map((sd) => (
        <group key={sd}>
          <Box p={[xr + 0.06, 0.88, sd * 0.9]} s={[0.1, 0.6, 0.1]} m={MAT.dark} />
          <Box p={[xf - 2.0, 0.72, sd * 0.85]} s={[0.12, 1.1, 0.12]} m={MAT.dark} />
          <Box p={[xf - 2.0, 0.04, sd * 0.85]} s={[0.36, 0.06, 0.26]} m={MAT.dark} />
          <Box p={[xr - 0.012, 1.46, sd * (W / 2 - 0.22)]} s={[0.03, 0.12, 0.3]} m={MAT.tail} shadow={false} />
          {[1.2, 4.2, 7.2].map((x) => <Box key={x} p={[x, 1.42, sd * (W / 2 + 0.008)]} s={[0.2, 0.06, 0.02]} m={MAT.marker} shadow={false} />)}
          <Wheel x={-0.65} side={sd} width={W} dual />
          <Wheel x={0.65} side={sd} width={W} dual />
        </group>
      ))}
    </group>
  )
})

// A rig at state [x, y, th0, psi]: tractor rear axle at (x, y) with heading th0, hitch angle psi.
function RigAt({ state, veh, cab, trailer }) {
  const [x, y, th, psi] = state
  const tl = useMemo(() => trailerAxle(x, y, th, psi, veh), [x, y, th, psi, veh])
  return (
    <group>
      <group position={P(x, y)} rotation={[0, th, 0]}><Tractor veh={veh} cab={cab} /></group>
      <group position={P(tl.x, tl.y)} rotation={[0, tl.th, 0]}><Trailer veh={veh} mats={trailer} /></group>
    </group>
  )
}

// The rig being guided: orange cab and stripe; red when driven unaided or when the hitch angle nears the limit.
export default function Rig({ state, veh, unaided = false, alarm = false }) {
  const red = unaided || alarm
  const cab = cabMaterial(red ? UNAIDED_COLOR : RIG_COLOR)
  const trailer = trailerMaterials(TRAILER_WHITE, red ? UNAIDED_COLOR : RIG_COLOR)
  return <RigAt state={state} veh={veh} cab={cab} trailer={trailer} />
}

// A parked rig described by its footprint rectangle (centre, heading = tractor facing, length l). Fleet colours
// are fixed per bay so a lot always looks the same.
export const ParkedRig = memo(function ParkedRig({ p, veh, id = 0 }) {
  const state = useMemo(() => {
    const c = Math.cos(p.theta), s = Math.sin(p.theta)
    const a = p.l / 2 - (veh.L1 + veh.tractor_front)          // rear axle ahead of the footprint centre
    return [p.cx + a * c, p.cy + a * s, p.theta, 0]
  }, [p, veh])
  return (
    <RigAt state={state} veh={veh} cab={cabMaterial(FLEET_CABS[id % FLEET_CABS.length])}
      trailer={trailerMaterials(FLEET_TRAILERS[(id * 3 + 1) % FLEET_TRAILERS.length])} />
  )
})

// NMPC look-ahead: a translucent footprint of the rig at a predicted state, drawn flat on the asphalt.
const GHOST = '#3b82f6'
function footprint(cx, cy, th, back, front, w) {
  const c = Math.cos(th), s = Math.sin(th), hw = w / 2
  return [[-back, -hw], [front, -hw], [front, hw], [-back, hw], [-back, -hw]]
    .map(([u, v]) => P(cx + u * c - v * s, cy + u * s + v * c, 0.07))
}
export const Ghost = memo(function Ghost({ state, veh, opacity = 0.2 }) {
  const parts = useMemo(() => {
    const [x, y, th, psi] = state
    const tl = trailerAxle(x, y, th, psi, veh)
    return [
      footprint(x, y, th, veh.tractor_rear, veh.L1 + veh.tractor_front, veh.width),
      footprint(tl.x, tl.y, tl.th, veh.trailer_rear, veh.L2 + veh.trailer_front, veh.width),
    ].map((pts) => ({
      pts,
      // a flat shape in the ground plane: shape (x, y) -> three (x, 0, -y) after the -90 deg turn about x
      geo: new THREE.ShapeGeometry(new THREE.Shape(pts.slice(0, 4).map(([px, , pz]) => new THREE.Vector2(px, -pz)))),
    }))
  }, [state, veh])
  useEffect(() => () => parts.forEach((p) => p.geo.dispose()), [parts])
  return (
    <group>
      {parts.map(({ pts, geo }, i) => (
        <group key={i}>
          <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
            <meshBasicMaterial color={GHOST} transparent opacity={opacity * 0.55} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <Line points={pts} color={GHOST} lineWidth={1.4} transparent opacity={Math.min(1, opacity * 3.2)} />
        </group>
      ))}
    </group>
  )
})
