import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { ink: '#17191C', paper: '#EEEDE8', red: '#D3372D' };
// A clockwise quarter-turn turns W's down-up-down into left-right-left.
// Those turns replace B's straight back; B supplies the two right-hand lobes.
// One closed, uninterrupted course, with no crossings or branch junctions.
const b = 'M148 40H215C258 40 287 60 287 93C287 119 266 134 241 144C276 154 297 173 297 199C297 230 269 248 224 248H148';
const w = 'L59 196Q48 189 57 180L104 148Q111 143 104 137L57 98Q48 89 59 84L148 40';
const course = `${b}${w}Z`;
function mark(colour, width = 15) {
  return `<path d="${course}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function svg(colour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 288" role="img" aria-labelledby="title description">
<title id="title">Wibrawl — WB Circuit concept</title>
<desc id="description">One continuous closed racing circuit. A W rotated ninety degrees clockwise forms the left-side chicanes, while B forms the two sweeping right-side lobes. Transparent background.</desc>
${mark(colour)}
</svg>
`;
}
await fs.mkdir(directory, { recursive: true });
for (const [suffix, colour] of [['', palette.ink], ['-paper', palette.paper], ['-red', palette.red]]) {
  await fs.writeFile(path.join(directory, `wibrawl-circuit${suffix}.svg`), svg(colour));
}

// A separate presentation-only circuit treatment. The master remains uncluttered.
const track = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 288" role="img" aria-labelledby="title description">
<title id="title">Wibrawl — WB Circuit track illustration</title>
<desc id="description">The same WB circuit route with red-and-white track edging and a start-finish stripe. An illustration variant for larger displays.</desc>
${mark(palette.ink, 25)}${mark(palette.paper, 20)}
<path d="${course}" fill="none" stroke="${palette.red}" stroke-width="20" stroke-dasharray="5 5" stroke-linejoin="round"/>
${mark(palette.ink, 16)}
<path d="M189 30V50" stroke="#EEEDE8" stroke-width="4"/>
<path d="M189 31V35M189 39V43M189 47V49" stroke="${palette.ink}" stroke-width="4"/>
</svg>`;
await fs.writeFile(path.join(directory, 'wibrawl-circuit-track.svg'), track);

const shirt = 'M-56-173Q0-142 56-173L127-157L193-105L158-30L103-52L107 185Q0 198-107 185L-103-52L-158-30L-193-105L-127-157Z';
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1080" viewBox="0 0 1600 1080">
<rect width="1600" height="1080" fill="${palette.paper}"/>
<text x="64" y="61" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="${palette.ink}">WIBRAWL / WB CIRCUIT</text>
<text x="1536" y="61" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#6A6A67">A TRACK BUILT FROM THE INITIALS</text>
<path d="M64 87H1536" stroke="#C7C7C1"/>
<g transform="translate(10 127) scale(2.5)">${mark(palette.ink)}</g>
<text x="64" y="880" font-family="Arial,sans-serif" font-size="44" font-weight="700" letter-spacing="-1" fill="${palette.ink}">We have our own circuit.</text>
<text x="66" y="922" font-family="Arial,sans-serif" font-size="18" fill="#6A6A67">Rotated W turns. B-shaped loops. One continuous route.</text>
<path d="M920 126V958" stroke="#C7C7C1"/>
<text x="977" y="156" font-family="Arial,sans-serif" font-size="12" letter-spacing="2" fill="#6A6A67">THE CONSTRUCTION</text>
<g transform="translate(988 174) scale(1.22)">
<path d="${b}" fill="none" stroke="${palette.ink}" stroke-width="12" stroke-linecap="round"/>
<path d="M148 248${w}" fill="none" stroke="${palette.red}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<text x="977" y="553" font-family="Arial,sans-serif" font-size="16" fill="${palette.red}">W rotated 90° clockwise</text>
<text x="1536" y="553" text-anchor="end" font-family="Arial,sans-serif" font-size="16" fill="${palette.ink}">B</text>
<path d="M977 577H1536" stroke="#C7C7C1"/>
<g transform="translate(1158 795) scale(.79)">
<path d="${shirt}" fill="${palette.ink}"/>
<path d="M-56-173Q0-142 56-173" fill="none" stroke="#3E4246" stroke-width="7"/>
<path d="M-104 168Q0 177 104 168" fill="none" stroke="#3E4246"/>
<g transform="translate(-60 -109) scale(.32)">${mark(palette.paper)}</g>
</g>
<g transform="translate(1366 668)"><rect width="146" height="120" fill="${palette.red}"/><rect x="7" y="7" width="132" height="106" fill="none" stroke="#E56C65" stroke-dasharray="3 3"/><g transform="translate(5 4) scale(.39)">${mark(palette.paper)}</g></g>
<g transform="translate(1362 844) scale(.1)">${mark(palette.ink)}</g>
<g transform="translate(1423 833) scale(.17)">${mark(palette.ink)}</g>
<g transform="translate(1491 822) scale(.24)">${mark(palette.ink)}</g>
<path d="M64 977H1536" stroke="#C7C7C1"/>
<text x="64" y="1023" font-family="Arial,sans-serif" font-size="13" letter-spacing="1" fill="#6A6A67">ONE CLOSED PATH / SINGLE COLOUR / SVG</text>
</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'circuit-preview.png'));
await sharp(Buffer.from(svg(palette.ink))).resize(880).flatten({ background: palette.paper }).png().toFile(path.join(directory, 'logo-preview.png'));
await sharp(Buffer.from(track)).resize(880).flatten({ background: palette.paper }).png().toFile(path.join(directory, 'track-preview.png'));

const applications = [];
for (const [index, background, colour] of [[0, palette.paper, palette.ink], [1, palette.ink, palette.paper], [2, palette.paper, palette.red]]) {
  applications.push({ input: await sharp({ create: { width: 360, height: 300, channels: 4, background } }).png().toBuffer(), left: index * 360, top: 0 });
  applications.push({ input: await sharp(Buffer.from(svg(colour))).resize(330).png().toBuffer(), left: index * 360 + 15, top: 15 });
}
for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
  applications.push({ input: await sharp(Buffer.from(svg(palette.paper))).resize(size).png().toBuffer(), left: 48 + index * 180, top: 335 });
}
await sharp({ create: { width: 1080, height: 430, channels: 4, background: palette.ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created WB Circuit SVG concept and studies in ${directory}`);
