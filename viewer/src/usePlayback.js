import { useCallback, useEffect, useRef, useState } from 'react'
import { clamp, stepIndexAt } from './data'
import { advanceClock } from './clock'

// Simulation clock. `t` is smooth (drives the 3D scene and needles); `tText` refreshes ~5x per second of
// wall-clock time so that numbers stay readable when playback is slow.
export default function usePlayback({ duration, steps, speed, autoPause }) {
  const [t, setT] = useState(0)
  const [tText, setTText] = useState(0)
  const [playing, setPlaying] = useState(false)
  const tRef = useRef(0)
  const cfg = useRef({ duration, steps, speed, autoPause })
  cfg.current = { duration, steps, speed, autoPause }

  const commit = useCallback((v) => {
    tRef.current = v
    setT(v)
    setTText(v)
  }, [])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let lastText = last
    const tick = (now) => {
      const c = cfg.current
      const dt = Math.min((now - last) / 1000, 0.1) // a hidden tab must not teleport the truck
      last = now
      const { t: next, stop } = advanceClock({ t: tRef.current, dt, speed: c.speed, duration: c.duration, steps: c.steps, autoPause: c.autoPause })
      tRef.current = next
      setT(next)
      if (stop || now - lastText > 180) {
        setTText(next)
        lastText = now
      }
      if (stop) {
        setPlaying(false)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const seek = useCallback((v) => {
    commit(clamp(v, 0, cfg.current.duration))
    setPlaying(false)
  }, [commit])

  const restart = useCallback(() => {
    commit(0)
    setPlaying(true)
  }, [commit])

  const play = useCallback(() => {
    if (tRef.current >= cfg.current.duration - 0.05) commit(0)
    setPlaying(true)
  }, [commit])

  const pause = useCallback(() => {
    setPlaying(false)
    setTText(tRef.current)
  }, [])

  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play])

  const nextStep = useCallback(() => {
    const { steps, duration: d } = cfg.current
    if (!steps.length) return seek(tRef.current + 5)
    const nxt = steps[stepIndexAt(steps, tRef.current) + 1]
    seek(nxt ? nxt.t0 : d)
  }, [seek])

  const prevStep = useCallback(() => {
    const { steps } = cfg.current
    if (!steps.length) return seek(tRef.current - 5)
    const i = stepIndexAt(steps, tRef.current)
    // more than a second into a step: restart it; otherwise go to the one before
    seek(tRef.current - steps[i].t0 > 1 || i === 0 ? (i === 0 ? 0 : steps[i].t0) : steps[i - 1].t0)
  }, [seek])

  return { t, tText, playing, play, pause, toggle, seek, restart, nextStep, prevStep }
}
