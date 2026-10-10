import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { ink: '#17191C', paper: '#EEEDE8', red: '#D3372D' };
const concepts = [
  {
    id: 'overtake', title: 'Overtake', label: 'ARROW / WB',
    description: 'An angular arrow silhouette formed from a clipped double-fold W tail and a pointed B-inspired head. An open diagonal divides the two forward lobes. Single-colour vector geometry.',
    geometry: `<path d="M24 69H59L72 140L106 97H133L141 140L175 43H210L165 194H130L114 147L78 194H46Z"/>
<path fill-rule="evenodd" d="M190 43H242L310 115L235 194H163L176 151H226L246 129H191L201 101H248L229 79H180Z"/>`,
  },
  {
    id: 'chicane', title: 'Chicane', label: 'INTERLOCK / WB',
    description: 'A WB emblem with staggered heights, shared diagonal structure, angular B counters and a long lower return beneath the W. Custom filled vector outlines with transparent negative spaces.',
    geometry: `<path d="M28 62H62L69 148L103 99H128L141 147L175 36H209L162 191H128L111 145L78 191H45Z"/>
<path fill-rule="evenodd" d="M181 36H254L294 63L287 102L264 122L281 138L269 180L223 214H34L42 200H142L186 181H226L241 167L246 148H177ZM207 68L197 102H234L254 88L257 78L242 68Z"/>`,
  },
];
function mark(concept, colour) {
  return `<g fill="${colour}" transform="translate(9 4) rotate(-5 167 128)">${concept.geometry}</g>`;
}
function svg(concept, colour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 256" role="img" aria-labelledby="title description">
<title id="title">Wibrawl — ${concept.title} concept</title>
<desc id="description">${concept.description}</desc>
${mark(concept, colour)}
</svg>
`;
}

const shirt = 'M-56-173Q0-142 56-173L127-157L193-105L158-30L103-52L107 185Q0 198-107 185L-103-52L-158-30L-193-105L-127-157Z';
function panel(concept, index) {
  const x = index * 800;
  return `<g transform="translate(${x} 0)">
<text x="56" y="58" font-family="Arial,sans-serif" font-size="13" letter-spacing="2.5" fill="${palette.ink}">0${index + 1} / ${concept.title.toUpperCase()}</text>
<text x="744" y="58" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="#6A6A67">${concept.label}</text>
<path d="M56 81H744" stroke="#C7C7C1"/>
<g transform="translate(26 110) scale(2.12)">${mark(concept, palette.ink)}</g>
<text x="56" y="647" font-family="Arial,sans-serif" font-size="34" font-weight="700" letter-spacing="-1" fill="${palette.ink}">${concept.title}.</text>
<path d="M56 677H744" stroke="#C7C7C1"/>
<g transform="translate(247 890) scale(.77)">
<path d="${shirt}" fill="${palette.ink}"/>
<path d="M-56-173Q0-142 56-173" fill="none" stroke="#3E4246" stroke-width="7"/>
<path d="M-104 168Q0 177 104 168" fill="none" stroke="#3E4246"/>
<g transform="translate(-64 -116) scale(.365)">${mark(concept, palette.paper)}</g>
</g>
<g transform="translate(531 747)"><rect width="170" height="110" fill="${palette.red}"/><rect x="7" y="7" width="156" height="96" fill="none" stroke="#E56C65" stroke-dasharray="3 3"/><g transform="translate(12 1) scale(.43)">${mark(concept, palette.paper)}</g></g>
<g transform="translate(529 920) scale(.07)">${mark(concept, palette.ink)}</g>
<g transform="translate(585 909) scale(.13)">${mark(concept, palette.ink)}</g>
<g transform="translate(653 897) scale(.20)">${mark(concept, palette.ink)}</g>
<text x="56" y="1090" font-family="Arial,sans-serif" font-size="12" letter-spacing="1.2" fill="#6A6A67">CUSTOM OUTLINES / ONE COLOUR / SVG</text>
</g>`;
}
await fs.mkdir(directory, { recursive: true });
for (const concept of concepts) {
  for (const [suffix, colour] of [['', palette.ink], ['-paper', palette.paper], ['-red', palette.red]]) {
    await fs.writeFile(path.join(directory, `wibrawl-${concept.id}${suffix}.svg`), svg(concept, colour));
  }
  await sharp(Buffer.from(svg(concept, palette.ink))).resize(880).flatten({ background: palette.paper }).png().toFile(path.join(directory, `${concept.id}-logo.png`));
}
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1140" viewBox="0 0 1600 1140"><rect width="1600" height="1140" fill="${palette.paper}"/><path d="M800 40V1100" stroke="#C7C7C1"/>${concepts.map(panel).join('')}</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'comparison.png'));
const applications = [];
for (const [row, concept] of concepts.entries()) {
  for (const [column, background, colour] of [[0, palette.paper, palette.ink], [1, palette.ink, palette.paper], [2, palette.paper, palette.red]]) {
    applications.push({ input: await sharp({ create: { width: 360, height: 280, channels: 4, background } }).png().toBuffer(), left: column * 360, top: row * 400 });
    applications.push({ input: await sharp(Buffer.from(svg(concept, colour))).resize(330).png().toBuffer(), left: column * 360 + 15, top: row * 400 + 20 });
  }
  for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
    applications.push({ input: await sharp(Buffer.from(svg(concept, palette.paper))).resize(size).png().toBuffer(), left: 48 + index * 180, top: row * 400 + 316 });
  }
}
await sharp({ create: { width: 1080, height: 800, channels: 4, background: palette.ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created two motorsport logo studies in ${directory}`);
