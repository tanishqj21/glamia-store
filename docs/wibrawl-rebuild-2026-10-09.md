# Wibrawl storefront rebuild

Launch hostname: `wibrawl.glamiastore.com`. Shared Glamia Worker, database, admin portal, checkout and customer accounts. Admin product visibility selects Glamia, Wibrawl or both; existing products default to Glamia. Wibrawl purchases retain the approved `VB` prefix.

## Design direction

An apparel storefront for gaming, anime, sports, movies, music and memes. Bold streetwear typography, original tee campaign photography, flat collection navigation and one lime accent. Design variance 7/10, motion intensity 4/10, visual density 4/10. Existing commerce routes and legal policies remain shared.

Gaming uses dark charcoal, a subtle arena grid and the black tee campaign. Sports uses light green-white surfaces and the bright basketball campaign. Both use Jost, four-pixel control corners and circular account avatars. The only theme choices are Gaming and Sports. A fresh visit follows the device preference; only an explicit choice is saved. Device changes continue to update the default until a choice is made. Reduced motion removes decorative animation.

| Collection | Gaming | Sports |
| --- | --- | --- |
| New arrivals | Just Spawned | New Signings |
| Best sellers | Current Meta | League Leaders |
| Offers | Loot Deals | Matchday Deals |

The header includes a hamburger menu, account dropdown, search, store credits and cart. Drawer categories come from the existing admin-managed category data. The six interest words in the homepage strip describe the brand, rather than inventing categories. Buttons contain no arrow decorations; product gallery navigation uses Prev and Next in Wibrawl.

The homepage retains actual inventory, loading, error and empty states. Browser test fixtures are local only. Campaign imagery is separate from sellable product data.

## Campaign assets

Created with the built-in ImageGen tool, generation mode, two separate original images. No stock images, known characters, third-party logos or real person references. The following production briefs summarize the generation prompts:

- Gaming: Photorealistic premium streetwear campaign, a young adult Indian male model cropped from shoulders to thighs in an oversized black graphic tee. A striking original black-and-white manga fighter illustration with lime screen-print accents on the tee. Dark concrete arena tunnel, atmospheric gaming and sports energy, believable cotton folds and print texture, dramatic natural light. Apparel is the focus. No text, logos, UI, recognizable anime characters or licensed artwork.
- Sports: Photorealistic premium streetwear campaign, a young adult Indian female model cropped from shoulders to thighs in an oversized off-white graphic tee, holding a basketball on a bright outdoor court. Original manga basketball leaper illustration printed in black with lime accents. Athletic streetwear styling, realistic cotton and screen-print texture, soft daylight, crisp editorial detail. Apparel is the focus. No text, logos, UI, recognizable characters or licensed artwork.

Shipped files: `public/wibrawl/gaming-campaign-640.webp`, `gaming-campaign-960.webp`, `sports-campaign-640.webp`, `sports-campaign-960.webp`. Responsive WebP variants use quality 84; the hero reserves its image dimensions. The WB favicon is native SVG with PNG variants in the same directory.

## Verification

- Real SQLite migrations and Worker functions verify product visibility, colourways, coupon validation, coupon listing, credit checkout, VB/GM order numbers, metadata, sitemap scope, exact CSP script hashes and direct product server rendering.
- Existing coupon lifecycle and Glamia server-rendering tests pass.
- Playwright fixtures verify desktop and mobile themes, device preference changes, explicit theme persistence, guest and signed-in account menus, credit balance, admin categories, keyboard menu controls, quick view, product size selection, cart quantities and empty/error states.
- WCAG A/AA automated scans pass for both themes at desktop and mobile widths. No horizontal overflow at 1440, 390 or 360 pixels.
- Live checks verify both themes, saved preferences, cart and about routes, the Glamia header link and storefront API separation. Glamia retains its existing inventory; Wibrawl starts empty until products are assigned through admin.
- Mobile Lighthouse improved from performance 59 to 81 after early campaign-image and application preloads. The second audit recorded LCP 3.5 seconds, TBT 100 ms and CLS 0.039; accessibility, best practices and SEO each scored 100. These are individual simulated mobile runs, not field performance measurements.
- Required self-hosted fonts, invoice dependencies and manifest-referenced product images are included so GitHub builds do not depend on untracked workstation files.

Reproduce:

```powershell
npm ci
npm run react:build
node --experimental-vm-modules --experimental-sqlite --test scripts/wibrawl.test.mjs scripts/coupon-lifecycle.test.mjs scripts/storefront-performance.test.mjs scripts/storefront-shell-controls.test.mjs
# Start npm run react:dev in another terminal, then:
node scripts/wibrawl-browser-test.mjs
```

Production publishing must first apply the additive `0111_wibrawl_storefront_scope.sql` migration. The three Cloudflare custom domains are declared together to preserve Glamia's existing root and www routes. Deploy from a reviewed Git snapshot with current assets and the previous manifest's chunks retained for existing browser tabs.

The migration was applied and the storefront deployed on Cloudflare. Google initially rejected the new subdomain; the owner added `https://wibrawl.glamiastore.com` to the existing web OAuth client's authorized JavaScript origins. The site CSP permits Google's exact `https://accounts.google.com/gsi/style` stylesheet endpoint, as specified in [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid). Login and profile-completion copy now use Wibrawl branding while sharing the existing authentication flow.
