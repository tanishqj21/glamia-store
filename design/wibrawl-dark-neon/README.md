# WiBrawl — dark base with neon accents

The approved Shift and Flow WB shapes, retaining their geometry and using a main dark colour with balanced neon sections.

- Charcoal green `#3B4C40`: main body, in the website Gaming theme's green-black family.
- Neon blue `#24DFFF`: left stroke section.
- Neon yellow `#D7FF45`: shared upright and a lower B section.
- Neon pink `#FF4DB5`: a small corner detail.

Pink occupies substantially less of each mark than yellow. The generator checks approximate opaque-pixel colour shares to verify that the dark body remains the main colour.

`wibrawl-shift.svg` and `wibrawl-flow.svg` have transparent backgrounds and counters. They use vector clipping to preserve the approved silhouettes exactly. No added border, glow, gradient, font dependency or embedded raster image.

`dark-neon-comparison.png` shows enlarged marks on the Gaming theme, static header mockups, and the same artwork on the Sports theme. Actual website background colours are taken from `react-app/src/wibrawl.css`. `applications.png` includes small-size studies.

Run `node design/wibrawl-dark-neon/build.mjs` from the repository root. The build reads the approved geometry in `design/wibrawl-neon-wb`.

These are proposals, not deployed logos or trademark-cleared marks.
