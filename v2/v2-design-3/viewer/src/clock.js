// One tick of the simulation clock. Pure, so it can be tested without a browser.
//   speed      playback multiplier (0.25 = quarter speed)
//   autoPause  stop exactly at the start of the next instruction instead of running through it
export function advanceClock({ t, dt, speed, duration, steps, autoPause }) {
  const next = t + dt * speed
  if (next >= duration) return { t: duration, stop: true }
  if (autoPause && steps.length) {
    // strict comparison: a clock a rounding error below a boundary must still stop AT it, and a clock
    // resumed exactly on a boundary must not stop on it again. The start of the run is not a boundary
    // (pressing Play must not pause at once).
    const upcoming = steps.find((s, i) => i > 0 && s.t0 > t)
    if (upcoming && next >= upcoming.t0) return { t: upcoming.t0, stop: true }
  }
  return { t: next, stop: false }
}
