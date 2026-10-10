# Wibrawl hero redesign

Published at https://wibrawl.glamiastore.com. Manage it at `/admin/hero` on either domain; select the Wibrawl storefront.

- Removed the fixed six-interest strip and the interest list in About, including crawler/sharing copy. Updated the manifesto and footer to self-expression copy. Admin-created categories and the two existing Gaming/Sports themes remain available.
- Added Poster, Collage, and Split compositions. Each slide has its own layout and a choice of selected product images or the new illustrative streetwear campaign. Buttons remain text-only on Wibrawl.
- Published three editable starter slides: “YOUR VIBE. YOUR RULES.”, “MAIN CHARACTER ENERGY.”, and “MAKE IT YOURS.” They reference the existing Wibrawl-only sample tees. Samples retain zero stock and their Merchant sample exclusion; real Wibrawl listings remain eligible.
- A vertical queue immediately below the preview controls visibility and display order. Drag the handle with a mouse or touch, or use Up/Down on the focused handle. The top item plays first; changes save automatically. Hidden slides retain their place. Hiding all slides hides the hero.
- Reorders validate the complete storefront-specific ID list and use an atomic D1 batch. Incomplete, duplicate, cross-domain, and stale lists fail without partially saving order. A slide with a removed product can still be hidden.
- Both domains use the same admin workspace and permission map. Hero Studio defaults to the current domain, but either storefront can be edited from either admin. The Glamia Cinematic Reel editor is available from both when the employee has its existing permission. Glamia-only Reel/About content is explicitly labeled domain specific. Wibrawl admin headings use Wibrawl branding.

Migration: `0113_hero_layouts.sql` adds layout and imagery fields without changing existing Glamia slide contents or positions. The three Wibrawl starter records were inserted separately, guarded by an empty Wibrawl carousel and three live products on that storefront. Deployment: `7bb2c23a-5a79-43d2-929c-7a3785d7d591`.

Validation: 91 backend/security/session/checkout/merchant/performance checks pass. Browser fixtures cover create/edit, domain switching, product filtering, Show/Hide, hiding all slides, actual mouse and touch dragging, keyboard reordering, saved order after reload, shared admin navigation, mobile/desktop layouts, both themes, long headlines, reduced motion and accessibility. Existing cross-domain login and shared logout browser regressions pass. Live checks cover the three layouts and campaign assets under production CSP.

## Campaign asset and generation prompt

Generated with the built-in image generation tool, then optimized to WebP with Sharp:

- `public/wibrawl/streetwear-campaign-1440.webp`
- `public/wibrawl/streetwear-campaign-720.webp`

Prompt:

> Use case: ads-marketing. Create one landscape editorial campaign photograph for Wibrawl, an Indian Gen Z graphic tee storefront. Aspect ratio about 3:2. Two young adult Indian streetwear models, one woman and one man, wearing oversized black and cream graphic tees with original abstract ink graphics (no characters, recognizable IP or lettering), wide-leg jeans, silver accessories. Candid confident poses on a concrete rooftop, directional late afternoon flash photography, real fabric texture, subtle film grain. Charcoal, warm ivory, acid lime details. Composition: models occupy center and right, architectural negative space left. Premium independent streetwear magazine photography, slightly low angle, authentic and playful. No text, logos, UI, watermarks, gaming, anime, sports equipment or franchise references. This is an illustrative campaign image, not an actual product catalog photo.
