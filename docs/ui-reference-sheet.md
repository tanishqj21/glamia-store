# UI reference sheet

A growing collection of UI components and examples shared by the user for
Glamia and Wibrawl. Add future references here.

## How to use these references

- These are options, not a default design system or mandatory library.
- Pick references that suit the current request. Follow any component the user
  specifically selects for that task.
- Adapt colours and typography to the relevant brand and preserve functionality,
  accessibility, responsive behaviour and performance.
- Reuse component code where appropriate; a reference does not by itself request
  installing a library, redesigning existing screens or deploying changes.
- Existing preferences: clean controls, subtle animations, no arrows in buttons.
- The user confirmed that Three.js, React Three Fiber and Liquid Glass should
  also be considered alongside the component references. Use them when they suit
  the requested feature; avoid loading graphics libraries on unrelated routes.

## Collection

| Added | Reference | Useful details | Status |
| --- | --- | --- | --- |
| 2026-10-20 | [Vengeance UI — full component catalog](https://www.vengenceui.com/components) | All 76 published components indexed in the [catalog below](#vengeance-ui-component-catalog), including the user-selected [Animated Number](https://www.vengenceui.com/components/animated-number). | Reference options; not installed or applied. |
| 2026-10-20 | [Three.js](https://threejs.org/docs/) | Reuse for requested 3D scenes and product interactions. Load only where needed, pause rendering when idle or offscreen, and provide a lightweight fallback. | Installed locally: `three@0.186.1`; no new scene added by this entry. |
| 2026-10-20 | [React Three Fiber](https://r3f.docs.pmnd.rs/) | Existing React integration option for Three.js features. Consider together with Three.js when the task calls for 3D, while keeping the normal storefront lightweight. | Installed locally: `@react-three/fiber@9.8.2`; no new scene added by this entry. |
| 2026-10-20 | [Liquid Glass JS — dashersw](https://github.com/dashersw/liquid-glass-js) | User-shared source for glass buttons and containers with WebGL refraction and blur. Use selectively, check mobile rendering cost and browser support, and retain an accessible fallback. | Reference option; no matching root npm dependency or storefront import found during this check. |
| 2026-10-20 | [React Bits Pro — full component catalog](https://pro.reactbits.dev/docs/components) | All 230 listed components indexed by category with direct documentation links in the [catalog below](#react-bits-pro-component-catalog). | Reference options; indexing does not install or apply components. |
| 2026-10-20 | [React Bits Pro — Stipple Type](https://pro.reactbits.dev/docs/components/stipple-type) | Interactive marbled-ink typography that swirls and breaks into stippled dots. Consider for expressive headlines; adapt colours to the brand, preserve readable text and reduced-motion support, and assess rendering cost before use. | Reference option; not installed or applied. |
| 2026-10-20 | [daisyUI megamenu and component library](https://daisyui.com/components/megamenu/) | User-shared source for natural-looking UI components. May inspire layouts or supply component code when relevant. | Reference option; explicitly not the default. |
| 2026-10-20 | [Skiper UI — ExpandOnHover / skiper52](https://skiper-ui.com/v1/skiper52) | User-shared animation library for subtle website interactions. Linked example expands gallery images on hover. Consider alongside its animated icons, navigation, tabs and carousels when relevant. Preserve reduced-motion support and provide touch/keyboard alternatives for hover interactions. | Reference option; not installed or applied. |
| 2026-10-20 | [daisyUI footer](https://daisyui.com/components/footer/) and [Skiper CSS link interaction](https://skiper-ui.com/v1/skiper40) | Grouped navigation, logo section and separate policy/copyright rows; quiet underline and icon movement. Adapted with original CSS, existing fonts and brand palettes. | Applied to the Glamia and Wibrawl footer redesign; no new library installed. |
| 2026-10-19 | User-pasted connected timeline component | Alternating labels, connected progress line and completed check markers. Adapted to actual order stages and responsive layouts. | Implemented for Glamia and Wibrawl order progress. |

## Implementation notes

- Skiper's linked example lists Framer Motion as a dependency. Check the existing
  stack and animation cost before choosing an implementation; adding a reference
  does not authorize a dependency installation.
- The linked Skiper page states that its free version requires attribution and
  Pro does not. Confirm the applicable terms when reusing its code or assets.

## React Bits Pro component catalog

Source: [React Bits Pro components](https://pro.reactbits.dev/docs/components).
Indexed on 2026-10-20: **230 components** across five categories. This is a
snapshot of the published directory; check the source for later additions.

Each entry is an optional reference. Component documentation links are recorded
from the directory; individual implementations, dependencies and performance
have not all been reviewed. Before using a component, check its current API,
access requirements and license, preserve accessible text and reduced-motion
behaviour, and assess its mobile rendering cost. No components were installed
or applied by adding this index.

| Category | Components |
| --- | ---: |
| Text | 34 |
| Backgrounds | 98 |
| 3D & Shaders | 49 |
| Cursor Effects | 21 |
| UI & Cards | 28 |

### Text (34)

- [3D Letter Swap](https://pro.reactbits.dev/docs/components/3d-letter-swap)
- [3D Text Reveal](https://pro.reactbits.dev/docs/components/3d-text-reveal)
- [ASCII Ripple](https://pro.reactbits.dev/docs/components/ascii-ripple)
- [Bending Marquee](https://pro.reactbits.dev/docs/components/bending-marquee)
- [Blur Highlight](https://pro.reactbits.dev/docs/components/blur-highlight)
- [Cipher Reveal](https://pro.reactbits.dev/docs/components/cipher-reveal)
- [Domino Lettering](https://pro.reactbits.dev/docs/components/domino-lettering)
- [Elastic Lettering](https://pro.reactbits.dev/docs/components/elastic-lettering)
- [Ghost Type](https://pro.reactbits.dev/docs/components/ghost-type)
- [Glitch Text](https://pro.reactbits.dev/docs/components/glitch-text)
- [Glyph Lottery](https://pro.reactbits.dev/docs/components/glyph-lottery)
- [Gravity Letters](https://pro.reactbits.dev/docs/components/gravity-letters)
- [Label Orbit](https://pro.reactbits.dev/docs/components/label-orbit)
- [Luminous Type](https://pro.reactbits.dev/docs/components/luminous-type)
- [Mesh Lettering](https://pro.reactbits.dev/docs/components/mesh-lettering)
- [Orbital Type](https://pro.reactbits.dev/docs/components/orbital-type)
- [Particle Text](https://pro.reactbits.dev/docs/components/particle-text)
- [Ribbon Type](https://pro.reactbits.dev/docs/components/ribbon-type)
- [Rising Ink](https://pro.reactbits.dev/docs/components/rising-ink)
- [Shatter Type](https://pro.reactbits.dev/docs/components/shatter-type)
- [Signal Type](https://pro.reactbits.dev/docs/components/signal-type)
- [Smoke Type](https://pro.reactbits.dev/docs/components/smoke-type)
- [Speeding Text](https://pro.reactbits.dev/docs/components/speeding-text)
- [Spring Lettering](https://pro.reactbits.dev/docs/components/spring-lettering)
- [Staggered Text](https://pro.reactbits.dev/docs/components/staggered-text)
- [Stipple Type](https://pro.reactbits.dev/docs/components/stipple-type)
- [Tessera Trail](https://pro.reactbits.dev/docs/components/tessera-trail)
- [Text Cube](https://pro.reactbits.dev/docs/components/text-cube)
- [Text Morph](https://pro.reactbits.dev/docs/components/text-morph)
- [Text Path](https://pro.reactbits.dev/docs/components/text-path)
- [Text Scatter](https://pro.reactbits.dev/docs/components/text-scatter)
- [Typographic Wall](https://pro.reactbits.dev/docs/components/typographic-wall)
- [Vapor Type](https://pro.reactbits.dev/docs/components/vapor-type)
- [Wave Lettering](https://pro.reactbits.dev/docs/components/wave-lettering)

### Backgrounds (98)

- [ASCII Tiles](https://pro.reactbits.dev/docs/components/ascii-tiles)
- [Ascii Waves](https://pro.reactbits.dev/docs/components/ascii-waves)
- [Astral Shell](https://pro.reactbits.dev/docs/components/astral-shell)
- [Aura Blob](https://pro.reactbits.dev/docs/components/aura-blob)
- [Aurora Beam](https://pro.reactbits.dev/docs/components/aurora-beam)
- [Aurora Blur](https://pro.reactbits.dev/docs/components/aurora-blur)
- [Axial Beam](https://pro.reactbits.dev/docs/components/axial-beam)
- [Binary Orbits](https://pro.reactbits.dev/docs/components/binary-orbits)
- [Black Hole](https://pro.reactbits.dev/docs/components/black-hole)
- [Blinking Dots](https://pro.reactbits.dev/docs/components/blinking-dots)
- [Blinking Squares](https://pro.reactbits.dev/docs/components/blinking-squares)
- [Blurred Rays](https://pro.reactbits.dev/docs/components/blurred-rays)
- [Chroma Blinds](https://pro.reactbits.dev/docs/components/chroma-blinds)
- [Chroma Current](https://pro.reactbits.dev/docs/components/chroma-current)
- [Chroma Waves](https://pro.reactbits.dev/docs/components/chroma-waves)
- [Cloud Atlas](https://pro.reactbits.dev/docs/components/cloud-atlas)
- [Color Loops](https://pro.reactbits.dev/docs/components/color-loops)
- [Concentric Tides](https://pro.reactbits.dev/docs/components/concentric-tides)
- [Contour Tide](https://pro.reactbits.dev/docs/components/contour-tide)
- [Dappled Light](https://pro.reactbits.dev/docs/components/dappled-light)
- [Dither Wave](https://pro.reactbits.dev/docs/components/dither-wave)
- [Dot Shift](https://pro.reactbits.dev/docs/components/dot-shift)
- [Eclipse](https://pro.reactbits.dev/docs/components/eclipse)
- [Fading Stars](https://pro.reactbits.dev/docs/components/fading-stars)
- [Falling Rays](https://pro.reactbits.dev/docs/components/falling-rays)
- [Flame Paths](https://pro.reactbits.dev/docs/components/flame-paths)
- [Fog Sphere](https://pro.reactbits.dev/docs/components/fog-sphere)
- [Glass Flow](https://pro.reactbits.dev/docs/components/glass-flow)
- [Glass Tiles](https://pro.reactbits.dev/docs/components/glass-tiles)
- [Glimmer Wrap](https://pro.reactbits.dev/docs/components/glimmer-wrap)
- [Glitter Warp](https://pro.reactbits.dev/docs/components/glitter-warp)
- [Glowing Ridges](https://pro.reactbits.dev/docs/components/glowing-ridges)
- [Glowing Wave](https://pro.reactbits.dev/docs/components/glowing-wave)
- [Glue Dots](https://pro.reactbits.dev/docs/components/glue-dots)
- [Glyph Ember](https://pro.reactbits.dev/docs/components/glyph-ember)
- [Glyph Orb](https://pro.reactbits.dev/docs/components/glyph-orb)
- [Glyph Sonar](https://pro.reactbits.dev/docs/components/glyph-sonar)
- [Glyph Tide](https://pro.reactbits.dev/docs/components/glyph-tide)
- [Gradient Bars](https://pro.reactbits.dev/docs/components/gradient-bars)
- [Grain Wave](https://pro.reactbits.dev/docs/components/grain-wave)
- [Halftone Vortex](https://pro.reactbits.dev/docs/components/halftone-vortex)
- [Halftone Wave](https://pro.reactbits.dev/docs/components/halftone-wave)
- [Hexagonal Vault](https://pro.reactbits.dev/docs/components/hexagonal-vault)
- [Horizon Bloom](https://pro.reactbits.dev/docs/components/horizon-bloom)
- [Interference Ribbons](https://pro.reactbits.dev/docs/components/interference-ribbons)
- [Landscape](https://pro.reactbits.dev/docs/components/landscape)
- [Light Droplets](https://pro.reactbits.dev/docs/components/light-droplets)
- [Lightspeed](https://pro.reactbits.dev/docs/components/lightspeed)
- [Liquid Bars](https://pro.reactbits.dev/docs/components/liquid-bars)
- [Liquid Lines](https://pro.reactbits.dev/docs/components/liquid-lines)
- [Long Exposure](https://pro.reactbits.dev/docs/components/long-exposure)
- [Luminous Filaments](https://pro.reactbits.dev/docs/components/luminous-filaments)
- [Metallic Swirl](https://pro.reactbits.dev/docs/components/metallic-swirl)
- [Minimal Ripple](https://pro.reactbits.dev/docs/components/minimal-ripple)
- [Mosaic](https://pro.reactbits.dev/docs/components/mosaic)
- [Mosaic Waves](https://pro.reactbits.dev/docs/components/mosaic-waves)
- [Neon Reveal](https://pro.reactbits.dev/docs/components/neon-reveal)
- [Neural Flash](https://pro.reactbits.dev/docs/components/neural-flash)
- [Neural Float](https://pro.reactbits.dev/docs/components/neural-float)
- [Neural Tunnel](https://pro.reactbits.dev/docs/components/neural-tunnel)
- [Nexus Rays](https://pro.reactbits.dev/docs/components/nexus-rays)
- [Perspective Grid](https://pro.reactbits.dev/docs/components/perspective-grid)
- [Photon Knot](https://pro.reactbits.dev/docs/components/photon-knot)
- [Pixel Rain](https://pro.reactbits.dev/docs/components/pixel-rain)
- [Prismatic Slats](https://pro.reactbits.dev/docs/components/prismatic-slats)
- [Radial Liquid](https://pro.reactbits.dev/docs/components/radial-liquid)
- [Ravine](https://pro.reactbits.dev/docs/components/ravine)
- [Retro Lines](https://pro.reactbits.dev/docs/components/retro-lines)
- [Ring Field](https://pro.reactbits.dev/docs/components/ring-field)
- [Rising Lines](https://pro.reactbits.dev/docs/components/rising-lines)
- [Rising Particles](https://pro.reactbits.dev/docs/components/rising-particles)
- [Rolling Blinds](https://pro.reactbits.dev/docs/components/rolling-blinds)
- [Rotating Stars](https://pro.reactbits.dev/docs/components/rotating-stars)
- [Rubber Fluid](https://pro.reactbits.dev/docs/components/rubber-fluid)
- [Satin Ridges](https://pro.reactbits.dev/docs/components/satin-ridges)
- [Shader Waves](https://pro.reactbits.dev/docs/components/shader-waves)
- [Shadow Bars](https://pro.reactbits.dev/docs/components/shadow-bars)
- [Silk Waves](https://pro.reactbits.dev/docs/components/silk-waves)
- [Simple Swirl](https://pro.reactbits.dev/docs/components/simple-swirl)
- [Specter Orb](https://pro.reactbits.dev/docs/components/specter-orb)
- [Spectral Clouds](https://pro.reactbits.dev/docs/components/spectral-clouds)
- [Spectral Drape](https://pro.reactbits.dev/docs/components/spectral-drape)
- [Spiral Funnel](https://pro.reactbits.dev/docs/components/spiral-funnel)
- [Square Matrix](https://pro.reactbits.dev/docs/components/square-matrix)
- [Squares Terminal](https://pro.reactbits.dev/docs/components/squares-terminal)
- [Squircle Shift](https://pro.reactbits.dev/docs/components/squircle-shift)
- [Star Swipe](https://pro.reactbits.dev/docs/components/star-swipe)
- [Swirl Blend](https://pro.reactbits.dev/docs/components/swirl-blend)
- [Synaptic Shift](https://pro.reactbits.dev/docs/components/synaptic-shift)
- [Tech Wall](https://pro.reactbits.dev/docs/components/tech-wall)
- [Terminal Rain](https://pro.reactbits.dev/docs/components/terminal-rain)
- [Thinking Dots](https://pro.reactbits.dev/docs/components/thinking-dots)
- [Twilight Lines](https://pro.reactbits.dev/docs/components/twilight-lines)
- [Vortex](https://pro.reactbits.dev/docs/components/vortex)
- [Voxel Arc](https://pro.reactbits.dev/docs/components/voxel-arc)
- [Warp Twister](https://pro.reactbits.dev/docs/components/warp-twister)
- [Watercolor](https://pro.reactbits.dev/docs/components/watercolor)
- [Wireframe Ball](https://pro.reactbits.dev/docs/components/wireframe-ball)

### 3D & Shaders (49)

- [Agentic Ball](https://pro.reactbits.dev/docs/components/agentic-ball)
- [AI Blob](https://pro.reactbits.dev/docs/components/ai-blob)
- [Album Rail](https://pro.reactbits.dev/docs/components/album-rail)
- [Bend Gallery](https://pro.reactbits.dev/docs/components/bend-gallery)
- [Chrome Orbit](https://pro.reactbits.dev/docs/components/chrome-orbit)
- [Circle Stack](https://pro.reactbits.dev/docs/components/circle-stack)
- [Concave Carousel](https://pro.reactbits.dev/docs/components/concave-carousel)
- [Constellation Gallery](https://pro.reactbits.dev/docs/components/constellation-gallery)
- [Contact Sheet](https://pro.reactbits.dev/docs/components/contact-sheet)
- [Depth Card](https://pro.reactbits.dev/docs/components/depth-card)
- [Depth Image](https://pro.reactbits.dev/docs/components/depth-image)
- [Depth Ribbon](https://pro.reactbits.dev/docs/components/depth-ribbon)
- [Device](https://pro.reactbits.dev/docs/components/device)
- [Dolly Gallery](https://pro.reactbits.dev/docs/components/dolly-gallery)
- [Elastic Reel](https://pro.reactbits.dev/docs/components/elastic-reel)
- [Elastic Sticker](https://pro.reactbits.dev/docs/components/elastic-sticker)
- [Ember Reveal](https://pro.reactbits.dev/docs/components/ember-reveal)
- [Expanding Grid](https://pro.reactbits.dev/docs/components/expanding-grid)
- [Frame Border](https://pro.reactbits.dev/docs/components/frame-border)
- [Glass Reveal](https://pro.reactbits.dev/docs/components/glass-reveal)
- [Globe](https://pro.reactbits.dev/docs/components/globe)
- [Gradient Blob](https://pro.reactbits.dev/docs/components/gradient-blob)
- [Helix Gallery](https://pro.reactbits.dev/docs/components/helix-gallery)
- [Infinite Gallery](https://pro.reactbits.dev/docs/components/infinite-gallery)
- [Inverted Dome](https://pro.reactbits.dev/docs/components/inverted-dome)
- [Iris Gallery](https://pro.reactbits.dev/docs/components/iris-gallery)
- [Lenticular Carousel](https://pro.reactbits.dev/docs/components/lenticular-carousel)
- [Momentum Ring](https://pro.reactbits.dev/docs/components/vertical-reel)
- [Page Flip](https://pro.reactbits.dev/docs/components/page-flip)
- [Parallax Carousel](https://pro.reactbits.dev/docs/components/parallax-carousel)
- [Particle Image](https://pro.reactbits.dev/docs/components/particle-image)
- [Particle Morph](https://pro.reactbits.dev/docs/components/particle-morph)
- [Passage Gallery](https://pro.reactbits.dev/docs/components/passage-gallery)
- [Pixel Reveal](https://pro.reactbits.dev/docs/components/pixel-reveal)
- [Pixel Sculpt](https://pro.reactbits.dev/docs/components/pixel-sculpt)
- [Pixelate Hover](https://pro.reactbits.dev/docs/components/pixelate-hover)
- [Pond Image](https://pro.reactbits.dev/docs/components/pond-image)
- [Portal](https://pro.reactbits.dev/docs/components/portal)
- [Prism Carousel](https://pro.reactbits.dev/docs/components/prism-carousel)
- [Rotating Cards](https://pro.reactbits.dev/docs/components/rotating-cards)
- [Scroll Bend](https://pro.reactbits.dev/docs/components/scroll-bend)
- [Scroll Portal](https://pro.reactbits.dev/docs/components/scroll-portal)
- [Shader Card](https://pro.reactbits.dev/docs/components/shader-card)
- [Shader Reveal](https://pro.reactbits.dev/docs/components/shader-reveal)
- [Spin Shutter](https://pro.reactbits.dev/docs/components/spin-shutter)
- [Star Burst](https://pro.reactbits.dev/docs/components/star-burst)
- [Tumble Carousel](https://pro.reactbits.dev/docs/components/tumble-carousel)
- [Twisting Gallery](https://pro.reactbits.dev/docs/components/twisting-gallery)
- [Warped Card](https://pro.reactbits.dev/docs/components/warped-card)

### Cursor Effects (21)

- [Arc Cursor](https://pro.reactbits.dev/docs/components/arc-cursor)
- [Ascii Cursor](https://pro.reactbits.dev/docs/components/ascii-cursor)
- [Celebration Cursor](https://pro.reactbits.dev/docs/components/celebration-cursor)
- [Chroma Halo](https://pro.reactbits.dev/docs/components/chroma-halo)
- [Cursor Wave](https://pro.reactbits.dev/docs/components/cursor-wave)
- [Custom Cursor](https://pro.reactbits.dev/docs/components/custom-cursor)
- [Dither Cursor](https://pro.reactbits.dev/docs/components/dither-cursor)
- [Drafting Cursor](https://pro.reactbits.dev/docs/components/drafting-cursor)
- [Glass Cursor](https://pro.reactbits.dev/docs/components/glass-cursor)
- [Glyph Stream](https://pro.reactbits.dev/docs/components/glyph-stream)
- [Grid Rise](https://pro.reactbits.dev/docs/components/grid-rise)
- [Gyroscope Cursor](https://pro.reactbits.dev/docs/components/gyroscope-cursor)
- [Liquid Ascii](https://pro.reactbits.dev/docs/components/liquid-ascii)
- [Parallax Pills](https://pro.reactbits.dev/docs/components/parallax-pills)
- [Pigment Trail](https://pro.reactbits.dev/docs/components/pigment-trail)
- [Pixel Magnet](https://pro.reactbits.dev/docs/components/pixel-magnet)
- [Ribbon Trail](https://pro.reactbits.dev/docs/components/ribbon-trail)
- [Smooth Cursor](https://pro.reactbits.dev/docs/components/smooth-cursor)
- [Snapshot Trail](https://pro.reactbits.dev/docs/components/snapshot-trail)
- [Stardust Cursor](https://pro.reactbits.dev/docs/components/stardust-cursor)
- [User Cursor](https://pro.reactbits.dev/docs/components/user-cursor)

### UI & Cards (28)

- [Animated List](https://pro.reactbits.dev/docs/components/animated-list)
- [Card Spread](https://pro.reactbits.dev/docs/components/card-spread)
- [Center Flow](https://pro.reactbits.dev/docs/components/center-flow)
- [Chroma Card](https://pro.reactbits.dev/docs/components/chroma-card)
- [Circle Gallery](https://pro.reactbits.dev/docs/components/circle-gallery)
- [Circles](https://pro.reactbits.dev/docs/components/circles)
- [Click Stack](https://pro.reactbits.dev/docs/components/click-stack)
- [Comparison Slider](https://pro.reactbits.dev/docs/components/comparison-slider)
- [Credit Card](https://pro.reactbits.dev/docs/components/credit-card)
- [Draggable Grid](https://pro.reactbits.dev/docs/components/draggable-grid)
- [Frame Scrub](https://pro.reactbits.dev/docs/components/frame-scrub)
- [Gradient Carousel](https://pro.reactbits.dev/docs/components/gradient-carousel)
- [Hover Preview](https://pro.reactbits.dev/docs/components/hover-preview)
- [Liquid Swap](https://pro.reactbits.dev/docs/components/liquid-swap)
- [Loupe Image](https://pro.reactbits.dev/docs/components/loupe-image)
- [Magic Transform](https://pro.reactbits.dev/docs/components/magic-transform)
- [Modal Cards](https://pro.reactbits.dev/docs/components/modal-cards)
- [Orbit Reel](https://pro.reactbits.dev/docs/components/orbit-reel)
- [Parallax Cards](https://pro.reactbits.dev/docs/components/parallax-cards)
- [Preloader](https://pro.reactbits.dev/docs/components/preloader)
- [Reel Gallery](https://pro.reactbits.dev/docs/components/reel-gallery)
- [Scroll Mask](https://pro.reactbits.dev/docs/components/scroll-mask)
- [Scroll Stack](https://pro.reactbits.dev/docs/components/scroll-stack)
- [Simple Graph](https://pro.reactbits.dev/docs/components/simple-graph)
- [Skewed Carousel](https://pro.reactbits.dev/docs/components/skewed-carousel)
- [Tile Reveal](https://pro.reactbits.dev/docs/components/tile-reveal)
- [Tilted Tiles](https://pro.reactbits.dev/docs/components/tilted-tiles)
- [Tumble Wall](https://pro.reactbits.dev/docs/components/tumble-wall)

## Vengeance UI component catalog

Source: [Vengeance UI components](https://www.vengenceui.com/components).
Indexed on 2026-10-20: **76 components** across nine categories. All catalog
links were cross-checked against the site sitemap. This is a directory snapshot;
check the source for later additions. Animated Number was the original
user-selected reference before the request expanded to the whole catalog.

These are optional references. Individual component APIs, dependencies,
licenses and performance have not all been reviewed. Check those details when
choosing a component, adapt it to the relevant brand, and preserve keyboard,
reduced-motion and mobile support. No library or component was installed or
applied by recording this catalog.

| Category | Components |
| --- | ---: |
| Buttons | 9 |
| Text & Motion | 9 |
| Interactive | 19 |
| Layout & Cards | 10 |
| Tooltip & Marquee | 9 |
| Loaders | 1 |
| Navbar & Docs | 8 |
| Collections | 3 |
| Backgrounds | 8 |

### Vengeance UI — Buttons (9)

- [Animated Button](https://www.vengenceui.com/components/my-animated-button)
- [Candy Button](https://www.vengenceui.com/components/candy-button)
- [Pop Button](https://www.vengenceui.com/components/pop-button)
- [Generate Button](https://www.vengenceui.com/components/generate-button)
- [Radial Glow Button](https://www.vengenceui.com/components/radial-glow-button)
- [Social Flip Button](https://www.vengenceui.com/components/social-flip-button)
- [Liquid Metal](https://www.vengenceui.com/components/liquid-metal)
- [Creepy Button](https://www.vengenceui.com/components/creepy-button)
- [Corner Button](https://www.vengenceui.com/components/corner-button)

### Vengeance UI — Text & Motion (9)

- [Animated Number](https://www.vengenceui.com/components/animated-number)
- [Stats Counter](https://www.vengenceui.com/components/stats-counter)
- [Flip Text](https://www.vengenceui.com/components/flip-text)
- [Flip Fade Text](https://www.vengenceui.com/components/flip-fade-text)
- [Liquid Text](https://www.vengenceui.com/components/liquid-text)
- [Morph Text](https://www.vengenceui.com/components/morph-text)
- [ASCII Glitch Ripple](https://www.vengenceui.com/components/ascii-glitch-ripple)
- [Stagger Text](https://www.vengenceui.com/components/stagger-text)
- [Gooey Text Reveal](https://www.vengenceui.com/components/gooey-text-reveal)

### Vengeance UI — Interactive (19)

- [Image Collage](https://www.vengenceui.com/components/image-collage)
- [Interactive Book](https://www.vengenceui.com/components/interactive-book)
- [Share Sheet](https://www.vengenceui.com/components/share-sheet)
- [Model Viewer](https://www.vengenceui.com/components/model-viewer)
- [Image Trail](https://www.vengenceui.com/components/image-trail)
- [Perspective Carousel](https://www.vengenceui.com/components/perspective-carousel)
- [Cylinder Carousel](https://www.vengenceui.com/components/cylinder-carousel)
- [Diagonal Carousel](https://www.vengenceui.com/components/diagonal-carousel)
- [Ripple Displacement Slider](https://www.vengenceui.com/components/ripple-displacement-slider)
- [Scroll Dissolve Reveal](https://www.vengenceui.com/components/scroll-dissolve-reveal)
- [Pixelated Image Trail](https://www.vengenceui.com/components/pixelated-image-trail)
- [Interactive Keyboard](https://www.vengenceui.com/components/interactive-keyboard)
- [Typing Keyboard](https://www.vengenceui.com/components/typing-keyboard)
- [Solar System](https://www.vengenceui.com/components/solar-system)
- [Interactive Particles](https://www.vengenceui.com/components/interactive-particles)
- [Music Player](https://www.vengenceui.com/components/music-player)
- [Verse Cards](https://www.vengenceui.com/components/verse-cards)
- [Circular Gallery](https://www.vengenceui.com/components/circular-gallery)
- [3D Books Showcase](https://www.vengenceui.com/components/books-showcase)

### Vengeance UI — Layout & Cards (10)

- [Agent Bento Grid](https://www.vengenceui.com/components/agent-bento-grid)
- [Expandable Bento Grid](https://www.vengenceui.com/components/expandable-bento-grid)
- [Staggered Grid](https://www.vengenceui.com/components/staggered-grid)
- [Image Scatter](https://www.vengenceui.com/components/image-scatter)
- [Glow Border Card](https://www.vengenceui.com/components/glow-border-card)
- [Testimonials Card](https://www.vengenceui.com/components/testimonials-card)
- [Highlight Grid](https://www.vengenceui.com/components/highlight-grid)
- [Developer Service Bento](https://www.vengenceui.com/components/research-bento-grid)
- [Team Reveal Grid](https://www.vengenceui.com/components/team-reveal-grid)
- [Why Us Bento Grid](https://www.vengenceui.com/components/why-us-bento)

### Vengeance UI — Tooltip & Marquee (9)

- [Cursor Card](https://www.vengenceui.com/components/cursor-card)
- [Elastic Stack](https://www.vengenceui.com/components/elastic-stack)
- [Logo Slider](https://www.vengenceui.com/components/logo-slider)
- [Stacked Logos](https://www.vengenceui.com/components/stacked-logos)
- [Masked Avatars](https://www.vengenceui.com/components/masked-avatars)
- [Image Reveal List](https://www.vengenceui.com/components/image-reveal-list)
- [FAQ Accordion](https://www.vengenceui.com/components/faq-accordion)
- [Shared Tooltip Avatars](https://www.vengenceui.com/components/shared-tooltip-avatars)
- [Magnetic Spotlight Marquee](https://www.vengenceui.com/components/magnetic-spotlight-marquee)

### Vengeance UI — Loaders (1)

- [Kinetic Text Loader](https://www.vengenceui.com/components/kinetic-text-loader)

### Vengeance UI — Navbar & Docs (8)

- [Glass Dock](https://www.vengenceui.com/components/glass-dock)
- [Spotlight Navbar](https://www.vengenceui.com/components/spotlight-navbar)
- [Notch Navbar](https://www.vengenceui.com/components/notch-navbar)
- [Mega Menu Navbar](https://www.vengenceui.com/components/mega-menu-navbar)
- [Gooey Search](https://www.vengenceui.com/components/gooey-search)
- [Animated Footer](https://www.vengenceui.com/components/animated-footer)
- [Awwwards Nav](https://www.vengenceui.com/components/awwwards-nav)
- [Search Modal](https://www.vengenceui.com/components/search-modal)

### Vengeance UI — Collections (3)

- [Line Hover Link](https://www.vengenceui.com/components/line-hover-link)
- [Folder Preview](https://www.vengenceui.com/components/folder-preview)
- [Animated Tooltip](https://www.vengenceui.com/components/animated-tooltip)

### Vengeance UI — Backgrounds (8)

- [Wave Grid](https://www.vengenceui.com/components/wave-grid-background)
- [Aurora Hero](https://www.vengenceui.com/components/aurora-hero)
- [Fluid Morph Background](https://www.vengenceui.com/components/fluid-morph-bg)
- [Twisting Ribbon](https://www.vengenceui.com/components/twisting-ribbon)
- [Animated Rays](https://www.vengenceui.com/components/animated-rays)
- [Perspective Grid](https://www.vengenceui.com/components/perspective-grid)
- [Light Lines](https://www.vengenceui.com/components/light-lines)
- [Liquid Ocean](https://www.vengenceui.com/components/liquid-ocean)
