import { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { fmt, stepIndexAt } from '../data'
import { gearOf } from '../derive'
import { I } from './icons'
import SegToggle from './SegToggle'
import { whenMotionOk } from '../motion'

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8]
const speedLabel = (s) => (s === 0.25 ? '¼' : s === 0.5 ? '½' : `${s}`)

// Scrub bar drawn as the run's steps, coloured by gear, so reverse stretches are visible at a glance.
// A native range input sits on top for pointer and keyboard scrubbing.
function Timeline({ pb, duration, steps, jackAt }) {
  const cur = steps.length ? stepIndexAt(steps, pb.t) : -1
  const pct = (v) => `${((v / duration) * 100).toFixed(3)}%`
  const segs = steps.map((s, i) => {
    const t0 = i === 0 ? 0 : s.t0
    const t1 = i + 1 < steps.length ? steps[i + 1].t0 : duration
    return { i, g: gearOf(s), left: pct(t0), width: pct(t1 - t0), wide: (t1 - t0) / duration > 0.035 }
  })
  const layer = (strong) => (
    <div className={`tl-layer ${strong ? 'strong' : ''}`} style={strong ? { clipPath: `inset(0 ${(100 - (Math.min(pb.t, duration) / duration) * 100).toFixed(3)}% 0 0)` } : null}>
      {segs.length
        ? segs.map((s) => <i key={s.i} className={`tl-seg g-${s.g} ${s.i === cur ? 'cur' : ''}`} style={{ left: s.left, width: s.width }}>{s.wide ? s.i + 1 : ''}</i>)
        : <i className="tl-seg g-U" style={{ left: 0, width: '100%' }} />}
    </div>
  )
  return (
    <div className="timeline">
      <div className="tl-track" aria-hidden="true">
        {layer(false)}
        {layer(true)}
        {jackAt != null && <i className="tl-jack" style={{ left: pct(jackAt) }} title="Jackknife" />}
      </div>
      <input className="scrub" type="range" min="0" max={duration} step="0.05" value={Math.min(pb.t, duration)}
        onChange={(e) => pb.seek(parseFloat(e.target.value))} aria-label="Timeline position (seconds)" />
    </div>
  )
}

export default function Transport({ pb, duration, steps, speed, setSpeed, autoPause, setAutoPause, jackAt }) {
  const hasSteps = steps.length > 0
  const ref = useRef(null)
  useGSAP(() => {
    whenMotionOk(() => gsap.from(ref.current, { y: 16, opacity: 0, duration: 0.35, ease: 'power1.out' }))
  }, { scope: ref })
  return (
    <footer className="bar transport" ref={ref} aria-label="Playback controls">
      <div className="tgroup">
        <button className="btn primary play" onClick={pb.toggle} aria-label={pb.playing ? 'Pause' : 'Play'} title="Play / pause (Space)">
          {pb.playing ? I.pause : I.play}<span>{pb.playing ? 'Pause' : 'Play'}</span>
        </button>
        <button className="btn icon" onClick={pb.prevStep} disabled={!hasSteps} aria-label="Previous step" title="Previous step (Left arrow)">{I.prev}</button>
        <button className="btn icon" onClick={pb.nextStep} disabled={!hasSteps} aria-label="Next step" title="Next step (Right arrow)">{I.next}</button>
        <button className="btn icon" onClick={pb.restart} aria-label="Restart" title="Restart from the gate">{I.restart}</button>
      </div>

      <Timeline pb={pb} duration={duration} steps={steps} jackAt={jackAt} />
      <span className="clock tnum" aria-label="Elapsed time"><b>{fmt(pb.t, 1)}</b> / {fmt(duration, 1)} s</span>

      <div className="tgroup">
        <span className="bar-lbl" id="speed-lbl">Speed</span>
        <SegToggle ariaLabelledBy="speed-lbl" value={speed} onChange={setSpeed}
          options={SPEEDS.map((s) => ({ value: s, label: `${speedLabel(s)}×`, title: `${s}× real time ([ and ] keys)` }))} />
      </div>
      <label className={`check ${hasSteps ? '' : 'dis'}`} title="Stop automatically at the start of every instruction">
        <input type="checkbox" checked={autoPause} onChange={(e) => setAutoPause(e.target.checked)} disabled={!hasSteps} />
        <span className="box" aria-hidden="true">{I.check}</span>
        Pause at each step
      </label>
    </footer>
  )
}
