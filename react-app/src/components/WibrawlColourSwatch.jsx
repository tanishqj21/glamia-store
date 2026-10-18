/** @jsxRuntime automatic */
import { colourHex } from '../lib/colours';

// SVG presentation attributes render immediately under the strict CSP; an
// inline style attribute on server-rendered HTML would be blocked.
export function WibrawlColourSwatch({ colour, hex }) {
  return <svg className="wb-colour-swatch" viewBox="0 0 16 16" width="16" height="16" preserveAspectRatio="none" aria-hidden="true"><rect width="16" height="16" fill={colourHex(hex, colour)} /></svg>;
}
