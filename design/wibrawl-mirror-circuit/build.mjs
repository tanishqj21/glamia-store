import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { ink: '#17191C', paper: '#EEEDE8', red: '#D3372D' };
const start = [176, 40];
const line = (x, y) => ({ type: 'L', end: [x, y] });
const curve = (cx, cy, x, y) => ({ type: 'Q', control: [cx, cy], end: [x, y] });
const concepts = [
  { id: 'cutback', title: 'Cutback', segments: [line(241,40),curve(248,40,252,46),line(284,80),curve(289,87,285,94),line(267,117),curve(263,123,255,123),line(237,123),curve(228,123,233,132),line(301,179),curve(306,184,303,193),line(286,230),curve(282,238,274,239),line(188,248),line(176,248)] },
  { id: 'offset', title: 'Offset', segments: [line(235,40),line(272,64),line(280,101),line(232,132),line(245,132),line(310,175),line(289,221),line(210,248),line(176,248)] },
];
const mirror = ([x, y]) => [352 - x, y];
const coordinates = point => point.join(' ');
function command(segment) {
  return `${segment.type}${segment.control ? `${coordinates(segment.control)} ` : ''}${coordinates(segment.end)}`;
}
for (const concept of concepts) {
  concept.right = `M${coordinates(start)}${concept.segments.map(command).join('')}`;
  const starts = [start, ...concept.segments.slice(0, -1).map(segment => segment.end)];
  // Reverse the mirrored half so its bottom endpoint continues the right half.
  const reversed = concept.segments.map((segment, index) => ({
    type: segment.type,
    ...(segment.control ? { control: mirror(segment.control) } : {}),
    end: mirror(starts[index]),
  })).reverse();
  const end = mirror(concept.segments.at(-1).end);
  concept.left = `M${coordinates(end)}${reversed.map(command).join('')}`;
  concept.course = `${concept.right}${reversed.map(command).join('')}Z`;
}
function stroke(route, colour, width = 15) {
  return `<path d="${route}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function svg(concept, colour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 288" role="img" aria-labelledby="title description">
<title id="title">WiBrawl — Mirror Circuit, ${concept.title}</title>
<desc id="description">One continuous closed circuit built from a normal angular B on the right and its exact horizontal mirror on the left. The two halves join at the top and bottom. Transparent background.</desc>
${stroke(concept.course, colour)}
</svg>
`;
}
await fs.mkdir(directory, { recursive: true });
for (const concept of concepts) {
  for (const [suffix, colour] of [['', palette.ink], ['-paper', palette.paper], ['-red', palette.red]]) {
    await fs.writeFile(path.join(directory, `wibrawl-mirror-${concept.id}${suffix}.svg`), svg(concept, colour));
  }
  await sharp(Buffer.from(svg(concept, palette.ink))).resize(880).flatten({ background: palette.paper }).png().toFile(path.join(directory, `${concept.id}-preview.png`));
}

const primary = concepts[0];
const track = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 288" role="img" aria-labelledby="title description">
<title id="title">WiBrawl — Mirror Circuit track illustration</title>
<desc id="description">Mirrored B circuit with red-and-white track edging and a start-finish stripe.</desc>
${stroke(primary.course, palette.ink, 25)}${stroke(primary.course, palette.paper, 20)}
<path d="${primary.course}" fill="none" stroke="${palette.red}" stroke-width="20" stroke-dasharray="5 5" stroke-linejoin="round"/>
${stroke(primary.course, palette.ink, 16)}
<path d="M189 30V50" stroke="${palette.paper}" stroke-width="4"/>
<path d="M189 31V35M189 39V43M189 47V49" stroke="${palette.ink}" stroke-width="4"/>
</svg>`;
await fs.writeFile(path.join(directory, 'wibrawl-mirror-track.svg'), track);
await sharp(Buffer.from(track)).resize(880).flatten({ background: palette.paper }).png().toFile(path.join(directory, 'track-preview.png'));

const shirt = 'M-56-173Q0-142 56-173L127-157L193-105L158-30L103-52L107 185Q0 198-107 185L-103-52L-158-30L-193-105L-127-157Z';
function panel(concept, index) {
  return `<g transform="translate(${index * 800} 0)">
<text x="56" y="60" font-family="Arial,sans-serif" font-size="14" letter-spacing="2" fill="${palette.ink}">0${index + 1} / ${concept.title.toUpperCase()}</text>
<path d="M56 86H744" stroke="#C7C7C1"/>
<g transform="translate(27 120) scale(2.12)">${stroke(concept.course, palette.ink)}</g>
<text x="56" y="725" font-family="Arial,sans-serif" font-size="13" letter-spacing="1.5" fill="#6A6A67">MIRRORED B + B</text>
<g transform="translate(162 812) scale(.84)">${stroke(concept.left, palette.red, 10)}${stroke(concept.right, palette.ink, 10)}</g>
<g transform="translate(575 887) scale(.65)"><path d="${shirt}" fill="${palette.ink}"/><path d="M-56-173Q0-142 56-173" fill="none" stroke="#3E4246" stroke-width="7"/><g transform="translate(-62 -113) scale(.33)">${stroke(concept.course, palette.paper)}</g></g>
<text x="56" y="1048" font-family="Arial,sans-serif" font-size="13" fill="#6A6A67">ONE CLOSED ROUTE / SVG</text>
</g>`;
}
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100"><rect width="1600" height="1100" fill="${palette.paper}"/><path d="M800 40V1060" stroke="#C7C7C1"/>${concepts.map(panel).join('')}</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'mirror-comparison.png'));

const applications = [];
for (const [row, concept] of concepts.entries()) {
  for (const [column, background, colour] of [[0, palette.paper, palette.ink], [1, palette.ink, palette.paper], [2, palette.paper, palette.red]]) {
    applications.push({ input: await sharp({ create: { width: 360, height: 300, channels: 4, background } }).png().toBuffer(), left: column * 360, top: row * 420 });
    applications.push({ input: await sharp(Buffer.from(svg(concept, colour))).resize(330).png().toBuffer(), left: column * 360 + 15, top: row * 420 + 15 });
  }
  for (const [index, size] of [16, 24, 32, 48, 64].entries()) {
    applications.push({ input: await sharp(Buffer.from(svg(concept, palette.paper))).resize(size).png().toBuffer(), left: 48 + index * 180, top: row * 420 + 335 });
  }
}
await sharp({ create: { width: 1080, height: 840, channels: 4, background: palette.ink } }).composite(applications).png().toFile(path.join(directory, 'applications.png'));
console.log(`Created exact mirrored-B circuit concepts in ${directory}`);
