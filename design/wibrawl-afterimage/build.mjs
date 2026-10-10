import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = await fs.readFile(path.join(directory, '..', 'wibrawl-logo', '02-afterimage.svg'), 'utf8');
const variants = [
  { id: 'gaming-lime', name: 'Gaming lime', main: '#C3F35E', echo: '#24DFFF', accent: '#101413', description: 'Lime lettering, a cyan lower echo, and a dark I matched to the supplied swatch.' },
  { id: 'ice-blue', name: 'Ice blue', main: '#24DFFF', echo: '#849689', accent: '#D7FF45', description: 'Cyan lettering, a muted green-grey lower echo, and a neon yellow I.' },
  { id: 'electric-violet', name: 'Electric violet', main: '#B995FF', echo: '#24DFFF', accent: '#D7FF45', description: 'Violet lettering, a cyan lower echo, and a neon yellow I.' },
];
await fs.mkdir(directory, { recursive: true });
const geometry = artwork => [...artwork.matchAll(/<path\b[^>]*>/g)].map(([tag]) => {
  const d = tag.match(/\bd="([^"]+)"/)[1];
  const transform = tag.match(/\btransform="([^"]+)"/)[1];
  return `${transform}:${d}`;
});
for (const variant of variants) {
  variant.svg = source
    .replaceAll('#00C8FF', variant.main)
    .replaceAll('#FF3096', variant.echo)
    .replaceAll('#F4FF38', variant.accent)
    .replace('<title id="logo-title">Wibrawl — Afterimage</title>', `<title id="logo-title">WIBRAWL — Afterimage, ${variant.name}</title>`)
    .replace(/<desc id="logo-description">[\s\S]*?<\/desc>/, `<desc id="logo-description">${variant.description} Forward leaning custom vector lettering with a seven-unit lower echo. Transparent background.</desc>`);
  if (JSON.stringify(geometry(variant.svg)) !== JSON.stringify(geometry(source))) throw new Error('Reference lettering changed');
  await fs.writeFile(path.join(directory, `wibrawl-${variant.id}.svg`), variant.svg);
  await sharp(Buffer.from(variant.svg)).resize(1416).png().toFile(path.join(directory, `wibrawl-${variant.id}-transparent.png`));
  if (variant.id === 'gaming-lime') {
    await sharp(Buffer.from(variant.svg)).resize(1416).flatten({ background: '#101413' }).png().toFile(path.join(directory, 'gaming-lime-preview.png'));
  }
}
await fs.writeFile(path.join(directory, 'wibrawl-original.svg'), source);

const strip = artwork => artwork.slice(artwork.indexOf('<g transform='), artwork.lastIndexOf('</svg>'));
const background = '#101413';
const light = '#F1F4EB';
const muted = '#ABB6AA';
const line = '#39473B';
const panels = variants.map((variant, index) => {
  const y = 170 + index * 346;
  return `<g transform="translate(0 ${y})">
<path d="M64 0H1376" stroke="${line}"/>
<text x="64" y="35" font-family="Arial,sans-serif" font-size="16" fill="${light}" letter-spacing="2">0${index + 1} / ${variant.name.toUpperCase()}</text>
<svg x="118" y="59" width="1204" height="252" viewBox="0 0 708 148">${strip(variant.svg)}</svg>
<text x="64" y="321" font-family="Arial,sans-serif" font-size="16" fill="${muted}">${variant.description}</text>
${[variant.main, variant.echo, variant.accent].map((colour, i) => `<rect x="${1040 + i * 114}" y="20" width="96" height="10" fill="${colour}"/><text x="${1040 + i * 114}" y="49" font-family="Arial,sans-serif" font-size="13" fill="${muted}">${colour}</text>`).join('')}
</g>`;
}).join('');
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1230" viewBox="0 0 1440 1230">
<rect width="1440" height="1230" fill="${background}"/>
<text x="64" y="85" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="${light}">WIBRAWL / AFTERIMAGE</text>
<text x="64" y="124" font-family="Arial,sans-serif" font-size="18" fill="${muted}">The middle wordmark. Same lettering and offset. Three new colour combinations.</text>
${panels}</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'colour-comparison.png'));

const cards = variants.map(variant => `<article><h2>${variant.name}</h2><img src="wibrawl-${variant.id}.svg" alt="${variant.description}"/><p>${variant.description}</p><a href="wibrawl-${variant.id}.svg" download>Download SVG</a></article>`).join('');
await fs.writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WIBRAWL / Afterimage colours</title><style>
*{box-sizing:border-box}body{margin:0;background:${background};color:${light};font-family:Arial,sans-serif}main{max-width:1200px;margin:auto;padding:48px 32px}h1{font-size:36px;letter-spacing:-1px}h2{font-size:16px}p{color:${muted};line-height:1.6}article{padding:28px 0;border-top:1px solid ${line}}article img{display:block;width:100%;margin:24px 0}a{color:#C3F35E;text-underline-offset:5px}@media(max-width:600px){main{padding:28px 20px}h1{font-size:28px}}
</style></head><body><main><h1>WIBRAWL / AFTERIMAGE</h1><p>The selected middle wordmark, with three alternative colour combinations.</p>${cards}</main></body></html>`);
console.log('Created three recoloured SVG masters, original reference, transparent PNG exports, comparison and HTML preview. All lettering paths match the selected reference.');
