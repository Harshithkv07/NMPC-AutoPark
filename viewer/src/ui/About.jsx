import { useState } from 'react'
import { DEG, clamp, fmt, rigLength, sameSpec, setParam, vehicleOf } from '../data'
import { M } from './math'
import VehicleDiagram from './VehicleDiagram'

// The parameters the set-up step can change, in display order. `step`: the - / + buttons; `dp`: decimals shown.
const PARAMS = [
  { key: 'L1', label: <><M>L</M><sub>1</sub> wheelbase</>, name: 'Tractor wheelbase L1', unit: 'm', step: 0.5, dp: 1 },
  { key: 'L2', label: <><M>L</M><sub>2</sub> trailer</>, name: 'Hitch to trailer axle L2', unit: 'm', step: 0.5, dp: 1 },
  { key: 'd', label: <><M>d</M> hitch offset</>, name: 'Hitch offset d, ahead of the tractor rear axle', unit: 'm', step: 0.1, dp: 1 },
  { key: 'delta_max', label: <><M>δ</M><sub>max</sub> lock</>, name: 'Steering lock', unit: '°', step: 1, dp: 0 },
  { key: 'psi_crit', label: <><M>ψ</M> limit</>, name: 'Hitch-angle limit the NMPC enforces', unit: '°', step: 1, dp: 0 },
  { key: 'psi_jack', label: <><M>ψ</M> jackknife</>, name: 'Jackknife angle (tractor meets trailer)', unit: '°', step: 1, dp: 0 },
]

// Typical rigs, as changes to the standard one (the library rig).
export const PRESETS = [
  { name: 'Standard', title: 'The rig the library was solved for: 4 m wheelbase, 8 m trailer', spec: {} },
  { name: 'City', title: 'Short day cab with a short trailer: 3.5 m wheelbase, 6 m trailer', spec: { L1: 3.5, L2: 6, d: 0.3 } },
  { name: 'Long-haul', title: 'Long tractor with a long trailer: 5 m wheelbase, 12 m trailer', spec: { L1: 5, L2: 12, d: 0.6 } },
]

const roundTo = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp
const numText = (v, dp) => (dp ? v.toFixed(dp) : String(v))

// One editable parameter: type a value or step it. A typed value applies as soon as it is in range; leaving the field
// clamps an out-of-range number and restores anything else.
function ParamField({ p, value, lo, hi, onChange }) {
  const [text, setText] = useState(null)              // what is being typed, while the field has focus
  const n = text == null ? value : Number(text.replace(',', '.'))
  const valid = text == null || (text.trim() !== '' && Number.isFinite(n) && n >= lo - 1e-9 && n <= hi + 1e-9)
  const set = (v) => onChange(clamp(roundTo(v, p.dp), lo, hi))
  const range = `${numText(lo, p.dp)}–${numText(hi, p.dp)}${p.unit === '°' ? '°' : ' m'}`
  const id = `veh-${p.key}`
  return (
    <div className={`pf ${valid ? '' : 'bad'}`} title={`${p.name}: ${range}`}>
      <dt><label htmlFor={id}>{p.label}</label><span className="pf-r">{range}</span></dt>
      <dd>
        <button type="button" className="pf-b" onClick={() => { setText(null); set(value - p.step) }} disabled={value <= lo}
          aria-label={`Decrease ${p.name}`}>−</button>
        <span className={`pf-v ${p.unit === '°' ? 'deg' : ''}`}>
          <input id={id} inputMode="decimal" autoComplete="off" spellCheck="false" aria-invalid={!valid}
            style={{ width: `${numText(hi, p.dp).length + 0.6}ch` }}
            value={text ?? numText(value, p.dp)}
            onChange={(e) => {
              setText(e.target.value)
              const v = Number(e.target.value.replace(',', '.'))
              if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= lo && v <= hi) onChange(roundTo(v, p.dp))
            }}
            onBlur={() => { if (text != null && text.trim() !== '' && Number.isFinite(n)) set(n); setText(null) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') { setText(null); e.currentTarget.blur() }
              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault(); setText(null); set(value + (e.key === 'ArrowUp' ? p.step : -p.step))
              }
            }} />
          <span className="pf-u" aria-hidden="true">{p.unit}</span>
        </span>
        <button type="button" className="pf-b" onClick={() => { setText(null); set(value + p.step) }} disabled={value >= hi}
          aria-label={`Increase ${p.name}`}>+</button>
      </dd>
    </div>
  )
}

// Shown while setting up the lot and choosing a bay: the vehicle and the model it runs on. `edit` (set-up step only)
// makes the vehicle editable: {spec, base, limits, onChange(spec)}, or {offline: true} without the live solver.
export default function About({ vehicle, edit }) {
  const editing = edit && !edit.offline
  const v = editing ? vehicleOf(edit.spec, vehicle) : vehicle
  const preset = editing && PRESETS.find((p) => sameSpec(edit.spec, { ...edit.base, ...p.spec }))
  return (
    <>
      <section className={`panel ${editing ? 'veh-edit' : ''}`} aria-label="The vehicle">
        <header className="panel-h"><h3>The vehicle</h3><span className="panel-m">{fmt(rigLength(v), 1)} m nose to tail, top view</span></header>
        <VehicleDiagram v={v} />
        {editing ? (
          <>
            <div className="seg presets" role="group" aria-label="Vehicle presets">
              {PRESETS.map((p) => (
                <button key={p.name} aria-pressed={preset === p} title={p.title}
                  onClick={() => edit.onChange({ ...edit.base, ...p.spec })}>{p.name}</button>
              ))}
            </div>
            <dl className="params edit">
              {PARAMS.map((p) => (
                <ParamField key={p.key} p={p} value={edit.spec[p.key]} lo={edit.limits[p.key][0]} hi={edit.limits[p.key][1]}
                  onChange={(val) => edit.onChange(setParam(edit.spec, p.key, val, edit.limits, edit.gap))} />
              ))}
            </dl>
            <p className="fine veh-note">Bays, aisles and the parked trucks are sized for this rig, and every free bay is re-planned and certified for it.</p>
          </>
        ) : (
          <>
            <dl className="params">
              <div><dt><M>L</M><sub>1</sub> wheelbase</dt><dd>{fmt(v.L1, 1)} m</dd></div>
              <div><dt><M>L</M><sub>2</sub> trailer</dt><dd>{fmt(v.L2, 1)} m</dd></div>
              <div><dt><M>d</M> hitch offset</dt><dd>{fmt(v.d, 1)} m</dd></div>
              <div><dt><M>δ</M><sub>max</sub> lock</dt><dd>{fmt(v.delta_max * DEG, 0)}°</dd></div>
              <div><dt><M>ψ</M> limit</dt><dd>{fmt(v.psi_crit * DEG, 0)}°</dd></div>
              <div><dt><M>ψ</M> jackknife</dt><dd>{fmt(v.psi_jack * DEG, 0)}°</dd></div>
            </dl>
            {edit?.offline && <p className="fine veh-note">Changing the vehicle needs the live solver: start <code>run_demo.bat</code>.</p>}
          </>
        )}
      </section>
    </>
  )
}
