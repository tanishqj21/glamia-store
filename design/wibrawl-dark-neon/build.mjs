import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { charcoal: '#3B4C40', blue: '#24DFFF', yellow: '#D7FF45', pink: '#FF4DB5' };
const gaming = { bg: '#101413', surface: '#191E1B', line: '#39473B', ink: '#F1F4EB', muted: '#ABB6AA' };
const sports = { bg: '#F4F6EF', line: '#C4CEBB', ink: '#18221A', muted: '#56634F' };
const concepts = [
  { id: 'shift', title: 'WB Shift', accents: `<path fill="${palette.blue}" d="M20 48H65L78 150L63 178L40 146Z"/>
<path fill="${palette.yellow}" d="M156 49H195L175 150H135Z"/>
<path fill="${palette.yellow}" d="M198 176H254V205H190Z"/>
<path fill="${palette.pink}" d="M246 172L244 180L231 189L226 180Z"/>` },
  { id: 'flow', title: 'WB Flow', accents: `<path fill="${palette.blue}" d="M15 32H64L83 148L67 167L36 140Z"/>
<path fill="${palette.yellow}" d="M173 32H220L201 121H151Z"/>
<path fill="${palette.yellow}" d="M209 176H295V207H200Z"/>
<path fill="${palette.pink}" d="M246 113H273L254 122L267 129H244Z"/>` },
];
await fs.mkdir(directory, { recursive: true });
for (const concept of concepts) {
  const source = await fs.readFile(path.join(directory, '..', 'wibrawl-neon-wb', `wibrawl-${concept.id}.svg`), 'utf8');
  const match = source.match(/<g fill="#121615">([\s\S]*?)<\/g>/);
  if (!match) throw new Error(`Approved geometry missing: ${concept.id}`);
  concept.geometry = match[1];
}
function mark(concept) {
  const paths = concept.geometry.match(/<path\b[^>]*\/>/g);
  const accents = concept.accents.match(/<path\b[^>]*\/>/g);
  if (paths?.length !== 2 || accents?.length !== 4) throw new Error('Unexpected WB vector structure');
  return `<defs>
<clipPath id="clip-w-${concept.id}">${paths[0]}</clipPath>
<clipPath id="clip-b-${concept.id}">${paths[1].replace('fill-rule="evenodd"', 'fill-rule="evenodd" clip-rule="evenodd"')}</clipPath>
</defs>
<g transform="translate(8 6)"><g fill="${palette.charcoal}">${concept.geometry}</g>
<g clip-path="url(#clip-w-${concept.id})">${accents.slice(0, 2).join('')}</g>
<g clip-path="url(#clip-b-${concept.id})">${accents.slice(2).join('')}</g></g>`;
}
function svg(concept) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 256" role="img" aria-labelledby="title description">
<title id="title">WiBrawl — ${concept.title}, charcoal and neon</title>
<desc id="description">The approved WB monogram with a main dark charcoal-green body, balanced neon blue and yellow sections, and a small pink detail. Transparent counters and background.</desc>
${mark(concept)}
</svg>
`;
}
for (const concept of concepts) {
  const master = svg(concept);
  await fs.writeFile(path.join(directory, `wibrawl-${concept.id}.svg`), master);
  const { data } = await sharp(Buffer.from(master)).resize(960).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = Object.fromEntries(Object.keys(palette).map(name => [name, 0]));
  const channels = Object.entries(palette).map(([name, colour]) => [name, [1, 3, 5].map(offset => parseInt(colour.slice(offset, offset + 2), 16))]);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] !== 255) continue;
    for (const [name, rgb] of channels) {
      if (rgb.every((value, index) => data[offset + index] === value)) counts[name]++;
    }
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const proportions = Object.fromEntries(Object.entries(counts).map(([name, count]) => [name, Math.round(count / total * 100)]));
  if (counts.charcoal < total * .45 || counts.pink >= counts.yellow) throw new Error('Unexpected colour balance');
  console.log(`${concept.title} approximate solid-colour shares: ${JSON.stringify(proportions)}`);
}

function header(concept, top) {
  return `<g transform="translate(48 ${top})">
<rect width="704" height="84" fill="${gaming.bg}" stroke="${gaming.line}"/>
<path d="M19 29H36M19 37H36M19 45H36" stroke="${gaming.ink}" stroke-width="1.6"/>
<g transform="translate(54 9) scale(.24)">${mark(concept)}</g>
<text x="132" y="47" fill="${gaming.ink}" font-family="Arial,sans-serif" font-size="25" font-weight="700" letter-spacing="-1">WIBRAWL</text>
<rect x="287" y="20" width="145" height="43" rx="4" fill="${gaming.surface}" stroke="${gaming.line}"/>
<text x="299" y="46" fill="${gaming.muted}" font-family="Arial,sans-serif" font-size="11">Find your next tee</text>
<text x="455" y="46" fill="${gaming.ink}" font-family="Arial,sans-serif" font-size="12">Profile</text>
<text x="529" y="46" fill="${gaming.ink}" font-family="Arial,sans-serif" font-size="12">0 credits</text>
<rect x="619" y="25" width="62" height="35" rx="4" fill="#C3F35E"/>
<text x="650" y="47" text-anchor="middle" fill="${sports.ink}" font-family="Arial,sans-serif" font-size="11" font-weight="700">Gaming</text>
</g>`;
}
function panel(concept, index) {
  return `<g transform="translate(${index * 800} 0)">
<text x="48" y="55" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="${gaming.ink}">0${index + 1} / ${concept.title.toUpperCase()}</text>
<path d="M48 79H752" stroke="${gaming.line}"/>
${header(concept, 109)}
<g transform="translate(${concept.id === 'shift' ? 39 : 46} 209) scale(${concept.id === 'shift' ? 2.37 : 2.15})">${mark(concept)}</g>
<text x="48" y="734" font-family="Arial,sans-serif" font-size="15" fill="${gaming.muted}">Charcoal base / blue + yellow / small pink detail</text>
<rect x="48" y="779" width="704" height="440" fill="${sports.bg}"/>
<g transform="translate(${concept.id === 'shift' ? 148 : 152} 810) scale(${concept.id === 'shift' ? 1.72 : 1.56})">${mark(concept)}</g>
<text x="72" y="1190" font-family="Arial,sans-serif" font-size="15" fill="${sports.muted}">Same artwork on the Sports theme</text>
</g>`;
}
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1260" viewBox="0 0 1600 1260"><rect width="1600" height="1260" fill="${gaming.bg}"/><path d="M800 40V1219" stroke="${gaming.line}"/>${concepts.map(panel).join('')}</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'dark-neon-comparison.png'));
const applications = [];
for (const [row, concept] of concepts.entries()) {
  for (const [column, background] of [gaming.bg, sports.bg].entries()) {
    applications.push({ input: await sharp({ create: { width: 420, height: 320, channels: 4, background } }).png().toBuffer(), left: column * 420, top: row * 430 });
    applications.push({ input: await sharp(Buffer.from(svg(concept))).resize(370).png().toBuffer(), left: column * 420 + 25, top: row * 430 + 8 });
  }
  for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
    applications.push({ input: await sharp(Buffer.from(svg(concept))).resize(size).png().toBuffer(), left: 48 + index * 150, top: row * 430 + 347 });
  }
}
await sharp({ create: { width: 840, height: 860, channels: 4, background: gaming.bg } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created dark-base neon WB variants in ${directory}`);
