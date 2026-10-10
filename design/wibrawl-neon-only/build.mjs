import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { yellow: '#DDFF39', blue: '#246BFF', pink: '#FF3BB5' };
// Website backgrounds and UI colours come from react-app/src/wibrawl.css.
// Neutral colours below belong to the preview UI, never to the logo artwork.
const themes = {
  gaming: { bg: '#101413', surface: '#191E1B', ink: '#F1F4EB', muted: '#ABB6AA', line: '#39473B', accent: '#C3F35E' },
  sports: { bg: '#F4F6EF', surface: '#FFFFFF', ink: '#18221A', muted: '#56634F', line: '#C4CEBB', accent: '#C3F35E' },
};
const concepts = [{ id: 'shift', title: 'WB Shift' }, { id: 'flow', title: 'WB Flow' }];
await fs.mkdir(directory, { recursive: true });
for (const concept of concepts) {
  const source = await fs.readFile(path.join(directory, '..', 'wibrawl-neon-wb', `wibrawl-${concept.id}.svg`), 'utf8');
  const begin = source.indexOf('<g transform="translate(8 6)">');
  const end = source.lastIndexOf('</svg>');
  if (begin < 0 || end <= begin) throw new Error(`Missing approved geometry: ${concept.id}`);
  concept.artwork = source.slice(begin, end).trim()
    .replaceAll('#121615', palette.yellow)
    .replaceAll('#C8FF3B', palette.blue)
    .replaceAll('#24DFFF', palette.blue)
    .replaceAll('#FF4DB5', palette.pink);
  if (concept.id === 'shift') {
    // A small lower-corner detail; much smaller than the yellow body.
    concept.artwork = concept.artwork.replace(/<\/g>$/, `<path fill="${palette.pink}" d="M246 172L244 180L231 189L226 180Z"/></g>`);
  }
}
function mark(concept, theme = 'gaming') {
  if (theme !== 'sports') return concept.artwork;
  // A neon-blue edge around the letter outlines keeps the yellow readable on
  // the light website theme. The counters remain transparent.
  return concept.artwork.replace(`<g fill="${palette.yellow}">`, `<g fill="${palette.yellow}" stroke="${palette.blue}" stroke-width="4" stroke-linejoin="round" paint-order="stroke fill">`);
}
function svg(concept, theme) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 256" role="img" aria-labelledby="title description">
<title id="title">WiBrawl — ${concept.title}, ${theme} neon palette</title>
<desc id="description">The approved WB shape recoloured entirely in neon yellow, blue and a small pink detail. Yellow is dominant. ${theme === 'sports' ? 'A blue edge supports the light website theme.' : 'Designed for the dark Gaming theme.'} Transparent background.</desc>
${mark(concept, theme)}
</svg>
`;
}
for (const concept of concepts) {
  for (const theme of ['gaming', 'sports']) {
    const artwork = svg(concept, theme);
    const fills = [...artwork.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/gi)].map(match => match[1].toUpperCase());
    if (fills.some(colour => !Object.values(palette).includes(colour))) throw new Error('Non-neon logo colour');
    await fs.writeFile(path.join(directory, `wibrawl-${concept.id}-${theme}.svg`), artwork);
  }
}

function header(concept, theme, top) {
  const t = themes[theme];
  return `<g transform="translate(48 ${top})">
<rect width="704" height="86" fill="${t.bg}" stroke="${t.line}"/>
<path d="M19 30H36M19 38H36M19 46H36" stroke="${t.ink}" stroke-width="1.6"/>
<g transform="translate(54 10) scale(.24)">${mark(concept, theme)}</g>
<text x="132" y="48" fill="${t.ink}" font-family="Arial,sans-serif" font-size="25" font-weight="700" letter-spacing="-1.1">WIBRAWL</text>
<rect x="281" y="21" width="139" height="43" rx="4" fill="${t.surface}" stroke="${t.line}"/>
<circle cx="295" cy="41" r="5" fill="none" stroke="${t.muted}"/><path d="M299 45L303 49" stroke="${t.muted}"/>
<text x="312" y="47" fill="${t.muted}" font-family="Arial,sans-serif" font-size="11">Find your next tee</text>
<text x="445" y="47" fill="${t.ink}" font-family="Arial,sans-serif" font-size="12">Profile</text>
<text x="514" y="47" fill="${t.ink}" font-family="Arial,sans-serif" font-size="12">0 credits</text>
<rect x="594" y="24" width="87" height="37" rx="4" fill="${t.accent}"/>
<text x="637" y="48" text-anchor="middle" fill="#18221A" font-family="Arial,sans-serif" font-size="12" font-weight="700">${theme === 'gaming' ? 'Gaming' : 'Sports'}</text>
</g>`;
}
function panel(concept, index) {
  return `<g transform="translate(${index * 800} 0)">
<text x="48" y="55" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="${themes.gaming.ink}">0${index + 1} / ${concept.title.toUpperCase()}</text>
<path d="M48 79H752" stroke="${themes.gaming.line}"/>
${header(concept, 'gaming', 109)}
<g transform="translate(${concept.id === 'shift' ? 39 : 46} 214) scale(${concept.id === 'shift' ? 2.37 : 2.15})">${mark(concept)}</g>
<text x="48" y="743" font-family="Arial,sans-serif" font-size="15" fill="${themes.gaming.muted}">Gaming theme</text>
<rect x="48" y="779" width="704" height="471" fill="${themes.sports.bg}"/>
${header(concept, 'sports', 779)}
<g transform="translate(${concept.id === 'shift' ? 181 : 178} 860) scale(${concept.id === 'shift' ? 1.5 : 1.4})">${mark(concept, 'sports')}</g>
<text x="72" y="1221" font-family="Arial,sans-serif" font-size="15" fill="${themes.sports.muted}">Sports theme / neon-blue edge</text>
</g>`;
}
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1290" viewBox="0 0 1600 1290"><rect width="1600" height="1290" fill="${themes.gaming.bg}"/><path d="M800 40V1250" stroke="${themes.gaming.line}"/>${concepts.map(panel).join('')}</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'website-theme-comparison.png'));

const applications = [];
for (const [row, concept] of concepts.entries()) {
  for (const [column, theme] of ['gaming', 'sports'].entries()) {
    applications.push({ input: await sharp({ create: { width: 420, height: 320, channels: 4, background: themes[theme].bg } }).png().toBuffer(), left: column * 420, top: row * 430 });
    applications.push({ input: await sharp(Buffer.from(svg(concept, theme))).resize(370).png().toBuffer(), left: column * 420 + 25, top: row * 430 + 8 });
  }
  for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
    applications.push({ input: await sharp(Buffer.from(svg(concept, 'gaming'))).resize(size).png().toBuffer(), left: 48 + index * 150, top: row * 430 + 347 });
  }
}
await sharp({ create: { width: 840, height: 860, channels: 4, background: themes.gaming.bg } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created yellow-led neon-only WB variants in ${directory}`);
