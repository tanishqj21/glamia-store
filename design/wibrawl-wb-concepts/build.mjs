import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const ink = '#242320';
const paper = '#F1EDE4';
const accent = '#B84430';

const concepts = [
  {
    id: 'wb-forward', title: 'WB Forward', number: '01',
    subtitle: 'W in the tail. B in the arrowhead.',
    description: 'A custom W joins a pointed B to form a forward arrow. Two open counters reveal the B inside the arrowhead. Single-colour filled vector paths on a transparent background.',
    geometry: `<path d="M16 51H45L64 150L87 87H110L132 150L151 51H181L148 205H123L98 137L74 205H47Z"/>
<path fill-rule="evenodd" d="M162 51H201L289 128L201 205H162ZM185 76V108H229L198 76ZM185 148V180H198L229 148Z"/>`,
  },
  {
    id: 'wb-club', title: 'WB Club', number: '02',
    subtitle: 'Two initials. One shared stroke.',
    description: 'A compact WB monogram drawn from custom rounded outlines. The W and B meet at a shared upright, with two curved counters in the B. Single-colour filled vector paths on a transparent background.',
    geometry: `<g transform="translate(22 0) skewX(-7)">
<path d="M22 51H53L70 143L92 92Q94 87 100 87H114Q120 87 122 93L141 143L158 51H189L156 195Q154 205 144 205H131Q122 205 119 196L106 157L89 196Q86 205 77 205H64Q54 205 52 195Z"/>
<path fill-rule="evenodd" d="M165 51H216C250 51 269 67 269 91C269 108 261 119 248 126C266 132 276 146 276 164C276 190 256 205 222 205H165ZM194 78V111H213C230 111 239 105 239 94C239 84 231 78 214 78ZM194 141V178H218C236 178 246 173 246 159C246 147 236 141 218 141Z"/>
</g>`,
  },
];

function mark(concept, colour) { return `<g fill="${colour}">${concept.geometry}</g>`; }
function svg(concept, colour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 256" role="img" aria-labelledby="logo-title logo-description">
<title id="logo-title">Wibrawl — ${concept.title}</title>
<desc id="logo-description">${concept.description}</desc>
${mark(concept, colour)}
</svg>
`;
}

const shirt = 'M-56-173Q0-142 56-173L127-157L193-105L158-30L103-52L107 185Q0 198-107 185L-103-52L-158-30L-193-105L-127-157Z';
function board(concept) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="940" viewBox="0 0 1440 940">
<rect width="1440" height="940" fill="${paper}"/>
<text x="64" y="61" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="${ink}">WIBRAWL / ${concept.number}</text>
<text x="1376" y="61" text-anchor="end" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="${ink}">${concept.title.toUpperCase()}</text>
<path d="M64 87H1376" stroke="#CDC7BC"/>
<g transform="translate(30 185) scale(2.35)">${mark(concept, ink)}</g>
<g transform="translate(1080 355) scale(1.12)">
<path d="${shirt}" fill="${ink}"/>
<path d="M-56-173Q0-142 56-173" fill="none" stroke="#48453F" stroke-width="7"/>
<path d="M-104 168Q0 177 104 168" fill="none" stroke="#48453F"/>
<g transform="translate(14 -110) scale(.185)">${mark(concept, paper)}</g>
</g>
<text x="64" y="728" font-family="Arial,sans-serif" font-size="48" font-weight="700" letter-spacing="-1.5" fill="${ink}">${concept.title}.</text>
<text x="65" y="770" font-family="Arial,sans-serif" font-size="18" fill="#767168">${concept.subtitle}</text>
<g transform="translate(1097 680)"><rect width="146" height="92" fill="${accent}"/><rect x="6" y="6" width="134" height="80" fill="none" stroke="#D47662" stroke-dasharray="3 3"/><g transform="translate(16 1) scale(.35)">${mark(concept, paper)}</g></g>
<path d="M64 815H1376" stroke="#CDC7BC"/>
<g transform="translate(64 852) scale(.075)">${mark(concept, ink)}</g>
<g transform="translate(120 847) scale(.10)">${mark(concept, ink)}</g>
<g transform="translate(181 839) scale(.15)">${mark(concept, ink)}</g>
<g transform="translate(260 828) scale(.225)">${mark(concept, ink)}</g>
<text x="1376" y="881" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#767168">CUSTOM OUTLINES / SINGLE COLOUR / SVG</text>
</svg>`;
}

await fs.mkdir(directory, { recursive: true });
for (const concept of concepts) {
  for (const [suffix, colour] of [['', ink], ['-paper', paper], ['-rust', accent]]) {
    await fs.writeFile(path.join(directory, `wibrawl-${concept.id}${suffix}.svg`), svg(concept, colour));
  }
  await sharp(Buffer.from(board(concept))).png().toFile(path.join(directory, `${concept.id}-preview.png`));
}

// Scale studies use the actual SVG masters, not a simplified replacement.
const applications = [];
for (const [row, concept] of concepts.entries()) {
  for (const [column, background, colour] of [[0, paper, ink], [1, ink, paper], [2, paper, accent]]) {
    applications.push({ input: await sharp({ create: { width: 360, height: 280, channels: 4, background } }).png().toBuffer(), left: column * 360, top: row * 400 });
    applications.push({ input: await sharp(Buffer.from(svg(concept, colour))).resize(320, 256).png().toBuffer(), left: column * 360 + 20, top: row * 400 + 12 });
  }
  for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
    applications.push({ input: await sharp(Buffer.from(svg(concept, paper))).resize(size).png().toBuffer(), left: 48 + index * 180, top: row * 400 + 316 });
  }
}
await sharp({ create: { width: 1080, height: 800, channels: 4, background: ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created two WB logo concepts in ${directory}`);
