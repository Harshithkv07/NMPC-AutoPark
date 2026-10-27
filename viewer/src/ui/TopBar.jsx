import { I, Mark } from './icons'
import { layoutShort } from '../derive'

export const REPO = 'https://github.com/Harshithkv07/robotics'

function Solver({ live }) {
  return (
    <span className={`solver ${live ? 'on' : ''}`} title={live ? `Live solver running with ${live.workers} processes` : 'No live solver: library fills only (start run_demo.bat)'}>
      <i aria-hidden="true" /><span>{live ? 'Live solver' : 'Library only'}</span>
    </span>
  )
}

function Repo() {
  return (
    <a className="top-link" href={REPO} target="_blank" rel="noopener noreferrer" title="Source on GitHub">
      {I.link}<span>GitHub</span>
    </a>
  )
}

// home: the home page's bar floats over the hero (solid once the page scrolls) with links to its sections.
// live: the solver's health ({workers}) when server.py answers, else null.
// active: 'how' | 'configs' | null, which section is in view (highlights the matching home-nav item).
// crumbLabel: overrides the breadcrumb's second item (e.g. while drawing a custom yard, no layout applies).
export default function TopBar({ home, solid, onNav, active, onHome, manifest, layoutName, live, crumbLabel }) {
  const brand = (
    <>
      <Mark />
      <div>
        <h1>Trailer Parking Guidance</h1>
        <p>Hybrid A* planning &middot; NMPC tracking &middot; Group B9</p>
      </div>
    </>
  )
  if (home) {
    return (
      <header className={`top home-top ${solid ? 'solid' : ''}`}>
        <div className="brand">{brand}</div>
        <nav className="home-nav" aria-label="Sections">
          <button aria-current={active === 'how' ? 'true' : undefined} onClick={() => onNav('how')}>How it works</button>
          <button aria-current={active === 'configs' ? 'true' : undefined} onClick={() => onNav('configs')}>Configurations</button>
        </nav>
        <div className="top-group right"><Repo /><Solver live={live} /></div>
      </header>
    )
  }
  const entry = manifest?.layouts.find((l) => l.name === layoutName)
  return (
    <header className="top">
      <button className="brand" onClick={onHome} title="Back to the home page">{brand}</button>
      <nav className="crumb" aria-label="Breadcrumb">
        <button onClick={onHome}>Home</button>{I.chevR}<b>{crumbLabel || (entry ? layoutShort(entry) : '')}</b>
      </nav>
      <div className="top-group right"><Repo /><Solver live={live} /></div>
    </header>
  )
}
