# WIBRAWL — selected Afterimage logo

The selected Wibrawl logo is the original Afterimage wordmark from the middle of the supplied three-concept board. The final package contains one logo, preserving its exact custom lettering, slant, spacing and lower echo. Its yellow accent is replaced with Wibrawl's website lime.

Final colours:

- Main lettering: neon blue `#00C8FF`.
- I: website lime `#C3F35E`.
- Lower echo: neon pink `#FF3096`.

`wibrawl-logo.svg` is the transparent vector master, with all lettering drawn as paths and no external font or raster dependency. `wibrawl-logo-transparent.png` is a large transparent export. `wibrawl-logo-preview.png` shows the selected logo on Wibrawl's Gaming background.

Previous concepts remain in their historical design folders. They are not included in this final package. The website now uses this logo in its Wibrawl header, footer and loading screen. `scripts/prepare-wibrawl-brand.mjs` copies the SVG master to `public/wibrawl/logo.svg` and builds `public/wibrawl/favicon.svg` using the same W and B path lettering. The favicon is SVG only.

Rebuild with `node design/wibrawl-final/build.mjs` from the repository root. It reads the original artwork from `design/wibrawl-logo/02-afterimage.svg` and requires Sharp.
