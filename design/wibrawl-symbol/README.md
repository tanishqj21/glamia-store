# Wibrawl — symbol-only identity

An original abstract avatar combining three ideas in one expression:

- **Gaming:** an angular avatar and a detached arcade pixel.
- **Sports:** a forward tilt, trailing motion strokes and a focused eye.
- **Memes:** a deliberately cheeky wink and an upward smirk.

There are no words, initials, controllers, balls or borrowed meme characters in the artwork.

## Deliverables

| File | Use |
| --- | --- |
| `wibrawl-symbol.svg` | Full-colour master with transparent background |
| `wibrawl-symbol-white.svg` | Single-colour white version |
| `wibrawl-symbol-black.svg` | Single-colour black version |
| `wibrawl-symbol-small.svg` | Simplified small icon without the detached pixel or motion strokes |
| `symbol-preview.png` | Presentation image on a dark background |
| `applications-preview.png` | Dark, light, monochrome and small-size checks |
| `build.mjs` | Reproducible source geometry |

Neon blue `#00C8FF`, neon pink `#FF3096`, neon yellow `#F4FF38`.

The masters are real vector paths and cutouts, with no raster images, fonts, scripts, glow filters or external dependencies. Eye and mouth cutouts reveal the background beneath the logo. Maintain the square canvas and proportions; use the simplified icon at 16–24 px. Keep clear space around the mark. The single-colour versions preserve its expression for clothing labels and printing.

Rebuild from the repository root with `node design/wibrawl-symbol/build.mjs`; the source uses the project's Sharp dependency to create presentation previews. These files are a revised logo proposal; the earlier lettermark concepts remain in `design/wibrawl-logo` for history.
