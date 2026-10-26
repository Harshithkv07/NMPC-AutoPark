import { fmt } from '../data'

// Run report: the solver figures of the guided run.
export default function Report({ plan }) {
  const m = plan.metrics
  return (
    <div className="scroll report">
      <h4>Solver</h4>
      <dl className="kv">
        <dt>NMPC solves</dt><dd>{m.solves}</dd>
        <dt>Control period</dt><dd>0.25 s</dd>
        <dt>Mean solve time</dt><dd>{fmt(m.solve_ms, 0)} ms</dd>
      </dl>
      <p className="fine">
        Solve times were measured while other bays were being solved in parallel on the same machine; on an idle core a
        solve takes roughly 11–17 ms against the 250 ms control period. The closed-loop run is computed first (live, or
        for the library in advance) and then replayed here.
      </p>
    </div>
  )
}
