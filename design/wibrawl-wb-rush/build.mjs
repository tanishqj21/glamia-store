import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { ink: '#242025', paper: '#F2EDE3', plum: '#764154' };
// The arrow is the primary silhouette. Its tail bends twice, borrowing the W's
// rhythm; two cutouts in the rising head echo the B's counters.
const outline = `M26 186C47 191 63 173 74 139L85 105Q87 100 93 100H102Q108 100 110 107L119 142L149 108Q154 102 161 102H184L170 141C200 129 222 107 241 79L209 53L324 31L307 155L277 125C249 163 212 191 163 204L173 165L127 207Q108 223 96 204L83 173C66 208 47 225 24 216Z`;
const counters = `M262 62L288 58L284 82L266 84ZM243 93L265 97L257 117L231 117Z`;
function mark(colour) { return `<path fill="${colour}" fill-rule="evenodd" d="${outline}${counters}"/>`; }
function svg(colour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 256" role="img" aria-labelledby="title description">
<title id="title">Wibrawl — WB Rush arrow concept</title>
<desc id="description">A sweeping arrow rising to the right, with an irregular double-bend tail inspired by W and two open cutouts inspired by B. One filled vector path with a transparent background.</desc>
${mark(colour)}
</svg>
`;
}
await fs.mkdir(directory, { recursive: true });
for (const [suffix, colour] of [['', palette.ink], ['-paper', palette.paper], ['-plum', palette.plum]]) {
  await fs.writeFile(path.join(directory, `wibrawl-wb-rush${suffix}.svg`), svg(colour));
}

const shirt = 'M-56-173Q0-142 56-173L127-157L193-105L158-30L103-52L107 185Q0 198-107 185L-103-52L-158-30L-193-105L-127-157Z';
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="960" viewBox="0 0 1440 960">
<rect width="1440" height="960" fill="${palette.paper}"/>
<text x="64" y="62" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="${palette.ink}">WIBRAWL / WB RUSH</text>
<text x="1376" y="62" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#7B7274">ARROW CONCEPT</text>
<path d="M64 87H1376" stroke="#D0C6C2"/>
<g transform="translate(6 148) scale(2.34)">${mark(palette.ink)}</g>
<g transform="translate(1102 353) scale(1.05)">
<path d="${shirt}" fill="${palette.ink}"/>
<path d="M-56-173Q0-142 56-173" fill="none" stroke="#4A434B" stroke-width="7"/>
<path d="M-104 168Q0 177 104 168" fill="none" stroke="#4A434B"/>
<g transform="translate(-100 -95) scale(.58)">${mark(palette.paper)}</g>
</g>
<text x="64" y="739" font-family="Arial,sans-serif" font-size="48" font-weight="700" letter-spacing="-1.5" fill="${palette.ink}">WB, with some swing.</text>
<text x="65" y="780" font-family="Arial,sans-serif" font-size="18" fill="#7B7274">A rising arrow. A restless tail. The initials tucked into the shape.</text>
<g transform="translate(1119 688)"><rect width="147" height="98" fill="${palette.plum}"/><rect x="6" y="6" width="135" height="86" fill="none" stroke="#A17387" stroke-dasharray="3 3"/><g transform="translate(9 5) scale(.36)">${mark(palette.paper)}</g></g>
<path d="M64 826H1376" stroke="#D0C6C2"/>
<g transform="translate(64 862) scale(.075)">${mark(palette.ink)}</g>
<g transform="translate(126 853) scale(.12)">${mark(palette.ink)}</g>
<g transform="translate(206 844) scale(.18)">${mark(palette.ink)}</g>
<g transform="translate(305 831) scale(.26)">${mark(palette.ink)}</g>
<text x="1376" y="900" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#7B7274">CUSTOM PATH / SINGLE COLOUR / SVG</text>
</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'wb-rush-preview.png'));
await sharp(Buffer.from(svg(palette.ink))).resize(880).flatten({ background: palette.paper }).png().toFile(path.join(directory, 'logo-preview.png'));

const applications = [];
for (const [index, background, colour] of [[0, palette.paper, palette.ink], [1, palette.ink, palette.paper], [2, palette.paper, palette.plum]]) {
  applications.push({ input: await sharp({ create: { width: 360, height: 280, channels: 4, background } }).png().toBuffer(), left: index * 360, top: 0 });
  applications.push({ input: await sharp(Buffer.from(svg(colour))).resize(330).png().toBuffer(), left: index * 360 + 15, top: 20 });
}
for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
  applications.push({ input: await sharp(Buffer.from(svg(palette.paper))).resize(size).png().toBuffer(), left: 48 + index * 180, top: 316 });
}
await sharp({ create: { width: 1080, height: 410, channels: 4, background: palette.ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created WB Rush SVG concept and previews in ${directory}`);
