// Math typesetting helpers. The time-derivative dot is drawn in CSS, not with a combining character, because
// U+0307 over an italic Greek letter renders inconsistently (or not at all) across system math fonts.
export const M = ({ children }) => <span className="m">{children}</span>
// `tall` for letters that reach cap height (θ, ψ, X) so the dot clears them.
export const Dot = ({ children, tall }) => <span className={`m od ${tall ? 'tall' : ''}`}>{children}</span>
