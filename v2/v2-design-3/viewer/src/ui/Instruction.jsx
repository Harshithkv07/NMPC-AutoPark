import { clamp, fmt, stepIndexAt } from '../data'
import { gearOf, GEAR_NAME, steerText } from '../derive'
import { I } from './icons'
import SegToggle from './SegToggle'

export function ModeSwitch({ baseline, setBaseline }) {
  return (
    <SegToggle ariaLabel="Guidance" tone="mode" value={baseline} onChange={setBaseline} options={[
      { value: false, label: 'Guided', title: 'Follow the NMPC guidance' },
      { value: true, label: 'Unaided', title: 'Same bay, driven by an unaided driver with no hitch model', off: true },
    ]} />
  )
}

export function Field({ k, v, note, bar }) {
  return (
    <div className="field">
      <span className="k">{k}</span>
      <span className="v tnum">{v}</span>
      {bar != null ? <span className="fbar"><i style={{ transform: `scaleX(${bar})` }} /></span> : note && <span className="n">{note}</span>}
    </div>
  )
}

export const Gear = ({ g }) => (
  <div className={`gearbox g-${g}`} title={GEAR_NAME[g]}>
    <b>{g}</b><small>{GEAR_NAME[g]}</small>
  </div>
)

const OFFLINE = 'Live solving needs the version 2 server: start v2/run_demo.bat'

// The "set up the lot" step's actions: edit layout / random fill / reset / continue.
function editingActions({ offline, busy, dirty, changed, onLayout, onRandomFill, onReset, onContinue }) {
  return (
    <>
      {onLayout && <button className="btn" onClick={onLayout} disabled={busy} title="Back to the yard: move, add or remove bays and obstacles">{I.edit}Edit layout</button>}
      <button className="btn" onClick={onRandomFill} disabled={busy}
        title={offline ? 'Step through the six pre-solved library fills' : 'A random set of filled bays, which you can then adjust'}>{I.dice}Random fill</button>
      {dirty && <button className="btn" onClick={onReset} disabled={busy} title="Back to the fill you started from">Reset</button>}
      <button className="btn primary" onClick={onContinue} disabled={busy}
        title={changed ? 'Plan, drive and certify every free bay of this fill, then choose where to park' : 'Choose where to park'}>
        {changed ? 'Solve and continue' : 'Continue'}{I.chevR}
      </button>
    </>
  )
}

// Choosing a bay's actions: change fill / new random lot -- shown whether a live lot is still solving or finished.
function idleActions({ offline, busy, onEdit, onRandom }) {
  return (
    <>
      {offline && <span className="band-fine">Library fills only. Start <code>v2/run_demo.bat</code> to solve new lots.</span>}
      <button className="btn" onClick={onEdit} disabled={busy} title="Change which bays are free and which are filled">{I.edit}Change fill</button>
      <button className="btn primary" onClick={onRandom} disabled={offline || busy} title={offline ? OFFLINE : 'A new random fill of parked trucks, solved live'}>{I.dice}New random lot</button>
    </>
  )
}

// The "set up the lot" step's title/note: which bays are free and which are filled, and the vehicle.
function selectBandEditing({ offline, parked, free }) {
  const note = offline
    ? <>Library fill: <b>{parked}</b> filled, <b>{free}</b> free. <b>Random fill</b> steps through the pre-solved fills; start the live solver to set your own.</>
    : <>Click bays to make them free or filled (<b>{parked}</b> filled, <b>{free}</b> free) and set the vehicle. Then continue to choose where to park.</>
  return { title: 'Set up the lot', note }
}

// Choosing a bay while a live lot is still being certified: the progress bar and counts.
function selectBandSolving({ progress, waitFor }) {
  const title = <>Certifying bays&hellip; <span className="tnum">{progress.decided} of {progress.free}</span></>
  const pct = Math.floor(progress.frac * 100)
  const counts = [[progress.ok, 'certified'], [progress.failed, 'not certified'], [progress.solving, 'being solved'],
    [progress.deepening, 'being retried'], [progress.pending, 'queued']].filter(([k]) => k > 0)
  const note = (
    <>
      <span className="cert" role="progressbar" aria-label="Certification progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span className="cert-bar"><i style={{ transform: `scaleX(${progress.frac})` }} /></span>
        <b className="tnum">{pct}%</b>
        <span className="tnum">{fmt(progress.elapsed, 0)} s</span>
      </span>
      <span className="cert-counts">{counts.map(([k, w], i) => <span key={w}>{i ? ' · ' : ''}<b className="tnum">{k}</b> {w}</span>)}</span>
      {waitFor != null
        ? <> Bay {waitFor + 1} starts the moment it is certified.</>
        : progress.deepening
          ? <> Retried = tried again the way a driver would: another route, or pulling forward and parking again.</>
          : null}
    </>
  )
  return { title, note }
}

// Choosing a bay: library fills, or a live lot that finished certifying (or lost its solver).
function selectBandIdle({ okCount, free, progress }) {
  const note = progress?.lost
    ? <>The live solver stopped: {okCount} of {free} free bays can be driven. Restart <code>v2/run_demo.bat</code> to solve again.</>
    : progress
    ? <>Solved live in <b className="tnum">{fmt(progress.elapsed, 0)} s</b>: <b>{okCount}</b> of {free} free bays certified. Click a green bay to start.</>
    : <><b>{okCount}</b> of {free} free bays have certified guidance. Click a green bay to start.</>
  return { title: 'Choose a bay', note }
}

// Above the yard before guidance starts. Editing = the "set up the lot" step; otherwise choosing a bay, with the
// live-solver actions and progress while a live lot is certified. Title/note have three states (editing, solving,
// idle); the actions only ever have two (editing, or not) -- solving and idle show the same Change fill / New
// random lot buttons, exactly as before this was split out for readability.
export function SelectBand({ okCount, free, live, progress, editing, parked, changed, dirty, busy, waitFor,
  onRandom, onEdit, onRandomFill, onReset, onContinue, onLayout = null }) {
  const offline = !live
  const solving = progress && !progress.done
  const { title, note } = editing
    ? selectBandEditing({ offline, parked, free })
    : solving
    ? selectBandSolving({ progress, waitFor })
    : selectBandIdle({ okCount, free, progress })
  const actions = editing
    ? editingActions({ offline, busy, dirty, changed, onLayout, onRandomFill, onReset, onContinue })
    : idleActions({ offline, busy, onEdit, onRandom })
  return (
    <section className="band select" aria-label="Instructions">
      <div className="band-body">
        <h2>{title}</h2>
        <p className="band-note">{note}</p>
      </div>
      <div className="band-actions">{actions}</div>
    </section>
  )
}

// Stage legend while choosing a bay or setting up the lot (bottom right of the yard).
export function SelectLegend({ editing, solving }) {
  return (
    <ul className="legend" aria-label="Legend">
      {editing ? <li><i className="sw sw-draft" />Free</li> : <li><i className="sw sw-ok" />Certified guidance</li>}
      {solving && <li><i className="sw sw-pend" />Being certified</li>}
      {!editing && <li><i className="sw sw-nc" />Not certified</li>}
      <li><i className="sw sw-occ" />{editing ? 'Filled' : 'Occupied'}</li>
      {!editing && <li><i className="sw sw-rig" />Your rig, at the gate</li>}
    </ul>
  )
}

export function GuidanceBand({ steps, t, duration, plan, baseline, setBaseline, lock, extra = null }) {
  const idx = stepIndexAt(steps, t)
  const cur = steps[idx]
  const next = steps[idx + 1]
  const done = t >= duration - 0.2
  const g = done ? 'P' : gearOf(cur)
  const prog = clamp((t - cur.t0) / Math.max(cur.t1 - cur.t0, 0.001), 0, 1)
  const drive = cur.kind === 'drive' && !done
  const f = plan.metrics.final
  return (
    <section className="band guide" aria-live="polite" aria-label="Current instruction">
      <Gear g={g} />
      <div className="band-body">
        <div className="band-meta">
          {extra}
          <ModeSwitch baseline={baseline} setBaseline={setBaseline} />
        </div>
        <h2>{done ? 'Parked. Guidance complete.' : cur.label}</h2>
        <div className="band-row">
          {drive ? (
            <div className="fields">
              <Field k="Steering" v={steerText(cur, lock)} />
              <Field k="Speed" v={`${fmt(cur.speed_kmh, 0)} km/h`} />
              <Field k="Distance to go" v={`${fmt(cur.dist * (1 - prog), 0)} of ${fmt(cur.dist, 0)} m`} bar={prog} />
              <Field k="Hitch peak" v={`${fmt(cur.peak_psi, 0)}°`} note={`${fmt(cur.margin_deg, 0)}° below limit`} />
            </div>
          ) : done ? (
            <p className="band-note">
              Set the parking brake. Final pose: <b className="tnum">{fmt(Math.abs(f.lat), 2)} m</b> off-centre, <b className="tnum">{fmt(Math.abs(f.hdg), 1)}°</b> heading, <b className="tnum">{fmt(Math.abs(f.psi), 1)}°</b> hitch.
            </p>
          ) : (
            <p className="band-note">Come to a full stop{cur.engage ? <>, then select <b>{cur.engage < 0 ? 'Reverse' : 'Drive'}</b></> : ''}.</p>
          )}
          {next && !done && (
            <div className="next" title={next.label}>
              <span className="k">Next</span>
              <span className="v">{next.label}</span>
              {next.kind === 'drive' && <span className="n tnum">{next.side === 'straight' ? 'straight' : steerText(next, lock)} &middot; {fmt(next.dist, 0)} m &middot; {fmt(next.speed_kmh, 0)} km/h</span>}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function UnaidedBand({ plan, t, frame, baseline, setBaseline, extra = null }) {
  const b = plan.baseline
  const over = b.jackknife && t >= b.duration - 0.3
  const g = over ? '!' : Math.abs(frame[5]) < 0.04 ? 'N' : frame[5] < 0 ? 'R' : 'D'
  return (
    <section className="band guide unaided" aria-live="polite" aria-label="Unaided driver">
      {g === '!' ? <div className="gearbox g-X" title="Jackknifed"><b>!</b><small>Jackknife</small></div> : <Gear g={g} />}
      <div className="band-body">
        <div className="band-meta">
          <span>Guidance off</span>
          <span className="tnum">{fmt(b.duration, 0)} s run</span>
          {extra}
          <ModeSwitch baseline={baseline} setBaseline={setBaseline} />
        </div>
        <h2>{b.jackknife ? 'Unaided driver: the rig jackknifes' : 'Unaided driver: parks without help'}</h2>
        <div className="band-row">
          <p className="band-note">
            A tractor-only path follower: no hitch model, no look-ahead, no hitch-angle limit.{' '}
            {b.jackknife
              ? <>The hitch angle runs away and the rig folds after <b className="tnum">{fmt(b.t_jack, 0)} s</b> (peak <b className="tnum">{fmt(b.max_psi_deg, 0)}°</b>).</>
              : <>Driving forward is self-stabilising, so it parks here too.</>}
          </p>
        </div>
      </div>
    </section>
  )
}
