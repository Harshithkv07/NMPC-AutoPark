import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Yard from './scene/Yard'
import usePlayback from './usePlayback'
import { SelectBand, SelectLegend, GuidanceBand, UnaidedBand } from './ui/Instruction'
import { HitchPanel, InputsPanel } from './ui/Instruments'
import About from './ui/About'
import ArmInset from './ui/ArmInset'
import Home from './ui/Home'
import TopBar from './ui/TopBar'
import Transport, { SPEEDS } from './ui/Transport'
import Editor, { DesignBand } from './ui/Editor'
import YardPanel from './ui/YardPanel'
import { LiveBand, LiveControls, SourceSwitch } from './ui/Live'
import { I } from './ui/icons'
import {
  loadManifest, loadLot, sampleFrames, stepIndexAt, horizonAt, fmt,
  detectLive, createLot, pollLot, fetchPlan, mergeLot, draftLot, occupiedIds, liveProgress, randomOccupancy, sameIds,
  previewLot, specOf, sameSpec, lockTurns, certifyFraction, vehicleOf,
} from './data'
import { prediction } from './derive'
import { blankYard, bayRow, bayLength, quickProblems, readSpec, sameYard, specFromLot, BAY_W } from './layoutSpec'
import useLiveRun from './useLiveRun'

// "bay 3" / "obstacle 2" / "start" from the server -> the editor's selection key
const problemKey = (item) => {
  const m = /^(bay|obstacle) (\d+)$/.exec(item)
  return m ? `${m[1]}:${Number(m[2]) - 1}` : item === 'start' ? 'start' : 'yard'
}

const DEFAULT_SPEED = 1 // real time; the library is precomputed at realistic yard speeds
const POLL_MS = 500
const shortReason = (r) => (r || '').replace('guidance not certified ', '').replace(/[()]/g, '') || 'failed a check'

function tipFor(b, editing) {
  if (editing) return b.occupied ? 'Filled. Click to make it free.' : 'Free. Click to fill it with a parked truck.'
  switch (b.status) {
    case 'ok': return 'Certified. Click to start guided parking.'
    case 'occupied': return 'Occupied'
    case 'pending': return 'Queued for the live solver. Click to start as soon as it is certified.'
    case 'solving': return 'Being planned, driven and certified. Click to start as soon as it is certified.'
    case 'deepening': return 'The first attempt did not certify, so it is being tried again: another route, or pulling forward and parking again. Click to start as soon as it is certified.'
    default: return `Not certified: ${shortReason(b.reason)}`
  }
}

export default function App() {
  const [screen, setScreen] = useState('home')     // 'home' (intro + configurations) or 'lot'
  const wantSetup = useRef(false)                  // open the next loaded library fill in the set-up step
  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState(null)
  const [layoutName, setLayoutName] = useState('cross')
  const [seedIdx, setSeedIdx] = useState(0)
  const [lot, setLot] = useState(null)              // the library fill on screen
  const [hovered, setHovered] = useState(null)
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('select')
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const [autoPause, setAutoPause] = useState(false)
  const [baseline, setBaselineState] = useState(false)
  const [view, setView] = useState('tilt')
  const [follow, setFollow] = useState(true)
  // version 2: the live solver (server.py)
  const [live, setLive] = useState(null)            // {version, workers} while the server answers, else null
  const [liveLot, setLiveLot] = useState(null)      // {id, lot, done, elapsed}: a lot being / been solved live
  const [editing, setEditing] = useState(null)      // {base, occupied: Set} while the fill is being edited
  const [waitFor, setWaitFor] = useState(null)      // a bay clicked while it was still being solved
  const [busy, setBusy] = useState(false)           // a new-lot request is on its way
  const [notice, setNotice] = useState(null)        // {kind, text}
  const [vspec, setVspec] = useState(null)          // the rig set in the set-up step (a spec, see data.js); null = the library rig
  const [preview, setPreview] = useState(null)      // {key, lot}: the lot being set up, re-sized for that rig (unsolved)
  // version 2 design 2: drawn yards and the live NMPC
  const [design, setDesign] = useState(null)        // {spec, base: {template, seed} | null, initial} while defining the yard
  const [yard, setYard] = useState(null)            // the drawn yard of the lot on screen (a spec), null for a template lot
  const [sel, setSel] = useState(null)              // the editor's selection
  const [serverProblems, setServerProblems] = useState({ key: null, list: [] })
  const [liveMode, setLiveMode] = useState(false)   // guidance: Replay (false) or Live (true)
  const [liveKey, setLiveKey] = useState(0)         // bump to drive the bay live again

  useEffect(() => {
    loadManifest().then((m) => {
      setManifest(m)
      setLayoutName((cur) => (m.layouts.some((l) => l.name === cur) ? cur : m.layouts[0]?.name))
    }).catch((e) => setError(e.message))
    // a busy laptop can miss the first health check while the page loads: look a few times before going library-only
    let dead = false
    const look = (n) => detectLive(2500).then((h) => {
      if (dead) return
      if (h || n <= 1) setLive(h)
      else setTimeout(() => look(n - 1), 1500)
    })
    look(3)
    return () => { dead = true }
  }, [])

  // the rig: the library's unless the live solver is on and a different one was set up
  const libSpec = useMemo(() => (lot ? specOf(lot.vehicle) : null), [lot])
  const vehicleEdit = live?.vehicle || null          // {limits, jack_gap} while the live solver answers
  const rigSpec = (vehicleEdit && vspec) || libSpec
  const setRig = (spec) => setVspec(sameSpec(spec, libSpec) ? null : spec)
  const rigChanged = !!editing && !!rigSpec && !sameSpec(rigSpec, specOf(editing.base.vehicle))   // solve on continue
  const lotSource = (base) => (yard ? { custom: yard } : { layout: base.layout.name, seed: base.layout.seed })
  const previewKey = rigChanged ? JSON.stringify([lotSource(editing.base), occupiedIds(editing.base), rigSpec]) : null
  const rigVehicle = useMemo(() => (lot && rigSpec ? vehicleOf(rigSpec, lot.vehicle) : null), [lot, rigSpec])
  const draftBase = editing && (rigChanged && preview?.key === previewKey ? preview.lot : editing.base)

  // what is on screen: the fill being edited, else the live lot, else the library fill
  const shown = useMemo(() => (editing ? draftLot(draftBase, editing.occupied) : liveLot ? liveLot.lot : lot),
    [editing, draftBase, liveLot, lot])
  const shownRef = useRef(shown)
  shownRef.current = shown

  // while setting up with a different rig, show the lot re-sized for it (bays, aisle, parked trucks)
  useEffect(() => {
    if (!previewKey || preview?.key === previewKey) return
    const [src, occupied, vehicle] = JSON.parse(previewKey)
    let dead = false
    const timer = setTimeout(() => {
      previewLot({ ...src, occupied, vehicle })
        .then((r) => { if (!dead) setPreview({ key: previewKey, lot: r.lot }) })
        .catch(() => {})                              // keep showing the current geometry; the solve reports errors
    }, 150)
    return () => { dead = true; clearTimeout(timer) }
  }, [previewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const entry = useMemo(() => manifest?.layouts.find((l) => l.name === layoutName), [manifest, layoutName])
  const plan = shown && selected != null ? shown.plans[String(selected)] : null
  const steps = plan && !baseline ? plan.steps : []
  const runFrames = plan ? (baseline ? plan.baseline.frames : plan.frames) : null
  const runDuration = plan ? (baseline ? plan.baseline.duration : plan.duration) : 0
  const pb = usePlayback({ duration: runDuration, steps, speed, autoPause })
  const pbRef = useRef(pb)
  pbRef.current = pb

  const resetView = () => { setSelected(null); setMode('select'); setBaselineState(false); setWaitFor(null); pb.seek(0) }
  const toLibrary = () => { setLiveLot(null); setEditing(null); resetView() }
  const goHome = () => { setScreen('home'); setDesign(null); setYard(null); setSel(null); toLibrary() }
  // The set-up step opens on an empty lot and the user parks the trucks; without the live solver the fill cannot be
  // changed, so it shows the library fill.
  const setupStart = (d) => (live ? new Set() : new Set(occupiedIds(d)))

  useEffect(() => {
    if (!entry) return
    const seed = entry.seeds[seedIdx % entry.seeds.length]
    let dead = false
    loadLot(seed.file).then((d) => {
      if (dead) return
      setLot(d); setSelected(null); setMode('select'); setBaselineState(false); pb.seek(0)
      if (wantSetup.current) { wantSetup.current = false; const s = setupStart(d); setEditing({ base: d, start: s, occupied: s }) }
    }).catch((e) => setError(e.message))
    return () => { dead = true }
  }, [entry, seedIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = useCallback((id) => {
    const b = shownRef.current?.layout.bays[id]
    if (b && (b.status === 'pending' || b.status === 'solving' || b.status === 'deepening')) { setWaitFor(id); return }   // start it once certified
    setWaitFor(null); setSelected(id); setMode('guide'); setBaselineState(false); setHovered(null); setLiveMode(false); pb.restart()
  }, [pb.restart]) // eslint-disable-line react-hooks/exhaustive-deps
  const setBaseline = (b) => { if (b !== baseline) { setBaselineState(b); pb.restart() } }
  const nSeeds = entry?.seeds.length || 1
  const stepSeed = (d) => {
    const setup = !!editing                        // stepping fills during set-up stays in set-up
    toLibrary()
    if (setup) wantSetup.current = true
    setSeedIdx((i) => (i + d + nSeeds) % nSeeds)
  }
  // Open a configuration: its first library fill, in the set-up step (which bays are free and which are filled).
  const enterLot = (name) => {
    setScreen('lot'); toLibrary(); setHovered(null)
    if (lot && lot.layout.name === name && layoutName === name && seedIdx % nSeeds === 0) {
      const s = setupStart(lot)
      setEditing({ base: lot, start: s, occupied: s })
    } else {
      wantSetup.current = true; setLayoutName(name); setSeedIdx(0)
    }
  }

  // ---- version 2 design 2: define the yard ----
  const openDesign = (spec, base) => {
    setScreen('lot'); setLiveLot(null); setEditing(null); resetView(); setHovered(null)
    setDesign({ spec, base, initial: spec }); setSel(null); setServerProblems({ key: null, list: [] }); setNotice(null)
  }
  // a template opens in the editor as drawn; offline (no server to solve a drawing) it opens the library fill as before
  const chooseTemplate = (name) => {
    if (!live) return enterLot(name)
    previewLot({ layout: name, seed: 0, ...rigField() })
      .then((r) => openDesign(specFromLot(r.lot), { template: name, seed: 0 }))
      .catch(() => enterLot(name))
  }
  const drawYard = () => openDesign(blankYard(rigVehicle || lot.vehicle), null)
  const loadYard = (spec) => openDesign(spec, null)
  const setSpec = (spec) => setDesign((d) => d && { ...d, spec })
  const quick = useMemo(() => (design && rigVehicle ? quickProblems(design.spec, rigVehicle) : []), [design, rigVehicle])
  // checks that need the collision map (run-in room, a clear start) come from the server, once the quick ones pass
  const designKey = design && !quick.length ? JSON.stringify([design.spec, vspec]) : null
  useEffect(() => {
    if (!designKey || serverProblems.key === designKey) return
    let dead = false
    const timer = setTimeout(() => {
      previewLot({ custom: design.spec, ...rigField() })
        .then((r) => { if (!dead) setServerProblems({ key: designKey, list: r.problems.map((p) => ({ ...p, severity: p.severity ?? 'error', key: problemKey(p.item) })) }) })
        .catch((e) => { if (!dead) setServerProblems({ key: designKey, list: [{ key: 'yard', item: 'yard', message: e.message, severity: 'error' }] }) })
    }, 250)
    return () => { dead = true; clearTimeout(timer) }
  }, [designKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const problems = quick.length ? quick : serverProblems.key === designKey ? serverProblems.list : []
  // Only "error" severity blocks the solver; "warn" entries (e.g. a tight run-in in front of a bay)
  // are shown but the Plan button stays enabled — the live solver still tries those bays.
  const blockers = useMemo(() => problems.filter((p) => (p.severity ?? 'error') === 'error'), [problems])
  const badKeys = useMemo(() => new Set(blockers.map((p) => p.key)), [blockers])
  const addItem = (kind, approach) => {
    const sp = design.spec, cx = sp.size.w / 2, cy = sp.size.h / 2
    if (kind === 'obstacle') {
      setSpec({ ...sp, obstacles: [...sp.obstacles, { cx, cy, w: 4, l: 8, theta: 0 }] })
      setSel({ kind: 'obstacle', i: sp.obstacles.length })
    } else {
      const L = bayLength(rigVehicle)
      const bays = kind === 'row' ? bayRow({ x: cx - 2 * BAY_W, y: Math.min(sp.size.h - L / 2 - 1, cy), theta: -90, n: 5, approach: "reverse" })
        : [{ cx, cy, theta: -90, approach }]
      setSpec({ ...sp, bays: [...sp.bays, ...bays] })
      setSel({ kind: 'bay', i: sp.bays.length })
    }
  }
  const dupItem = () => {
    if (!sel || (sel.kind !== 'bay' && sel.kind !== 'obstacle')) return
    const sp = design.spec, key = sel.kind === 'bay' ? 'bays' : 'obstacles', it = sp[key][sel.i]
    const a = it.theta * Math.PI / 180, step = sel.kind === 'bay' ? (it.w ?? BAY_W) : it.w + 1
    const copy = { ...it, cx: Math.round((it.cx - Math.sin(a) * step) * 100) / 100, cy: Math.round((it.cy + Math.cos(a) * step) * 100) / 100 }
    setSpec({ ...sp, [key]: [...sp[key], copy] })
    setSel({ kind: sel.kind, i: sp[key].length })
  }
  const delItem = () => {
    if (!sel || (sel.kind !== 'bay' && sel.kind !== 'obstacle')) return
    const key = sel.kind === 'bay' ? 'bays' : 'obstacles'
    setSpec({ ...design.spec, [key]: design.spec[key].filter((_, j) => j !== sel.i) })
    setSel(null)
  }
  const saveYard = () => {
    const blob = new Blob([JSON.stringify(design.spec, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(design.spec.label || 'yard').replace(/[^\w.-]+/g, '_')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const openYardFile = (text) => {
    try { const spec = readSpec(text); setDesign({ spec, base: null, initial: spec }); setSel(null) }
    catch (e) { setNotice({ kind: 'danger', text: `Could not open that file: ${e.message}` }) }
  }
  // Continue: an untouched template is solved as the template (library fills, entry road); anything drawn is solved as drawn
  const designContinue = () => {
    const d = design
    if (d.base && sameYard(d.spec, d.initial)) { setYard(null); setDesign(null); enterLot(d.base.template); return }
    setBusy(true)
    previewLot({ custom: d.spec, ...rigField() })
      .then((r) => {
        const list = r.problems.map((p) => ({ ...p, severity: p.severity ?? 'error', key: problemKey(p.item) }))
        if (list.some((p) => p.severity === 'error')) { setServerProblems({ key: designKey, list }); return }
        setYard(d.spec); setDesign(null)
        setEditing({ base: r.lot, start: new Set(), occupied: new Set() })
      })
      .catch((e) => setNotice({ kind: 'danger', text: `The live solver did not answer (${e.message}).` }))
      .finally(() => setBusy(false))
  }
  // back from the set-up step to the editor, with the yard as it is
  const editLayout = () => {
    const base = editing ? editing.base : shownRef.current
    if (!base) return
    if (yard) openDesign(yard, null)
    else { const spec = specFromLot(base); openDesign(spec, { template: base.layout.name, seed: base.layout.seed }) }
  }

  // ---- version 2: live lots ----
  const startLive = async (spec) => {
    setBusy(true); setNotice(null)
    try {
      const r = await createLot(spec)
      setEditing(null); resetView()
      setLiveLot({ id: r.lot_id, lot: r.lot, done: false, elapsed: 0 })
    } catch (e) {
      if (e.problems) setNotice({ kind: 'danger', text: `This yard cannot be solved: ${e.message}` })
      else {
        setNotice({ kind: 'danger', text: `The live solver did not answer (${e.message}). The library fills still work.` })
        detectLive().then(setLive)
      }
    } finally {
      setBusy(false)
    }
  }
  const rigField = () => (vehicleEdit && vspec ? { vehicle: vspec } : {})
  const newRandomLot = () => startLive(yard ? { custom: yard, occupied: randomOccupancy(shownRef.current), ...rigField() }
    : { layout: layoutName, ...rigField() })
  const startEdit = () => {
    const base = shownRef.current
    if (!base) return
    resetView()
    const s = new Set(occupiedIds(base))
    setEditing({ base, start: s, occupied: s })
  }
  const toggleBay = (id) => {
    if (!live) {
      setNotice({ kind: 'info', text: 'Changing the fill needs the live solver (start v2/run_demo.bat). Random fill steps through the pre-solved fills.' })
      return
    }
    setEditing((e) => {
      const occupied = new Set(e.occupied)
      if (occupied.has(id)) occupied.delete(id)
      else occupied.add(id)
      return { ...e, occupied }
    })
  }
  const randomFill = () => {
    if (!live) { stepSeed(1); return }             // offline: the next pre-solved library fill
    setEditing((e) => e && { ...e, occupied: new Set(randomOccupancy(e.base)) })
  }
  const resetFill = () => setEditing((e) => e && { ...e, occupied: e.start })
  const changed = !!editing && (rigChanged || !sameIds(editing.occupied, occupiedIds(editing.base)))   // not solved yet: solve on continue
  const dirty = !!editing && !sameIds(editing.occupied, editing.start)                // moved since set-up began: can reset
  const solveEdit = () => startLive({ ...lotSource(editing.base),
    occupied: [...editing.occupied].sort((a, b) => a - b), ...rigField() })
  // Continue from set-up: an unchanged fill is already solved (library or live); a changed one is solved live first.
  const continueSetup = () => {
    if (!editing) return
    if (changed) solveEdit()
    else setEditing(null)
  }

  // poll the live lot until every free bay has a verdict, fetching each certified plan once
  const liveRef = useRef(liveLot)
  liveRef.current = liveLot
  // when each bay of the live lot entered its current state (lot seconds), for the progress bar
  const since = useRef({ id: null, bays: {} })
  useEffect(() => {
    if (!liveLot) return
    if (since.current.id !== liveLot.id) since.current = { id: liveLot.id, bays: {} }
    const m = since.current.bays
    for (const b of liveLot.lot.layout.bays) if (m[b.id]?.[0] !== b.status) m[b.id] = [b.status, liveLot.elapsed]
  }, [liveLot])
  useEffect(() => {
    if (!liveLot || liveLot.done) return
    const id = liveLot.id
    let dead = false, timer = null
    const tick = async () => {
      try {
        const st = await pollLot(id)
        const cur = liveRef.current
        if (dead || !cur || cur.id !== id) return
        const need = st.bays.filter((b) => b.status === 'ok' && !cur.lot.plans[String(b.id)])
        const plans = {}
        await Promise.all(need.map(async (b) => { plans[b.id] = await fetchPlan(id, b.id) }))
        if (dead) return
        setLiveLot((c) => (c && c.id === id ? { ...c, lot: mergeLot(c.lot, st.bays, plans), done: st.done, elapsed: st.elapsed } : c))
        if (!st.done) timer = setTimeout(tick, POLL_MS)
      } catch {
        if (dead) return
        setLive(null)
        setNotice({ kind: 'danger', text: 'Lost the live solver (was the server stopped?). Bays not yet certified cannot be driven; the library fills still work.' })
        setLiveLot((c) => {
          if (!c || c.id !== id) return c
          const lost = c.lot.layout.bays.filter((b) => b.status === 'pending' || b.status === 'solving' || b.status === 'deepening')
            .map((b) => ({ id: b.id, status: 'infeasible', reason: 'live solver stopped' }))
          return { ...c, lot: mergeLot(c.lot, lost), done: true, lost: true }
        })
      }
    }
    tick()
    return () => { dead = true; clearTimeout(timer) }
  }, [liveLot?.id, liveLot?.done]) // eslint-disable-line react-hooks/exhaustive-deps

  // a bay clicked while still being solved starts as soon as it is certified
  useEffect(() => {
    if (waitFor == null || !liveLot) return
    const b = liveLot.lot.layout.bays[waitFor]
    if (b?.status === 'ok') pick(waitFor)
    else if (b?.status === 'infeasible') {
      setNotice({ kind: 'info', text: `Bay ${waitFor + 1} could not be certified (${shortReason(b.reason)}). Choose another green bay.` })
      setWaitFor(null)
    }
  }, [liveLot, waitFor, pick])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(t)
  }, [notice])

  // keyboard: space play/pause, arrows step, [ ] slower/faster
  useEffect(() => {
    if (mode !== 'guide') return
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const p = pbRef.current
      if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); p.toggle() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? p.seek(p.t + 5) : p.nextStep() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? p.seek(p.t - 5) : p.prevStep() }
      else if (e.key === ']') setSpeed((s) => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + 1)])
      else if (e.key === '[') setSpeed((s) => SPEEDS[Math.max(0, SPEEDS.indexOf(s) - 1)])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const canLive = !!liveLot && !liveLot.lost && !!live
  const liveOn = mode === 'guide' && !!plan && liveMode && canLive
  const lr = useLiveRun({ lotId: liveLot?.id, bay: selected, controller: baseline ? 'naive' : 'nmpc', active: liveOn, key: liveKey })
  const liveFrames = liveOn ? (lr.run.frames.length ? lr.run.frames : [runFrames[0]]) : null
  const shownFrames = liveOn ? liveFrames : runFrames
  const tNow = liveOn ? lr.t : pb.t, tTextNow = liveOn ? lr.tText : pb.tText
  const yardPlan = useMemo(() => (liveOn && plan ? { ...plan, frames: liveFrames, hor: lr.run.hor, baseline: { ...plan.baseline, frames: liveFrames } } : plan),
    [liveOn, plan, liveFrames, lr.run.hor])
  const setLive2 = (on) => { setLiveMode(on); if (!on) pb.restart() }
  const frame = plan && shownFrames ? sampleFrames(shownFrames, tNow) : null
  const frameText = plan && shownFrames ? sampleFrames(shownFrames, tTextNow) : null
  const cur = steps.length ? steps[stepIndexAt(steps, pb.t)] : null
  const advised = cur && cur.kind === 'drive' && pb.t < runDuration - 0.2 ? { turns: cur.turns, kmh: cur.speed_kmh } : null
  const bays = shown ? shown.layout.bays : []
  const okCount = bays.filter((b) => b.status === 'ok').length
  const free = bays.filter((b) => b.status !== 'occupied').length
  const hoveredBay = hovered != null && shown ? bays[hovered] : null
  const liveEnd = liveOn && lr.run.done && lr.run.result && lr.t >= (lr.run.frames.at(-1)?.[0] ?? 0) - 0.05 ? lr.run.result : null
  const jackknifed = liveOn ? !!liveEnd?.jackknife : baseline && plan && plan.baseline.jackknife && pb.t >= plan.baseline.duration - 0.3
  const parked = liveOn ? !!liveEnd?.parked : !baseline && plan && pb.t >= plan.duration - 0.2
  const guide = mode === 'guide' && plan && frame
  const pred = useMemo(() => (guide && !baseline ? prediction(horizonAt(yardPlan.hor, tTextNow)) : null), [guide, baseline, yardPlan, tTextNow])
  const lock = shown ? lockTurns(shown.vehicle) : 1.75
  const progress = liveLot ? { ...liveProgress(liveLot.lot), done: liveLot.done, elapsed: liveLot.elapsed, lost: !!liveLot.lost,
    frac: liveLot.done ? 1 : certifyFraction(liveLot.lot, since.current.id === liveLot.id ? since.current.bays : {}, liveLot.elapsed) } : null
  const noBar = !guide                                    // no status footer: the bar above the yard carries it all

  if (error) {
    return (
      <div className="fatal">
        <div className="panel">
          <header className="panel-h"><h3>Demo data not found</h3></header>
          <p className="prose">{error}</p>
          <p className="fine">Generate the library with <code>python -m sim.export</code>, then reload.</p>
        </div>
      </div>
    )
  }

  if (screen === 'home') {
    return (
      <div className="app home-screen">
        <Home manifest={manifest} live={live} onChoose={chooseTemplate} onDraw={drawYard} onLoad={loadYard} />
      </div>
    )
  }

  if (design && rigVehicle) {
    const canEdit = !!sel && (sel.kind === 'bay' || sel.kind === 'obstacle')
    return (
      <div className="app is-select no-bar">
        <TopBar onHome={goHome} manifest={manifest} layoutName={layoutName} live={live} crumbLabel={`${design.spec.label} · drawing`} />
        <main className="work">
          <section className="center">
            <DesignBand label={design.spec.label} problems={problems} blockers={blockers} busy={busy} canEdit={canEdit}
              onAdd={(ap) => addItem('bay', ap)} onRow={() => addItem('row')} onObstacle={() => addItem('obstacle')}
              onDuplicate={dupItem} onDelete={delItem} onLoad={openYardFile} onSave={saveYard} onContinue={designContinue} />
            <div className="stage editor-stage">
              <Editor spec={design.spec} veh={rigVehicle} sel={sel} onSelect={setSel} onChange={setSpec} bad={badKeys} />
              {notice && (
                <div className={`toast notice ${notice.kind}`} role="alert">
                  {notice.kind === 'danger' ? I.alert : I.info}<div>{notice.text}</div>
                </div>
              )}
            </div>
          </section>
          <aside className="side" aria-label="The yard">
            <YardPanel spec={design.spec} veh={rigVehicle} sel={sel} onSelect={setSel} onChange={setSpec} problems={problems} />
          </aside>
        </main>
      </div>
    )
  }

  return (
    <div className={`app ${guide ? 'is-guide' : 'is-select'} ${noBar ? 'no-bar' : ''}`}>
      <TopBar onHome={goHome} manifest={manifest} layoutName={layoutName} live={live} />
      <main className="work">

        <section className="center">
          {guide
            ? (liveOn
              ? <LiveBand lr={lr} frame={frameText} vehicle={shown.vehicle} baseline={baseline} setBaseline={setBaseline} setLive={setLive2} />
              : baseline
              ? <UnaidedBand plan={plan} t={pb.t} frame={frame} baseline={baseline} setBaseline={setBaseline}
                  extra={canLive ? <SourceSwitch live={false} setLive={setLive2} /> : null} />
              : <GuidanceBand steps={steps} t={pb.t} duration={plan.duration} plan={plan} baseline={baseline} setBaseline={setBaseline} lock={lock}
                  extra={canLive ? <SourceSwitch live={false} setLive={setLive2} /> : null} />)
            : <SelectBand okCount={okCount} free={free} live={live} progress={progress} editing={!!editing} parked={bays.length - free}
                changed={changed} dirty={dirty} busy={busy} waitFor={waitFor} onRandom={newRandomLot} onEdit={startEdit}
                onRandomFill={randomFill} onReset={resetFill} onContinue={continueSetup} onLayout={live ? editLayout : null} />}

          <div className={`stage ${guide ? 'has-arm' : ''}`}>
            {guide && <ArmInset frame={frame} vehicle={shown.vehicle} />}
            {guide && (
              <div className="inst-overlay">
                <HitchPanel frame={frame} frameText={frameText} vehicle={shown.vehicle} pred={pred} />
                <InputsPanel frame={frame} frameText={frameText} vehicle={shown.vehicle} advised={baseline || liveOn ? null : advised} unaided={baseline}
                  note={liveOn ? (baseline ? 'live: the unaided driver steers' : 'live: the NMPC steers') : null} />
              </div>
            )}
            {shown ? (
              <Yard lot={shown} plan={yardPlan} baseline={baseline} selected={selected} hovered={hovered} onHover={setHovered} onPick={pick}
                t={tNow} mode={mode} view={view} focusRig={follow} editing={!!editing} onToggle={toggleBay} rig={!editing} />
            ) : <div className="loading">Loading yard&hellip;</div>}

            <div className="viewbar" role="group" aria-label="Camera">
              <div className="seg">
                <button aria-pressed={view === 'top'} onClick={() => setView('top')} title="Plan view">Plan</button>
                <button aria-pressed={view === 'tilt'} onClick={() => setView('tilt')} title="Tilted 3-D view">3-D</button>
              </div>
              {guide && (
                <div className="seg">
                  <button aria-pressed={follow} onClick={() => setFollow(!follow)} title="Keep the rig centred">Follow rig</button>
                </div>
              )}
            </div>

            {!guide && hoveredBay && (
              <div className="tip" role="status">
                <b>Bay {hoveredBay.id + 1}</b>
                <span>{tipFor(hoveredBay, !!editing)}</span>
              </div>
            )}

            {guide ? (
              <ul className="legend" aria-label="Legend">
                <li><i className="ln ln-path" />Planned path (Hybrid A*)</li>
                {!baseline && <li><i className="ln ln-ghost" />NMPC look-ahead: rig in 3, 6, 9 s</li>}
                {!baseline && <li><i className="ln ln-pred" />Predicted tractor and trailer axles</li>}
                <li><i className="ln ln-trail" style={baseline ? { background: 'var(--danger)' } : null} />Driven so far</li>
              </ul>
            ) : shown && <SelectLegend editing={!!editing} solving={!!(progress && !progress.done)} />}

            {jackknifed && (
              <div className="toast danger" role="alert">
                {liveOn
                  ? <>{I.alert}<div><b>Jackknife at {fmt(lr.run.frames.at(-1)?.[0], 1)} s.</b> The hitch angle passed {fmt(liveEnd.max_psi_deg, 0)}°{baseline ? ' with guidance off' : ''}.</div></>
                  : <>{I.alert}<div><b>Jackknife at {fmt(plan.baseline.t_jack, 1)} s.</b> The hitch angle passed {fmt(plan.baseline.max_psi_deg, 0)}° with guidance off.</div></>}
              </div>
            )}
            {parked && (
              <div className="toast ok" role="status">
                {liveOn
                  ? <>{I.parked}<div><b>Parked in bay {selected + 1}, live.</b> {fmt(Math.abs(liveEnd.final.lat), 2)} m off-centre, {fmt(Math.abs(liveEnd.final.hdg), 1)}° from aligned.</div></>
                  : <>{I.parked}<div><b>Parked in bay {selected + 1}.</b> {fmt(Math.abs(plan.metrics.final.lat), 2)} m off-centre, {fmt(Math.abs(plan.metrics.final.hdg), 1)}° from aligned.</div></>}
              </div>
            )}
            {guide && !liveOn && baseline && !plan.baseline.jackknife && pb.t < 3 && (
              <div className="toast info" role="status">
                {I.info}<div>Forward driving is self-stabilising, so the unaided driver also parks here. The difference appears when reversing.</div>
              </div>
            )}
            {!guide && notice && (
              <div className={`toast notice ${notice.kind}`} role="alert">
                {notice.kind === 'danger' ? I.alert : I.info}<div>{notice.text}</div>
              </div>
            )}
          </div>
        </section>

        {!guide && shown && (
          <aside className="side" aria-label="About this system">
            <About vehicle={editing ? editing.base.vehicle : shown.vehicle}
              edit={!editing ? null : vehicleEdit && rigSpec
                ? { spec: rigSpec, base: libSpec, limits: vehicleEdit.limits, gap: vehicleEdit.jack_gap, onChange: setRig }
                : { offline: true }} />
          </aside>
        )}
      </main>

      {guide && liveOn ? (
        <LiveControls lr={lr} baseline={baseline} onRestart={() => setLiveKey((k) => k + 1)} />
      ) : guide ? (
        <Transport pb={pb} duration={runDuration} steps={steps} speed={speed} setSpeed={setSpeed} autoPause={autoPause} setAutoPause={setAutoPause}
          jackAt={baseline && plan.baseline.jackknife ? plan.baseline.t_jack : null} />
      ) : null}
    </div>
  )
}
