import { mkdir, readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../public/wibrawl/', import.meta.url);
await mkdir(directory, { recursive: true });
const master = await readFile(new URL('../design/wibrawl-master/master-a.svg', import.meta.url), 'utf8');
if (/<(?:script|foreignObject|image)\b|\bon\w+=|(?:href|src)=/i.test(master)) throw new Error('Brand source must contain standalone vector artwork');
const defs = master.match(/<defs>[\s\S]*?<\/defs>/)?.[0];
const path = id => {
  const match = master.match(new RegExp(`<path id="${id}"[^>]*\\/>`));
  if (!match) throw new Error(`Missing master logo path: ${id}`);
  return match[0];
};
const monogram = path('blue-W') + path('pink-B') + path('volt-strike');
path('white-wordmark');
// Trim transparent margins only; preserve all supplied artwork and colours.
const logo = master.replace('viewBox="0 0 1254 1254" width="1254" height="1254"', 'viewBox="115 190 1025 815" width="1025" height="815"')
  .replace('and white WiBrawl lettering on black.', 'and white WiBrawl lettering on a transparent background.');
await writeFile(new URL('logo.svg', directory), logo);
// Reuse the exact WB paths, clipped above the small wordmark dot.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" aria-labelledby="title">
<title id="title">Wibrawl WB</title>${defs}
<rect width="1000" height="1000" rx="150" fill="#09090b"/>
<defs><clipPath id="symbol"><rect x="175" y="175" width="910" height="680"/></clipPath></defs>
<g transform="translate(-130 -30)" clip-path="url(#symbol)">${monogram}</g>
</svg>\n`;
await writeFile(new URL('favicon.svg', directory), favicon);
console.log('Prepared supplied Master A SVG logo and matching WB favicon');
