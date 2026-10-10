# Wibrawl — WB Circuit

A racing circuit built from WB. The W is rotated 90 degrees clockwise and supplies the left-side chicanes; B supplies the two right-side lobes. Together they form one closed route without crossings or branch junctions.

The geometry is custom-drawn from the initials, not traced from an existing racing venue. No racing-series logo or wordmark appears in the artwork.

## Deliverables

- `wibrawl-circuit.svg`: single-colour ink master
- `wibrawl-circuit-paper.svg`: light version
- `wibrawl-circuit-red.svg`: optional red version
- `wibrawl-circuit-track.svg`: larger illustration with red-and-white edging and a start/finish stripe
- `circuit-preview.png`: concept, construction, tee and label studies
- `logo-preview.png`: enlarged master
- `track-preview.png`: enlarged road illustration
- `applications.png`: reversals and 16–64 px studies
- `build.mjs`: reproducible SVG geometry and PNG previews

The master consists of one closed SVG path with a round stroke. No fonts, embedded raster content or background plate. The detailed track treatment is for larger displays, not small logo use.

Run `node design/wibrawl-circuit/build.mjs` from the repository root.

This is a proposed identity, not a trademark-cleared mark. It is not installed in the storefront.
