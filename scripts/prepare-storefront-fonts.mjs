// Self-host Google's existing font files and their SIL Open Font Licenses.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = 'public/fonts';
await mkdir(directory, { recursive: true });
const css = await readFile('tmp/lighthouse-reports/google-fonts.css', 'utf8');
const blocks = [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].map(match => match[0]);
const paths = new Map();
for (const block of blocks) {
  const url = block.match(/url\(([^)]+)\)/)[1];
  if (paths.has(url)) continue;
  const family = block.includes("'Jost'") ? 'jost' : 'cormorant-garamond';
  const suffix = createHash('sha256').update(url).digest('hex').slice(0, 10);
  const filename = `${family}-${suffix}.woff2`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(`${directory}/${filename}`, bytes);
  paths.set(url, `/fonts/${filename}`);
  console.log(filename, bytes.length);
}
const unique = new Map();
for (const block of blocks) {
  const family = block.match(/font-family: ([^;]+);/)[1];
  const url = block.match(/url\(([^)]+)\)/)[1];
  const range = block.match(/unicode-range: ([^;]+);/)?.[1];
  unique.set(url, `@font-face { font-family: ${family}; font-style: normal; font-weight: 400 600; font-display: swap; src: url("${paths.get(url)}") format("woff2");${range ? ` unicode-range: ${range};` : ''} }`);
}
await writeFile('react-app/src/fonts.css', [...unique.values()].join('\n') + '\n');
for (const [family, repository] of [['CormorantGaramond', 'cormorantgaramond'], ['Jost', 'jost']]) {
  const response = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${repository}/OFL.txt`);
  if (!response.ok) throw new Error(`Font license download failed: ${response.status}`);
  await writeFile(`${directory}/${family}-OFL.txt`, await response.text());
}
console.log('Latin preload files:', paths.get('https://fonts.gstatic.com/s/cormorantgaramond/v21/co3bmX5slCNuHLi8bLeY9MK7whWMhyjYqXtKky2F7g.woff2'), paths.get('https://fonts.gstatic.com/s/jost/v20/92zatBhPNqw73oTd4jQmfxI.woff2'));
