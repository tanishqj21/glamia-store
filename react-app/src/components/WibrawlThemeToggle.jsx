/** @jsxRuntime automatic */
import { GameController } from '@phosphor-icons/react/dist/csr/GameController';
import { SoccerBall } from '@phosphor-icons/react/dist/csr/SoccerBall';

// Like Glamia's sun/moon control, the visible icon represents the next theme.
export function WibrawlThemeToggle({ theme, onChange, streetwear = false }) {
  const next = theme === 'gaming' ? 'sports' : 'gaming';
  const label = streetwear ? `Switch to ${next === 'sports' ? 'Stadium Light' : 'Tunnel Dark'}` : `Switch to ${next === 'sports' ? 'Sports' : 'Gaming'} theme`;
  return <button type="button" className="tool-button theme-toggle wibrawl-theme-toggle" data-theme={theme} aria-label={label} title={label} onClick={() => onChange(next)}>
    <span className="wibrawl-theme-icon wibrawl-theme-icon--gaming" aria-hidden="true"><GameController size={23} weight="regular" className="wibrawl-theme-glyph" /></span>
    <span className="wibrawl-theme-icon wibrawl-theme-icon--sports" aria-hidden="true"><SoccerBall size={23} weight="regular" className="wibrawl-theme-glyph" /></span>
  </button>;
}
