/** @jsxRuntime automatic */
import { GameController } from '@phosphor-icons/react/dist/csr/GameController';
import { SoccerBall } from '@phosphor-icons/react/dist/csr/SoccerBall';
import { WibrawlHint } from './WibrawlHint';

export function WibrawlModeSwitch({ mode, onChange }) {
  return <div className="wb-mode-switch" role="group" aria-label="Storefront persona">{[['gaming',GameController,'GAMING MODE // Dark Mode'],['sports',SoccerBall,'SPORTS MODE // Light Mode']].map(([value,Glyph,label]) => <WibrawlHint key={value} label={label}><button type="button" aria-label={label} aria-pressed={mode === value} onClick={() => onChange(value)}><Glyph size={20} weight={mode === value ? 'fill' : 'regular'} /></button></WibrawlHint>)}</div>;
}
