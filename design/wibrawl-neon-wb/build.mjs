import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { ink: '#121615', paper: '#F3F5EF', lime: '#C8FF3B', cyan: '#24DFFF', pink: '#FF4DB5' };
const concepts = [
  {
    id: 'shift', title: 'WB Shift', subtitle: 'Clipped corners. One lime accent.',
    geometry: `<path d="M28 54H63L74 141L98 102H119L138 141L156 54H190L158 199H132L109 154L84 199H56Z"/>
<path fill-rule="evenodd" d="M169 54H227L260 76L254 111L235 126L253 143L244 180L216 199H156ZM196 80L190 111H213L224 101L227 90L214 80ZM184 141L178 173H207L218 163L221 151L207 141Z"/>`,
    accents: `<path fill="${palette.lime}" d="M156 54H190L180 98H147Z"/>`,
    description: 'A compact angular WB monogram with a shared diagonal and clipped B corners. A neon lime segment interrupts the top of the shared stroke.',
  },
  {
    id: 'flow', title: 'WB Flow', subtitle: 'Fuller curves. Cyan and pink accents.',
    geometry: `<path d="M22 58Q20 38 41 38H44Q63 38 66 57L79 134L101 93Q106 84 116 84H124Q134 84 138 95L154 135L171 56Q175 38 200 38H213L177 181Q173 199 155 199H150Q136 199 130 183L117 154L103 182Q95 199 80 199H75Q57 199 52 180Z"/>
<path fill-rule="evenodd" d="M188 43L200 38H226C259 38 280 55 280 81C280 101 271 115 254 122C275 129 289 146 289 165C289 187 269 199 236 199H162ZM213 69L207 102H223C240 102 249 96 249 85C249 75 242 69 226 69ZM200 133L193 173H228C246 173 258 168 258 155C258 142 246 133 228 133Z"/>`,
    accents: `<path fill="${palette.cyan}" d="M171 56Q175 38 200 38H213L207 65H169Z"/>
<path fill="${palette.pink}" d="M226 113H269Q263 119 254 122L265 129H224Z"/>`,
    description: 'A connected WB monogram with full curves, unequal B bowls and an upright shared stroke. Neon cyan and pink segments accent the top and centre.',
  },
];
function mark(concept, base, accented = true) {
  return `<g transform="translate(8 6)"><g fill="${base}">${concept.geometry}</g>${accented ? concept.accents : ''}</g>`;
}
function svg(concept, base, accented) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 256" role="img" aria-labelledby="title description">
<title id="title">WiBrawl — ${concept.title}</title>
<desc id="description">${concept.description} ${accented ? 'Neon accent version.' : 'Single-colour version.'} Transparent background.</desc>
${mark(concept, base, accented)}
</svg>
`;
}
await fs.mkdir(directory, { recursive: true });
for (const concept of concepts) {
  for (const [suffix, colour, accented] of [['', palette.ink, true], ['-dark', palette.paper, true], ['-mono', palette.ink, false], ['-mono-light', palette.paper, false]]) {
    await fs.writeFile(path.join(directory, `wibrawl-${concept.id}${suffix}.svg`), svg(concept, colour, accented));
  }
}

const shirt = 'M-56-173Q0-142 56-173L127-157L193-105L158-30L103-52L107 185Q0 198-107 185L-103-52L-158-30L-193-105L-127-157Z';
function panel(concept, index) {
  const mainScale = index === 0 ? 2.37 : 2.15;
  const mainX = index === 0 ? 39 : 46;
  return `<g transform="translate(${index * 800} 0)">
<text x="48" y="56" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="${palette.paper}">0${index + 1} / ${concept.title.toUpperCase()}</text>
<path d="M48 80H752" stroke="#39403B"/>
<g transform="translate(${mainX} 120) scale(${mainScale})">${mark(concept, palette.paper)}</g>
<text x="48" y="681" font-family="Arial,sans-serif" font-size="19" fill="#A2ADA4">${concept.subtitle}</text>
<path d="M48 718H752" stroke="#39403B"/>
<rect x="48" y="755" width="328" height="259" fill="${palette.paper}"/>
<g transform="translate(54 766) scale(.99)">${mark(concept, palette.ink)}</g>
<g transform="translate(581 902) scale(.73)">
<path d="${shirt}" fill="#252C28"/>
<path d="M-56-173Q0-142 56-173" fill="none" stroke="#3C4840" stroke-width="7"/>
<path d="M-104 168Q0 177 104 168" fill="none" stroke="#3C4840"/>
<g transform="translate(-50 -112) scale(.34)">${mark(concept, palette.paper)}</g>
</g>
<text x="48" y="1062" font-family="Arial,sans-serif" font-size="12" letter-spacing="1" fill="#A2ADA4">CUSTOM SVG / NEON ACCENTS / MONOCHROME MASTERS INCLUDED</text>
</g>`;
}
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100"><rect width="1600" height="1100" fill="${palette.ink}"/><path d="M800 40V1060" stroke="#39403B"/>${concepts.map(panel).join('')}</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'neon-wb-comparison.png'));
const applications = [];
for (const [row, concept] of concepts.entries()) {
  for (const [column, background, base, accented] of [[0, palette.ink, palette.paper, true], [1, palette.paper, palette.ink, true], [2, palette.ink, palette.paper, false]]) {
    applications.push({ input: await sharp({ create: { width: 360, height: 290, channels: 4, background } }).png().toBuffer(), left: column * 360, top: row * 410 });
    applications.push({ input: await sharp(Buffer.from(svg(concept, base, accented))).resize(320).png().toBuffer(), left: column * 360 + 20, top: row * 410 + 17 });
  }
  for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
    applications.push({ input: await sharp(Buffer.from(svg(concept, palette.paper, true))).resize(size).png().toBuffer(), left: 48 + index * 180, top: row * 410 + 320 });
  }
}
await sharp({ create: { width: 1080, height: 820, channels: 4, background: palette.ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created two simple neon WB concepts in ${directory}`);
