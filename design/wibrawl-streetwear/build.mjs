import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { ink: '#22211F', bone: '#F0E9DD', oxblood: '#7C242D' };
// One original, intentionally asymmetric drawn line. No type or stock symbols.
const gesture = 'M58 176C31 187 27 161 39 140C55 110 109 88 158 93C193 97 208 122 184 157C167 184 138 208 122 193C104 176 110 119 119 78C129 34 154 26 166 50C180 76 159 110 126 126C84 147 40 137 42 105C43 72 77 64 107 82C145 105 174 158 197 182C208 194 221 190 222 177';
function mark(colour) {
  return `<path d="${gesture}" fill="none" stroke="${colour}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function svg(colour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="mark-title mark-description">
<title id="mark-title">Wibrawl — Wild Thread</title>
<desc id="mark-description">One loose continuous line loops back through itself to form an asymmetric thread knot. An expressive, wordless single-colour mark for casual clothing and streetwear. Transparent background.</desc>
${mark(colour)}
</svg>
`;
}
await fs.mkdir(directory, { recursive: true });
for (const [name, colour] of [['wibrawl-logo.svg', palette.ink], ['wibrawl-logo-bone.svg', palette.bone], ['wibrawl-logo-oxblood.svg', palette.oxblood]]) {
  await fs.writeFile(path.join(directory, name), svg(colour));
}
await sharp(Buffer.from(svg(palette.ink))).resize(600).extend({ left: 100, right: 100, top: 40, bottom: 40, background: palette.bone }).flatten({ background: palette.bone }).png().toFile(path.join(directory, 'logo-preview.png'));
// Native vector placement studies use the exact logo geometry, not a generated approximation.
const tee = 'M-55-175Q0-145 55-175L125-160L195-105L157-24L104-49L107 185Q0 198-107 185L-104-49L-157-24L-195-105L-125-160Z';
const clothingStudy = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="880" viewBox="0 0 1400 880">
<rect width="1400" height="880" fill="${palette.bone}"/>
<path d="M72 104H1328" stroke="#C8C1B5"/>
<text x="72" y="76" font-family="Arial,sans-serif" font-size="14" letter-spacing="3" fill="${palette.ink}">WIBRAWL / WILD THREAD</text>
<text x="1328" y="76" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#787369">SYMBOL STUDY</text>
<g transform="translate(74 170) scale(2.15)">${mark(palette.ink)}</g>
<g transform="translate(996 396) scale(1.18)">
<path d="${tee}" fill="${palette.ink}"/>
<path d="M-55-175Q0-145 55-175" fill="none" stroke="#484540" stroke-width="7"/>
<path d="M-104 158Q0 170 104 158M-157-24L-195-105M157-24L195-105" fill="none" stroke="#484540" stroke-width="1.4"/>
<g transform="translate(-30 -83) scale(.24)">${mark(palette.bone)}</g>
</g>
<g transform="translate(929 697)"><rect width="132" height="88" fill="${palette.oxblood}"/><path d="M7 7H125V81H7Z" fill="none" stroke="#A3565C" stroke-width="1" stroke-dasharray="3 3"/><g transform="translate(35 10) scale(.27)">${mark(palette.bone)}</g></g>
<text x="72" y="824" font-family="Arial,sans-serif" font-size="15" fill="#787369">A loose line. A shared thread.</text>
<text x="1328" y="824" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#787369">INK / BONE / OXBLOOD</text>
</svg>`;
await sharp(Buffer.from(clothingStudy)).png().toFile(path.join(directory, 'streetwear-preview.png'));
const applications = [];
for (const [index, background, colour] of [[0, palette.bone, palette.ink], [1, palette.ink, palette.bone], [2, palette.bone, palette.oxblood]]) {
  applications.push({ input: await sharp({ create: { width: 320, height: 320, channels: 4, background } }).png().toBuffer(), left: index * 320, top: 0 });
  applications.push({ input: await sharp(Buffer.from(svg(colour))).resize(256).png().toBuffer(), left: index * 320 + 32, top: 32 });
}
for (const [index, size] of [24, 32, 48, 64].entries()) {
  applications.push({ input: await sharp(Buffer.from(svg(palette.bone))).resize(size).png().toBuffer(), left: 48 + index * 130, top: 370 });
}
await sharp({ create: { width: 960, height: 470, channels: 4, background: palette.ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created vector artwork in ${directory}`);
