import { useCallback, useEffect, useRef, useState } from 'react'
import { liveCmd, livePoll, liveStart } from './data'
import { emptyLive, liveClock, mergeLive } from './liveRun'

const POLL_MS = 120

// One live run of a certified bay while `active`: started on the server, polled, and shown on a clock that trails the
// newest frame. Changing `key` (or the bay / controller) starts a new run; going inactive stops it.
export default function useLiveRun({ lotId, bay, controller, active, key }) {
  const [run, setRun] = useState(emptyLive())
  const [speed, setSpeedState] = useState(1)
  const [t, setT] = useState(0)
  const [tText, setTText] = useState(0)
  const [failed, setFailed] = useState(null)
  const runRef = useRef(run)
  runRef.current = run
  const speedRef = useRef(speed)
  speedRef.current = speed
  const tRef = useRef(0)

  // start, poll until done, stop on the way out
  useEffect(() => {
    if (!active || lotId == null || bay == null) return
    let dead = false, timer = null, id = null
    setRun(emptyLive()); setT(0); setTText(0); tRef.current = 0; setFailed(null)
    const poll = async () => {
      try {
        const snap = await livePoll(id, runRef.current.n)
        if (dead) return
        const next = mergeLive(runRef.current, snap)
        runRef.current = next
        setRun(next)
        if (!snap.done) timer = setTimeout(poll, POLL_MS)
      } catch (e) {
        if (!dead) setFailed(e.message)
      }
    }
    liveStart({ lot_id: lotId, bay, controller, speed: speedRef.current })
      .then((r) => { if (dead) { liveCmd(r.run_id, 'stop').catch(() => {}); return } id = r.run_id; runRef.current = emptyLive(id); setRun(runRef.current); poll() })
      .catch((e) => { if (!dead) setFailed(e.message) })
    return () => { dead = true; clearTimeout(timer); if (id) liveCmd(id, 'stop').catch(() => {}) }
  }, [active, lotId, bay, controller, key])

  // the display clock (smooth t for the scene, ~5 Hz tText for the numbers)
  useEffect(() => {
    if (!active) return
    let raf = 0, last = performance.now(), lastText = last, shown = tRef.current
    const tick = (now) => {
      const r = runRef.current
      const lastT = r.frames.length ? r.frames[r.frames.length - 1][0] : 0
      const next = liveClock(tRef.current, Math.min((now - last) / 1000, 0.1), speedRef.current, lastT, r.done)
      last = now
      if (next !== tRef.current) { tRef.current = next; setT(next) }
      if (now - lastText > 180 && shown !== next) { setTText(next); shown = next; lastText = now }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  const push = useCallback((deg) => { if (runRef.current.id) liveCmd(runRef.current.id, 'push', { dpsi_deg: deg }).catch(() => {}) }, [])
  const stop = useCallback(() => { if (runRef.current.id) liveCmd(runRef.current.id, 'stop').catch(() => {}) }, [])
  const setSpeed = useCallback((s) => {
    setSpeedState(s)
    if (runRef.current.id && !runRef.current.done) liveCmd(runRef.current.id, 'speed', { speed: s }).catch(() => {})
  }, [])

  return { run, t, tText, speed, setSpeed, push, stop, failed }
}
