# Wibrawl — Wild Thread

A wordless streetwear identity built around one loose, continuous ink line. It folds through itself into an asymmetric knot with open ends. The thread references clothing and the way different interests and people connect; its relaxed drawing gives the mark a personal, expressive character.

This direction deliberately uses a single ink per application. The palette is warm black `#22211F`, bone `#F0E9DD` and oxblood `#7C242D`.

## Files

- `wibrawl-logo.svg`: warm-black master on a transparent canvas.
- `wibrawl-logo-bone.svg`: reversed bone version for dark fabric and backgrounds.
- `wibrawl-logo-oxblood.svg`: oxblood version on a transparent canvas.
- `logo-preview.png`: large presentation preview of the master.
- `streetwear-preview.png`: placement study on an oversized tee and a woven label.
- `applications.png`: colour applications and small-size checks.
- `build.mjs`: original vector source and reproducible previews.

The logo is genuine SVG geometry with no raster images, fonts, effects or external resources. Its rounded stroke remains vector artwork; outline the stroke in a vector editor if a printer requests filled outlines. Keep its proportions and clear space. Recommended digital minimum: 32 px; a physical printer should confirm line thickness and embroidery suitability at the final size.

The clothing and label illustrations are vector placement studies using the exact logo, not product photographs. Preview labels and captions are presentation text outside the logo. The storefront has not been changed. Previous proposals remain in their original folders.

Rebuild from the repository root with `node design/wibrawl-streetwear/build.mjs` using the project's Sharp dependency.
