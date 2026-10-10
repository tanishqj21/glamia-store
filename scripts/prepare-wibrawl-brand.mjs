import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('../public/wibrawl/', import.meta.url);
await mkdir(directory, { recursive: true });
const logo = await readFile(new URL('../design/wibrawl-final/wibrawl-logo.svg', import.meta.url), 'utf8');
await writeFile(new URL('logo.svg', directory), logo);

// Use the chosen Afterimage lettering paths, with a wider gap for small tabs.
const front = logo.slice(logo.indexOf('</g>') + 4);
const letters = [...front.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/>/g)];
if (letters.length !== 7) throw new Error('Expected the selected WIBRAWL vector lettering');
const w = letters[0][1];
const b = letters[2][1];
const glyphs = fill => `<path fill="${fill}" d="${w}"/><path transform="translate(124 0)" fill="${fill}" fill-rule="evenodd" d="${b}"/>`;
const favicon = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title">
<title id="title">Wibrawl WB</title>
<rect width="256" height="256" rx="32" fill="#101413"/>
<g transform="translate(27 70) scale(1.1) skewX(-10)">
<g transform="translate(0 7)">${glyphs('#FF3096')}</g>
${glyphs('#00C8FF')}
<path fill="#C3F35E" d="M92 0H114L110.48 16H89.22Z"/>
</g>
</svg>
`;
await writeFile(new URL('favicon.svg', directory), favicon);
console.log(`Prepared SVG-only Wibrawl logo and WB favicon in ${fileURLToPath(directory)}`);
