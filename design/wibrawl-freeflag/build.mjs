import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { ink: '#242320', paper: '#F1EDE4', rust: '#BA462D' };
// A broad, wind-bent flag with a falling lower corner and an open fly edge.
// All artwork is filled vector geometry; the flag has no pole or lettering.
const outline = 'M49 43C80 28 106 26 137 39C167 51 185 50 213 34L197 111L163 133L181 151L169 215C138 227 112 222 85 210C66 201 51 202 32 212L47 139L76 116L40 101Z';
function mark(colour) { return `<path d="${outline}" fill="${colour}"/>`; }
function svg(colour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title description">
<title id="title">Wibrawl — Free Flag concept</title>
<desc id="description">A single windswept flag silhouette with curved edges, opposed cuts and an asymmetric trailing corner. A wordless symbol of shared energy. Transparent background.</desc>
${mark(colour)}
</svg>
`;
}
await fs.mkdir(directory, { recursive: true });
for (const [name, colour] of [['wibrawl-freeflag.svg', palette.ink], ['wibrawl-freeflag-paper.svg', palette.paper], ['wibrawl-freeflag-rust.svg', palette.rust]]) {
  await fs.writeFile(path.join(directory, name), svg(colour));
}

const shirt = 'M-56-173Q0-142 56-173L127-157L193-105L158-30L103-52L107 185Q0 198-107 185L-103-52L-158-30L-193-105L-127-157Z';
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000" viewBox="0 0 1440 1000">
<rect width="1440" height="1000" fill="${palette.paper}"/>
<text x="64" y="62" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="${palette.ink}">WIBRAWL / FREE FLAG</text>
<text x="1376" y="62" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#767168">LOGO CONCEPT</text>
<path d="M64 87H1376" stroke="#CDC7BC"/>
<g transform="translate(36 116) scale(2.42)">${mark(palette.ink)}</g>
<g transform="translate(1060 370) scale(1.25)">
<path d="${shirt}" fill="${palette.ink}"/>
<path d="M-56-173Q0-142 56-173" fill="none" stroke="#46443F" stroke-width="7"/>
<path d="M-104 168Q0 177 104 168" fill="none" stroke="#46443F"/>
<g transform="translate(17 -112) scale(.20)">${mark(palette.paper)}</g>
</g>
<text x="64" y="767" font-family="Arial,sans-serif" font-size="48" font-weight="700" letter-spacing="-1.5" fill="${palette.ink}">Something to rally behind.</text>
<text x="65" y="808" font-family="Arial,sans-serif" font-size="18" fill="#767168">A little restless. A little defiant. Still here.</text>
<g transform="translate(1115 717)"><rect width="130" height="94" fill="${palette.rust}"/><rect x="6" y="6" width="118" height="82" fill="none" stroke="#D47662" stroke-dasharray="3 3"/><g transform="translate(20 2) scale(.35)">${mark(palette.paper)}</g></g>
<path d="M64 856H1376" stroke="#CDC7BC"/>
<g transform="translate(66 889) scale(.08)">${mark(palette.ink)}</g>
<g transform="translate(123 882) scale(.12)">${mark(palette.ink)}</g>
<g transform="translate(187 875) scale(.17)">${mark(palette.ink)}</g>
<g transform="translate(263 866) scale(.23)">${mark(palette.ink)}</g>
<text x="1376" y="925" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#767168">ONE SHAPE / ONE COLOUR / VECTOR</text>
</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'freeflag-preview.png'));
await sharp(Buffer.from(svg(palette.ink))).resize(560).extend({ top: 36, bottom: 36, left: 130, right: 130, background: palette.paper }).flatten({ background: palette.paper }).png().toFile(path.join(directory, 'logo-preview.png'));

const applications = [];
for (const [index, background, colour] of [[0, palette.paper, palette.ink], [1, palette.ink, palette.paper], [2, palette.paper, palette.rust]]) {
  applications.push({ input: await sharp({ create: { width: 320, height: 320, channels: 4, background } }).png().toBuffer(), left: index * 320, top: 0 });
  applications.push({ input: await sharp(Buffer.from(svg(colour))).resize(256).png().toBuffer(), left: index * 320 + 32, top: 32 });
}
for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
  applications.push({ input: await sharp(Buffer.from(svg(palette.paper))).resize(size).png().toBuffer(), left: 48 + index * 130, top: 370 });
}
await sharp({ create: { width: 960, height: 470, channels: 4, background: palette.ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created Free Flag SVG concept and previews in ${directory}`);
