# Wibrawl vector logo concepts

Three original SVG concepts for the Wibrawl graphic-tee brand. The brand name follows the established **Wibrawl** spelling.

**Recommended: 01 / Neon Fold.** Two angular folds form a W. Neon blue and pink meet at a yellow accent. The accompanying wordmark uses custom geometric lettering. The standalone W works as a small brand mark; the full name stays readable in the horizontal lockup.

## Files

| File | Use |
| --- | --- |
| `wibrawl-logo.svg` | Recommended full-colour logo on dark backgrounds |
| `wibrawl-logo-light.svg` | Same logo, dark lettering for light backgrounds |
| `wibrawl-logo-white.svg` | Single-colour white artwork |
| `wibrawl-logo-black.svg` | Single-colour black artwork |
| `wibrawl-mark.svg` | Standalone full-colour W |
| `wibrawl-mark-white.svg` | Standalone single-colour W |
| `wibrawl-icon.svg` | W centred in a square transparent canvas |
| `wibrawl-wordmark.svg` | Custom lettering without the mark |
| `02-afterimage.svg` | Alternative: slanted blue lettering, pink echo, yellow I |
| `03-label-code.svg` | Alternative: WB monogram with a stacked wordmark |
| `index.html` | Local preview of the three concepts and a light-background example |
| `concepts-preview.png` | Presentation preview; not the logo master |
| `wibrawl-logo-preview.png` | Enlarged preview of the recommended logo |
| `build.mjs` | Reproducible vector source and preview builder |

## Palette

- Neon blue: `#00C8FF`
- Neon pink: `#FF3096`
- Neon yellow: `#F4FF38`
- Light lettering: `#F7F8F5`
- Dark lettering: `#11131A`

All logo masters have transparent backgrounds, scalable viewBoxes, accessible descriptions and lettering drawn as paths. They contain no embedded images, scripts, linked fonts or external resources. The forms use solid fills without glow filters so the artwork also works in print.

Keep the aspect ratio. Use at least 180 px width for the full lockup; use the standalone square icon below that. Reserve clear space around the artwork of roughly one wordmark stroke width. For embroidery or one-colour printing, use the monochrome master; choose the final physical size with the printer. Neon screen colours need a printer-approved ink specification to reproduce their brightness.

The concepts are supplied as artwork for review; the storefront header and existing Glamia navigation have not been replaced. Rebuild with `node design/wibrawl-logo/build.mjs` from the repository root (requires the project's Sharp dependency).
