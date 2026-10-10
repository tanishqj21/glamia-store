import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { ink: '#17191C', paper: '#EEEDE8', red: '#D3372D' };
// W is upright: top -> low -> high -> low -> top. Its geometry is symmetric.
const w = 'M44 60L78 204Q84 224 90 210L126 145L162 210Q168 224 174 204L208 60';
const b = 'H259L291 79Q299 85 295 94L282 113Q278 119 271 123L257 132Q247 138 257 144L291 161Q300 166 298 178L285 210Q281 219 270 223L220 244H208';
// A lower return joins the bottom of B to the start of W without crossings.
const returnRoute = 'H47Q26 244 23 224L12 76Q10 60 28 60H44';
const route = `${w}${b}${returnRoute}Z`;
const concepts = [
  { id: 'normal-b', title: 'Upright W + B', transform: 'translate(36 0)', caption: 'W on the left. Normal B on the right.' },
  { id: 'mirrored-b', title: 'Mirrored B + upright W', transform: 'translate(348 0) scale(-1 1)', caption: 'Mirrored B on the left. Upright W on the right.' },
];
function stroke(pathData, colour, width = 14) {
  return `<path d="${pathData}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function wrap(concept, artwork) {
  return concept.transform ? `<g transform="${concept.transform}">${artwork}</g>` : artwork;
}
function mark(concept, colour) { return wrap(concept, stroke(route, colour)); }
function svg(concept, colour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 304" role="img" aria-labelledby="title description">
<title id="title">WiBrawl — ${concept.title} circuit concept</title>
<desc id="description">${concept.caption} The W remains upright. The initials form turns in one closed circuit, connected by a lower return. Transparent background.</desc>
${mark(concept, colour)}
</svg>
`;
}
function trackSvg(concept) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 304" role="img" aria-labelledby="title description">
<title id="title">WiBrawl — ${concept.title} track illustration</title>
<desc id="description">${concept.caption} A continuous track illustration with red-and-white edging and a start-finish stripe.</desc>
${wrap(concept, `${stroke(route, palette.ink, 24)}${stroke(route, palette.paper, 19)}
<path d="${route}" fill="none" stroke="${palette.red}" stroke-width="19" stroke-dasharray="5 5" stroke-linejoin="round"/>
${stroke(route, palette.ink, 15)}
<path d="M238 50V70" stroke="${palette.paper}" stroke-width="4"/>
<path d="M238 51V55M238 59V63M238 67V69" stroke="${palette.ink}" stroke-width="4"/>`)}
</svg>`;
}
await fs.mkdir(directory, { recursive: true });
for (const concept of concepts) {
  for (const [suffix, colour] of [['', palette.ink], ['-paper', palette.paper], ['-red', palette.red]]) {
    await fs.writeFile(path.join(directory, `wibrawl-track-${concept.id}${suffix}.svg`), svg(concept, colour));
  }
  await fs.writeFile(path.join(directory, `wibrawl-track-${concept.id}-detail.svg`), trackSvg(concept));
  await sharp(Buffer.from(trackSvg(concept))).resize(960).flatten({ background: palette.paper }).png().toFile(path.join(directory, `${concept.id}-track.png`));
}

const shirt = 'M-56-173Q0-142 56-173L127-157L193-105L158-30L103-52L107 185Q0 198-107 185L-103-52L-158-30L-193-105L-127-157Z';
function panel(concept, index) {
  const construction = wrap(concept, `${stroke(w, palette.red, 10)}${stroke(`M208 60${b}`, palette.ink, 10)}${stroke(`M208 244${returnRoute}`, '#9E9F99', 10)}`);
  return `<g transform="translate(${index * 800} 0)">
<text x="48" y="57" font-family="Arial,sans-serif" font-size="14" letter-spacing="1.5" fill="${palette.ink}">0${index + 1} / ${index === 0 ? 'UPRIGHT W + B' : 'MIRRORED B + UPRIGHT W'}</text>
<path d="M48 80H752" stroke="#C7C7C1"/>
<g transform="translate(6 127) scale(2.05)">${mark(concept, palette.ink)}</g>
<text x="48" y="692" font-family="Arial,sans-serif" font-size="17" fill="#6A6A67">${concept.caption}</text>
<path d="M48 722H752" stroke="#C7C7C1"/>
<text x="48" y="767" font-family="Arial,sans-serif" font-size="12" letter-spacing="1.5" fill="#6A6A67">RED = UPRIGHT W / BLACK = B</text>
<g transform="translate(70 784) scale(.9)">${construction}</g>
<g transform="translate(598 934) scale(.6)"><path d="${shirt}" fill="${palette.ink}"/><path d="M-56-173Q0-142 56-173" fill="none" stroke="#3E4246" stroke-width="7"/><g transform="translate(-60 -114) scale(.36)">${mark(concept, palette.paper)}</g></g>
</g>`;
}
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1090" viewBox="0 0 1600 1090"><rect width="1600" height="1090" fill="${palette.paper}"/><path d="M800 40V1050" stroke="#C7C7C1"/>${concepts.map(panel).join('')}</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'upright-track-comparison.png'));
const applications = [];
for (const [row, concept] of concepts.entries()) {
  for (const [column, background, colour] of [[0, palette.paper, palette.ink], [1, palette.ink, palette.paper], [2, palette.paper, palette.red]]) {
    applications.push({ input: await sharp({ create: { width: 384, height: 304, channels: 4, background } }).png().toBuffer(), left: column * 384, top: row * 420 });
    applications.push({ input: await sharp(Buffer.from(svg(concept, colour))).resize(360).png().toBuffer(), left: column * 384 + 12, top: row * 420 + 9 });
  }
  for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
    applications.push({ input: await sharp(Buffer.from(svg(concept, palette.paper))).resize(size).png().toBuffer(), left: 48 + index * 180, top: row * 420 + 335 });
  }
}
await sharp({ create: { width: 1152, height: 840, channels: 4, background: palette.ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created two upright-W circuit concepts in ${directory}`);
