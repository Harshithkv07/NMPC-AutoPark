// One icon family: 20 px grid, 1.6 px stroke, round joins.
const base = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const I = {
  play: <svg {...base} fill="currentColor" stroke="none"><path d="M6.5 4.2v11.6L16 10z" /></svg>,
  pause: <svg {...base} fill="currentColor" stroke="none"><path d="M5.5 4h3v12h-3zM11.5 4h3v12h-3z" /></svg>,
  restart: <svg {...base}><path d="M4.5 10a5.5 5.5 0 1 0 1.8-4.1M4.5 3.5v3.2h3.2" /></svg>,
  prev: <svg {...base}><path d="M5.5 4.5v11M15 4.5 8.5 10l6.5 5.5z" /></svg>,
  next: <svg {...base}><path d="M14.5 4.5v11M5 4.5l6.5 5.5L5 15.5z" /></svg>,
  chevL: <svg {...base}><path d="M12 5l-5 5 5 5" /></svg>,
  chevR: <svg {...base}><path d="M8 5l5 5-5 5" /></svg>,
  chevD: <svg {...base}><path d="M5 8l5 5 5-5" /></svg>,
  check: <svg {...base} strokeWidth="2"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>,
  cross: <svg {...base} strokeWidth="2"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>,
  alert: <svg {...base}><path d="M10 3.2 2.8 16h14.4z" /><path d="M10 8.2v3.6M10 13.9v.2" /></svg>,
  info: <svg {...base}><circle cx="10" cy="10" r="7" /><path d="M10 9v4.5M10 6.4v.2" /></svg>,
  parked: <svg {...base}><rect x="3.5" y="3.5" width="13" height="13" rx="1.5" /><path d="M8 14V6h2.6a2.3 2.3 0 0 1 0 4.6H8" /></svg>,
  dice: <svg {...base}><rect x="3.5" y="3.5" width="13" height="13" rx="2.5" /><path d="M7.2 7.2h.1M12.8 7.2h.1M10 10h.1M7.2 12.8h.1M12.8 12.8h.1" strokeWidth="2.4" /></svg>,
  edit: <svg {...base}><path d="M12.6 4.4l3 3L7.4 15.6l-3.9.9.9-3.9z" /><path d="M11 6l3 3" /></svg>,
  // "how it works" steps
  route: <svg {...base}><circle cx="5" cy="15" r="2" /><circle cx="15" cy="5" r="2" /><path d="M7 15h4.5a2.5 2.5 0 0 0 0-5h-3a2.5 2.5 0 0 1 0-5H13" /></svg>,
  horizon: <svg {...base}><path d="M3 13.5c2.5 0 3-4.5 6-4.5s3.5 2.5 8 2.5" /><path d="M3 16.5h14" strokeDasharray="1.5 2.5" /><circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" /></svg>,
  shield: <svg {...base}><path d="M10 2.8 4 5v4.6c0 3.7 2.6 6.4 6 7.6 3.4-1.2 6-3.9 6-7.6V5z" /><path d="M7.3 10.2l1.9 1.9 3.6-3.9" /></svg>,
  wheel: <svg {...base}><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="1.8" /><path d="M3.2 10h5M11.8 10h5M10 11.8V17" /></svg>,
  // site chrome: external link, and an up arrow for "back to top"
  link: <svg {...base}><path d="M8.2 5.3H6a1.8 1.8 0 0 0-1.8 1.8v6.9A1.8 1.8 0 0 0 6 15.8h6.9a1.8 1.8 0 0 0 1.8-1.8v-2.2" /><path d="M11.2 4.5h4.3v4.3M15.3 4.7l-6.1 6.1" /></svg>,
  up: <svg {...base}><path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" /></svg>,
}

export const LayoutIcon = ({ name }) => {
  const s = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...s}>
      {name === 'cross' && <><path d="M3 12h18" strokeDasharray="2 2" /><path d="M5 9V3M9 9V3M13 9V3M17 9V3M5 15v6M9 15v6M13 15v6M17 15v6" /></>}
      {name === 'angled' && <><path d="M3 12h18" strokeDasharray="2 2" /><path d="M5 9l3-6M9 9l3-6M13 9l3-6M17 9l3-6M5 15l3 6M9 15l3 6M13 15l3 6M17 15l3 6" /></>}
      {name === 'parallel' && <><path d="M3 12h18" strokeDasharray="2 2" /><rect x="3" y="4" width="8" height="4" /><rect x="13" y="4" width="8" height="4" /><rect x="3" y="16" width="8" height="4" /><rect x="13" y="16" width="8" height="4" /></>}
      {name === 'tandem' && <><rect x="2" y="5" width="6" height="4" /><rect x="9" y="5" width="6" height="4" /><rect x="16" y="5" width="6" height="4" /><rect x="2" y="15" width="6" height="4" /><rect x="9" y="15" width="6" height="4" /><rect x="16" y="15" width="6" height="4" /></>}
    </svg>
  )
}

// Product mark: a tractor-trailer seen from above, the rig orange as on the plan.
export const Mark = () => (
  <svg className="mark" viewBox="0 0 34 34" aria-hidden="true">
    <rect width="34" height="34" rx="9" fill="var(--panel)" />
    <rect x="0.5" y="0.5" width="33" height="33" rx="8.5" fill="none" stroke="var(--line-2)" />
    <path d="M6 22.5h22" stroke="var(--ink-4)" strokeWidth="1.2" strokeDasharray="2 2" />
    <rect x="5" y="11.5" width="15" height="8" rx="1.6" fill="var(--ink)" />
    <rect x="21" y="11.5" width="7.5" height="8" rx="2.2" fill="var(--rig)" />
    <rect x="25.2" y="12.8" width="2.2" height="2.8" rx="0.7" fill="var(--panel)" opacity="0.6" />
  </svg>
)
