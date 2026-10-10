import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
// Two offset, rounded hooks. The gap is part of the geometry, not a painted background.
const hook = 'M78 42H145Q178 42 178 75V96H148V79Q148 72 141 72H82Q72 72 72 82V141Q72 148 79 148H96V178H75Q42 178 42 145V78Q42 42 78 42Z';
function artwork(mono) {
  return `<path fill="${mono || '#00C8FF'}" d="${hook}"/>
<path fill="${mono || '#FF3096'}" transform="rotate(180 128 128)" d="${hook}"/>
${mono ? '' : '<path fill="#F4FF38" d="M148 79H178V96H148Z"/>'}`;
}
function svg(mono) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title description">
<title id="title">Wibrawl — simple symbol</title>
<desc id="description">Two offset rounded hooks forming an open interlocking symbol. ${mono ? 'Single-colour version.' : 'Neon blue and pink with one small yellow accent.'} Transparent background. No lettering.</desc>
${artwork(mono)}
</svg>
`;
}
await fs.mkdir(directory, { recursive: true });
for (const [file, mono] of [['wibrawl-simple.svg', undefined], ['wibrawl-simple-white.svg', '#FFFFFF'], ['wibrawl-simple-black.svg', '#000000']]) {
  await fs.writeFile(path.join(directory, file), svg(mono));
}
await sharp(Buffer.from(svg())).resize(512).extend({ left: 104, right: 104, top: 44, bottom: 44, background: '#090B10' }).flatten({ background: '#090B10' }).png().toFile(path.join(directory, 'preview.png'));
const applications = [];
for (const [index, background] of ['#090B10', '#F4F5EF', '#11131A'].entries()) {
  applications.push({ input: await sharp({ create: { width: 320, height: 320, channels: 4, background } }).png().toBuffer(), left: index * 320, top: 0 });
  applications.push({ input: await sharp(Buffer.from(svg(index === 2 ? '#FFFFFF' : undefined))).resize(256).png().toBuffer(), left: index * 320 + 32, top: 32 });
}
for (const [index, size] of [16, 24, 32, 48].entries()) {
  applications.push({ input: await sharp(Buffer.from(svg())).resize(size).png().toBuffer(), left: 48 + index * 96, top: 370 });
}
await sharp({ create: { width: 960, height: 460, channels: 4, background: '#090B10' } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created simple SVG logo and visual previews in ${directory}`);
