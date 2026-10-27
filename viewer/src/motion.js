import { gsap } from 'gsap'

// Wrap entrance/scroll animations in this so prefers-reduced-motion skips them and the final state renders
// immediately instead -- the project's CSS kill-switch (styles.css, * { transition: none !important }) only
// stops CSS transitions/animations, not GSAP's own inline style writes, so GSAP needs this separate guard.
export function whenMotionOk(fn) {
  const mm = gsap.matchMedia()
  mm.add('(prefers-reduced-motion: no-preference)', fn)
  return mm
}
