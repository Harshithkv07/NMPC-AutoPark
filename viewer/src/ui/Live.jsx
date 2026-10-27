import { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { DEG, fmt, turnsOf, turnsText, sideOf } from '../data'
import { lastEvent } from '../liveRun'
import { Field, Gear, ModeSwitch } from './Instruction'
import { I } from './icons'
import SegToggle from './SegToggle'
import { whenMotionOk } from '../motion'

export const LIVE_SPEEDS = [0.5, 1, 2, 4]
const PUSH_DEG = 10

// Replay (the certified run, step by step) or Live (the NMPC driving now): next to Guided / Unaided on both bands.
export function SourceSwitch({ live, setLive }) {
  return (
    <SegToggle ariaLabel="Replay or live" tone="source" value={live} onChange={setLive} options={[
      { value: false, label: 'Replay', title: 'Replay the certified run, step by step' },
      { value: true, label: 'Live', title: 'The controller drives now, on this laptop: push the trailer and watch it recover' },
    ]} />
  )
}

function headline(run, unaided, planning) {
  if (run.error) return 'The live run stopped with an error'
  if (run.done && run.result) {
    const r = run.result
    if (r.why === 'stopped') return 'Stopped'
    if (r.jackknife) return unaided ? 'Unaided driver: the rig jackknifes' : 'The rig jackknifed'
    if (r.parked) return r.legs > 1 ? `Parked, after pulling forward ${r.legs - 1 === 1 ? 'once' : `${r.legs - 1} times`}` : 'Parked'
    return r.why === 'no route from here' ? 'No route from here' : 'Not parked within tolerance'
  }
  if (planning) return run.frames.length ? 'Stopped to re-plan from here' : 'Planning the route'
  return unaided ? 'Unaided driver, live' : 'The NMPC is driving'
}

// The band above the yard while a run is live: what the controller is doing right now.
export function LiveBand({ lr, frame, vehicle, baseline, setBaseline, setLive }) {
  const run = lr.run
  const planning = run.state === 'planning' || run.state === 'starting'
  const done = run.done
  const v = frame ? frame[5] : 0
  const g = done && run.result?.parked ? 'P' : done && run.result?.jackknife ? '!' : Math.abs(v) < 0.04 ? 'N' : v < 0 ? 'R' : 'D'
  const turns = frame ? turnsOf(frame[6]) : 0
  const side = sideOf(turns)
  const psi = frame ? frame[4] * DEG : 0
  const ms = run.solveMs
  const replan = lastEvent(run, 'replan')
  const push = lastEvent(run, 'push')
  return (
    <section className={`band guide live ${baseline ? 'unaided' : ''}`} aria-live="polite" aria-label="Live run">
      {g === '!' ? <div className="gearbox g-X" title="Jackknifed"><b>!</b><small>Jackknife</small></div> : <Gear g={g} />}
      <div className="band-body">
        <div className="band-meta">
          <span className="live-dot" aria-hidden="true" /><span><b>Live</b> &middot; {planning ? 'planning' : done ? 'finished' : 'driving'}</span>
          {!baseline && ms?.n ? <span className="tnum" title="Time for one NMPC optimisation on this laptop, against its 250 ms control period">NMPC solve <b>{fmt(ms.last, 0)} ms</b> (mean {fmt(ms.mean, 0)}) of 250</span> : null}
          <SourceSwitch live setLive={setLive} />
          <ModeSwitch baseline={baseline} setBaseline={setBaseline} />
        </div>
        <h2>{headline(run, baseline, planning)}</h2>
        <div className="band-row">
          {done && run.result && run.result.final ? (
            <p className="band-note">
              Peak hitch angle <b className="tnum">{fmt(run.result.max_psi_deg, 0)}°</b> (limit {fmt(vehicle.psi_crit * DEG, 0)}°),
              closest approach <b className="tnum">{fmt(run.result.min_clearance, 2)} m</b>, final pose <b className="tnum">{fmt(Math.abs(run.result.final.lat), 2)} m</b> off-centre
              and <b className="tnum">{fmt(Math.abs(run.result.final.hdg), 1)}°</b> off-axis. {run.result.parked ? 'Every certification check passed.' : 'It did not pass the certification checks.'}
            </p>
          ) : run.error ? (
            <p className="band-note">{run.error}</p>
          ) : (
            <div className="fields">
              <Field k="Steering" v={side === 'straight' ? 'straight' : `${turnsText(Math.abs(turns), 99).replace(/ turns?$/, '')} ${side}`} />
              <Field k="Speed" v={`${fmt(Math.abs(v) * 3.6, 1)} km/h`} />
              <Field k="Hitch ψ" v={`${psi > 0 ? '+' : ''}${fmt(psi, 1)}°`} note={`limit ±${fmt(vehicle.psi_crit * DEG, 0)}°`} />
              <Field k={replan && !push ? 'Re-planned' : push ? 'Last push' : 'Pushes'} v={push ? `${push.dpsi_deg > 0 ? '+' : ''}${fmt(push.dpsi_deg, 0)}° at ${fmt(push.t, 0)} s` : replan ? `at ${fmt(replan.t, 0)} s` : 'none yet'} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// Bottom bar while live: stop / run again, speed, and the push that shows the controller fighting back.
export function LiveControls({ lr, onRestart, baseline }) {
  const run = lr.run
  const t = lr.t
  const going = !run.done && !lr.failed
  const ref = useRef(null)
  useGSAP(() => {
    whenMotionOk(() => gsap.from(ref.current, { y: 16, opacity: 0, duration: 0.35, ease: 'power1.out' }))
  }, { scope: ref })
  return (
    <footer className="bar transport live-bar" ref={ref} aria-label="Live controls">
      {going
        ? <button className="btn play" onClick={lr.stop} title="Stop the live run">{I.pause}Stop</button>
        : <button className="btn primary play" onClick={onRestart} title="Drive the bay live again from the start">{I.restart}Run again</button>}
      <span className="clock tnum" aria-label="Simulated time"><b>{fmt(t, 1)}</b> s</span>
      <div className="push" role="group" aria-label="Push the trailer">
        <span className="k">Push the trailer</span>
        <button className="btn" disabled={!going || run.state !== 'driving'} onClick={() => lr.push(-PUSH_DEG)} title={`Kick the hitch angle by −${PUSH_DEG}°`}>{I.chevL}−{PUSH_DEG}°</button>
        <button className="btn" disabled={!going || run.state !== 'driving'} onClick={() => lr.push(PUSH_DEG)} title={`Kick the hitch angle by +${PUSH_DEG}°`}>+{PUSH_DEG}°{I.chevR}</button>
        <span className="hint">{baseline ? 'no controller watches the hitch: it folds' : 'the NMPC has to catch it'}</span>
      </div>
      <div className="speeds" role="group" aria-label="Speed">
        <span className="k">Speed</span>
        <SegToggle value={lr.speed} onChange={lr.setSpeed}
          options={LIVE_SPEEDS.map((s) => ({ value: s, label: `${s === 0.5 ? '½' : s}×` }))} />
      </div>
      {lr.failed && <span className="live-err">Live solver: {lr.failed}</span>}
    </footer>
  )
}
