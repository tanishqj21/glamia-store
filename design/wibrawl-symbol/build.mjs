import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const colours = { blue: '#00C8FF', pink: '#FF3096', yellow: '#F4FF38' };
const head = 'M96 43L164 31Q183 28 196 43L221 73Q233 87 227 104L206 172Q202 187 188 194L140 219Q127 226 115 219L71 194Q56 185 54 167L49 116Q47 101 58 87L83 53Q88 46 96 43Z';
const cheek = 'M163 31Q182 28 196 43L221 73Q233 87 227 104L206 172Q202 187 188 194L140 219Q130 224 121 222L151 167L169 118L157 79Z';
const eye = 'M79 103L127 91L121 111L83 119Z';
const wink = 'M150 99Q174 82 194 103L184 116Q174 105 156 113Z';
const mouth = 'M86 143Q128 159 191 126L180 150Q147 186 114 177Q97 169 86 143Z';
const tooth = 'M98 149Q132 158 177 138L170 151Q133 169 106 161Z';
const streaks = [
  'M19 89H56L42 108H6Z',
  'M17 129H39L42 148H8Z',
];
function artwork(mono, small = false) {
  const fill = name => mono || colours[name];
  const maskId = `wibrawl-face-${mono ? mono.slice(1).toLowerCase() : small ? 'small' : 'colour'}`;
  return `<defs><mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><rect width="256" height="256" fill="#FFFFFF"/><path d="${eye}" fill="#000000"/><path d="${wink}" fill="#000000"/><path d="${mouth}" fill="#000000"/></mask></defs>
<g mask="url(#${maskId})"><path fill="${fill('blue')}" d="${head}"/>${mono ? '' : `<path fill="${fill('pink')}" d="${cheek}"/>`}</g>
<path fill="${fill('yellow')}" d="${tooth}"/>
${small ? '' : `<path fill="${fill('blue')}" d="${streaks[0]}"/><path fill="${fill('pink')}" d="${streaks[1]}"/><path fill="${fill('yellow')}" d="M64 40L79 37L82 52L67 55Z"/>`}`;
}
function svg(mono, small = false) {
  const description = `An original angular avatar with a focused eye, a cheeky wink and an upward grin.${small ? ' Simplified small-size version.' : ' Motion streaks suggest competitive speed; a detached pixel adds an arcade detail.'} ${mono ? `Single-colour ${mono === '#FFFFFF' ? 'white' : 'black'}.` : 'Neon blue, pink and yellow.'} No lettering. Transparent background.`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="symbol-title symbol-description">
<title id="symbol-title">Wibrawl symbol</title>
<desc id="symbol-description">${description}</desc>
${artwork(mono, small)}
</svg>
`;
}
const assets = {
  'wibrawl-symbol.svg': svg(),
  'wibrawl-symbol-white.svg': svg('#FFFFFF'),
  'wibrawl-symbol-black.svg': svg('#000000'),
  'wibrawl-symbol-small.svg': svg(undefined, true),
};
await fs.mkdir(directory, { recursive: true });
await Promise.all(Object.entries(assets).map(([name, source]) => fs.writeFile(path.join(directory, name), source)));
await sharp(Buffer.from(svg())).resize(600).extend({ top: 70, bottom: 70, left: 130, right: 130, background: '#090B10' }).flatten({ background: '#090B10' }).png().toFile(path.join(directory, 'symbol-preview.png'));
const examples = [];
for (const [index, background] of ['#090B10', '#F4F5EF', '#11131A'].entries()) {
  examples.push({ input: await sharp({ create: { width: 400, height: 420, channels: 4, background } }).png().toBuffer(), top: 0, left: index * 400 });
  examples.push({ input: await sharp(Buffer.from(svg(index === 2 ? '#FFFFFF' : undefined))).resize(320).png().toBuffer(), top: 42, left: index * 400 + 40 });
}
for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
  examples.push({ input: await sharp(Buffer.from(svg(undefined, size <= 24))).resize(size).png().toBuffer(), top: 470, left: 70 + index * 130 });
}
await sharp({ create: { width: 1200, height: 570, channels: 4, background: '#090B10' } }).composite(examples).png().toFile(path.join(directory, 'applications-preview.png'));
console.log(`Created four SVG masters and two visual previews in ${directory}`);
