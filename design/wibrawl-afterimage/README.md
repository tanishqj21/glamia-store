# WIBRAWL — Afterimage colour alternatives

Uses the middle wordmark from the supplied reference: `design/wibrawl-logo/02-afterimage.svg`. The exact original custom letter paths, spacing, ten-degree slant, and seven-unit lower echo are preserved. Only the colours and accessible descriptions change.

| Variant | Lettering | Lower echo | I accent |
| --- | --- | --- | --- |
| Gaming lime | `#C3F35E` | `#24DFFF` | `#101413` |
| Ice blue | `#24DFFF` | `#849689` | `#D7FF45` |
| Electric violet | `#B995FF` | `#24DFFF` | `#D7FF45` |

The Gaming lime colour and the comparison background `#101413` come from the Wibrawl website's Gaming theme. The Gaming lime variant's formerly white I now uses the exact solid colour from the supplied swatch: `#101413`. On the same dark background its main face blends into the background, with the cyan echo remaining visible. The violet version explores a new accent palette.

`wibrawl-gaming-lime.svg`, `wibrawl-ice-blue.svg`, and `wibrawl-electric-violet.svg` are transparent scalable vector masters. Each contains custom path lettering without fonts, external assets, scripts, or bitmap content. `wibrawl-original.svg` preserves the supplied design's original cyan, pink and yellow combination.

`colour-comparison.png` presents the three alternatives on the Gaming background. The `*-transparent.png` files are optional raster exports; SVG remains the master. `index.html` provides a responsive local preview with SVG download links.

Rebuild from the repository root with `node design/wibrawl-afterimage/build.mjs`. Requires the project's Sharp dependency. The builder verifies that all lettering path geometry matches the reference before exporting.

These are comparison assets. No storefront logo has been replaced.
