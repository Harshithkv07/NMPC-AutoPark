// The NMPC driving live: what the browser keeps of a run the server streams (server.py /api/live).
// Pure, so the Node tests can run it.

export const emptyLive = (id = null) => ({
  id, frames: [], hor: [], events: [], n: [0, 0, 0], state: 'starting', done: false, result: null, error: null,
  speed: 1, solveMs: null,
})

// Add one poll answer (only what is new since the counts we sent) to the run
export function mergeLive(run, snap) {
  return {
    ...run,
    frames: snap.frames.length ? run.frames.concat(snap.frames) : run.frames,
    hor: snap.hor.length ? run.hor.concat(snap.hor) : run.hor,
    events: snap.events.length ? run.events.concat(snap.events) : run.events,
    n: snap.n, state: snap.state, done: snap.done, result: snap.result, error: snap.error, speed: snap.speed,
    solveMs: snap.solve_ms,
  }
}

export const LAG = 0.3          // s the picture stays behind the newest frame, so there is always one to move towards

// Display clock of a live run: simulated time moves at `speed` x wall time but never past the newest frame (minus LAG,
// until the run is over); after a gap (the tab was hidden, the rig stood still to re-plan) it catches up at once.
export function liveClock(t, dt, speed, lastT, done) {
  const target = done ? lastT : Math.max(0, lastT - LAG)
  if (target <= t) return t
  if (target - t > 1.5) return target
  return Math.min(target, t + dt * speed)
}

// The newest event of a kind, or null
export const lastEvent = (run, kind) => {
  for (let i = run.events.length - 1; i >= 0; i--) if (run.events[i].kind === kind) return run.events[i]
  return null
}
