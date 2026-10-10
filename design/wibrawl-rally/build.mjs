import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { ink: '#242422', chalk: '#F2EEE5', ember: '#ED5838' };
// An original filled outline: two falls, two recoveries, a higher final rise.
// The W belongs to "We". Unequal arms keep the gesture moving forward.
const rally = 'M34 82Q31 72 42 68L58 61Q70 57 74 72L93 151L118 99Q124 87 138 94L147 99Q153 102 155 110L164 143L189 45Q192 31 206 35L221 39Q232 42 229 55L190 204Q186 219 173 216L156 213Q149 211 145 203L128 163L106 207Q101 219 88 215L70 209Q62 207 59 196Z';
function mark(colour) {
  return `<path d="${rally}" fill="${colour}"/>`;
}
function svg(colour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="rally-title rally-description">
<title id="rally-title">Wibrawl — Rally mark</title>
<desc id="rally-description">A wordless W-shaped gesture for We Brawl. Two dips recover into rising strokes, with the final arm reaching higher. A simple single-colour symbol for the joy of staying in the game together. Transparent background.</desc>
${mark(colour)}
</svg>
`;
}
await fs.mkdir(directory, { recursive: true });
for (const [file, colour] of [['wibrawl-rally.svg', palette.ink], ['wibrawl-rally-chalk.svg', palette.chalk], ['wibrawl-rally-ember.svg', palette.ember]]) {
  await fs.writeFile(path.join(directory, file), svg(colour));
}
await sharp(Buffer.from(svg(palette.ink))).resize(540).extend({ top: 42, bottom: 42, left: 130, right: 130, background: palette.chalk }).flatten({ background: palette.chalk }).png().toFile(path.join(directory, 'logo-preview.png'));

// Presentation captions are outside the logo. All mockups use the exact SVG paths.
const shirt = 'M-56-173Q0-142 56-173L127-157L193-105L158-30L103-52L107 185Q0 198-107 185L-103-52L-158-30L-193-105L-127-157Z';
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="960" viewBox="0 0 1440 960">
<rect width="1440" height="960" fill="${palette.chalk}"/>
<text x="72" y="74" font-family="Arial,sans-serif" font-size="14" letter-spacing="2.5" fill="${palette.ink}">WIBRAWL / RALLY</text>
<text x="1368" y="74" text-anchor="end" font-family="Arial,sans-serif" font-size="14" fill="#797970">WE BRAWL. WE COME BACK.</text>
<path d="M72 102H1368" stroke="#CCC9C0"/>
<g transform="translate(63 140) scale(2.15)">${mark(palette.ink)}</g>
<g transform="translate(1040 375) scale(1.18)">
<path d="${shirt}" fill="${palette.ink}"/>
<path d="M-56-173Q0-142 56-173" fill="none" stroke="#45453F" stroke-width="7"/>
<path d="M-104 168Q0 177 104 168" fill="none" stroke="#45453F" stroke-width="1.2"/>
<g transform="translate(-35 -93) scale(.27)">${mark(palette.chalk)}</g>
</g>
<text x="72" y="730" font-family="Arial,sans-serif" font-size="40" font-weight="700" letter-spacing="-1" fill="${palette.ink}">Still in the game.</text>
<text x="72" y="768" font-family="Arial,sans-serif" font-size="17" fill="#797970">Two dips. Two recoveries. A higher finish.</text>
<g transform="translate(984 697)"><rect width="118" height="84" fill="${palette.ember}"/><path d="M7 7H111V77H7Z" fill="none" stroke="#F18873" stroke-width="1" stroke-dasharray="3 3"/><g transform="translate(24 7) scale(.27)">${mark(palette.chalk)}</g></g>
<path d="M72 825H1368" stroke="#CCC9C0"/>
<g transform="translate(72 860) scale(.10)">${mark(palette.ink)}</g>
<g transform="translate(120 850) scale(.15)">${mark(palette.ink)}</g>
<g transform="translate(182 840) scale(.20)">${mark(palette.ink)}</g>
<text x="1368" y="889" text-anchor="end" font-family="Arial,sans-serif" font-size="13" fill="#797970">INK / CHALK / EMBER</text>
</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'rally-preview.png'));
const applications = [];
for (const [index, background, colour] of [[0, palette.chalk, palette.ink], [1, palette.ink, palette.chalk], [2, palette.chalk, palette.ember]]) {
  applications.push({ input: await sharp({ create: { width: 320, height: 320, channels: 4, background } }).png().toBuffer(), left: index * 320, top: 0 });
  applications.push({ input: await sharp(Buffer.from(svg(colour))).resize(256).png().toBuffer(), left: index * 320 + 32, top: 32 });
}
for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
  applications.push({ input: await sharp(Buffer.from(svg(palette.chalk))).resize(size).png().toBuffer(), left: 48 + index * 130, top: 370 });
}
await sharp({ create: { width: 960, height: 470, channels: 4, background: palette.ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created Rally SVG masters and visual studies in ${directory}`);
