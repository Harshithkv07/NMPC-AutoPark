// A generic segmented control: shared by every Guided/Unaided, Replay/Live, speed and reverse-in/drive-in
// toggle in the app, so they look and behave identically. `tone` adds a modifier class (e.g. "mode" for the
// Guided/Unaided red "off" state, "source" for Replay/Live's filled "Live" state) that styles.css keys off.
export default function SegToggle({ value, onChange, options, ariaLabel, ariaLabelledBy, tone, className = '' }) {
  const cls = ['seg', tone, className].filter(Boolean).join(' ')
  return (
    <div className={cls} role="group" aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} className={o.off ? 'off' : undefined}
          onClick={() => onChange(o.value)} title={o.title}>{o.label}</button>
      ))}
    </div>
  )
}
