// Shared three.js materials and procedural textures for the yard. Everything is drawn on canvases at load time,
// so the scene needs no image files and looks the same offline.
import * as THREE from 'three'

// deterministic PRNG: textures are identical on every load
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  return t
}

function speckle(g, w, h, seed, dots, amount) {
  const r = rng(seed)
  for (let i = 0; i < dots; i++) {
    const v = (r() - 0.5) * amount
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v.toFixed(3)})` : `rgba(0,0,0,${(-v).toFixed(3)})`
    const s = 0.8 + r() * 1.6
    g.fillRect(r() * w, r() * h, s, s)
  }
}

// ---------- surfaces ----------

// Asphalt: one 256 px tile covers ASPHALT_TILE metres.
export const ASPHALT_TILE = 6
export function asphaltTexture(wM, hM) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#363b42'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 11, 14000, 0.3)
  }, { repeat: [wM / ASPHALT_TILE, hM / ASPHALT_TILE] })
}

// Concrete apron with expansion joints every CONCRETE_TILE metres.
export const CONCRETE_TILE = 8
export function concreteTexture(wM, hM) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#4d535b'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 5, 6000, 0.12)
    g.strokeStyle = 'rgba(0, 0, 0, 0.32)'
    g.lineWidth = 2
    g.strokeRect(1, 1, w - 2, h - 2)
  }, { repeat: [wM / CONCRETE_TILE, hM / CONCRETE_TILE] })
}

// ---------- vehicles ----------

// Trailer side panel: ribs, a bottom rail and an optional accent stripe (the rig being guided).
const sideCache = new Map()
export function trailerSideTexture(base, stripe) {
  const key = `${base}|${stripe || ''}`
  if (sideCache.has(key)) return sideCache.get(key)
  const t = canvasTexture(1024, 256, (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    for (let x = 14; x < w; x += 34) {           // vertical ribs
      g.fillStyle = 'rgba(0,0,0,0.07)'
      g.fillRect(x, 6, 3, h - 22)
      g.fillStyle = 'rgba(255,255,255,0.25)'
      g.fillRect(x + 3, 6, 1, h - 22)
    }
    g.fillStyle = 'rgba(0,0,0,0.28)'             // top and bottom rails
    g.fillRect(0, 0, w, 6)
    g.fillRect(0, h - 16, w, 16)
    if (stripe) {
      g.fillStyle = stripe
      g.fillRect(0, h * 0.58, w, h * 0.12)
    }
    speckle(g, w, h, 3, 1500, 0.05)
  })
  sideCache.set(key, t)
  return t
}

const rearCache = new Map()
export function trailerRearTexture(base) {
  if (rearCache.has(base)) return rearCache.get(base)
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.lineWidth = 6
    g.strokeRect(6, 6, w - 12, h - 12)           // door frame
    g.lineWidth = 3
    g.beginPath(); g.moveTo(w / 2, 8); g.lineTo(w / 2, h - 8); g.stroke()   // door seam
    g.fillStyle = 'rgba(0,0,0,0.45)'             // lock bars
    for (const x of [w * 0.3, w * 0.42, w * 0.58, w * 0.7]) g.fillRect(x - 3, 16, 6, h - 32)
    g.fillStyle = '#c0392b'                      // reflective strip
    g.fillRect(12, h - 30, w - 24, 10)
  })
  rearCache.set(base, t)
  return t
}

// Barrier arm: red and white bands along its length.
export function boomTexture() {
  return canvasTexture(256, 16, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f5f5f2' : '#d42a2a'
      g.fillRect((i * w) / 8, 0, w / 8 + 1, h)
    }
  })
}

// ---------- shared materials ----------

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o })

export const MAT = {
  tyre: std('#1d2024', { roughness: 0.92 }),
  hub: std('#a9aeb4', { roughness: 0.35, metalness: 0.6 }),
  chassis: std('#2a2e34', { roughness: 0.8 }),
  dark: std('#23272d', { roughness: 0.7 }),
  chrome: std('#c9ced4', { roughness: 0.25, metalness: 0.85 }),
  glass: std('#1b2430', { roughness: 0.12, metalness: 0.4 }),
  grille: std('#30353c', { roughness: 0.55, metalness: 0.3 }),
  headlight: new THREE.MeshStandardMaterial({ color: '#fff7df', emissive: '#fff1c2', emissiveIntensity: 0.6, roughness: 0.2 }),
  tail: new THREE.MeshStandardMaterial({ color: '#b91c1c', emissive: '#ef4444', emissiveIntensity: 0.35, roughness: 0.4 }),
  marker: new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#f59e0b', emissiveIntensity: 0.3, roughness: 0.4 }),
  paint: std('#dcdfd8', { roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  paintYellow: std('#caa53c', { roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  curb: std('#5f656e', { roughness: 0.9 }),
  post: std('#f2c230', { roughness: 0.6 }),
}

const cabCache = new Map()
export function cabMaterial(color) {
  if (!cabCache.has(color)) cabCache.set(color, std(color, { roughness: 0.45, metalness: 0.15 }))
  return cabCache.get(color)
}

// Six face materials of the trailer box, in BoxGeometry order: +x (nose), -x (rear doors), +y (roof), -y, +z, -z (sides).
const trailerCache = new Map()
export function trailerMaterials(base, stripe = null) {
  const key = `${base}|${stripe || ''}`
  if (trailerCache.has(key)) return trailerCache.get(key)
  const side = std('#ffffff', { map: trailerSideTexture(base, stripe), roughness: 0.6 })
  const plain = std(base, { roughness: 0.6 })
  const mats = [plain, std('#ffffff', { map: trailerRearTexture(base), roughness: 0.6 }), std(base, { roughness: 0.7 }), MAT.dark, side, side]
  trailerCache.set(key, mats)
  return mats
}

// Status fills painted into bays (translucent, drawn above the asphalt).
export function fillMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
}

// Parked rigs get varied, realistic fleet colours, fixed per bay.
export const FLEET_CABS = ['#1f3a5f', '#e7e9ec', '#7f1d1d', '#3a4350', '#14532d', '#c7ccd2', '#0f2c4c', '#5b2c1a']
export const FLEET_TRAILERS = ['#f3f4f1', '#e2e6ea', '#f4f2ec', '#d8dde3']
