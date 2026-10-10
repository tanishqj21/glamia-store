import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Original vector geometry: no font files, bitmap tracing, or raster payloads.
const directory = path.dirname(fileURLToPath(import.meta.url));
const palette = { blue: '#00C8FF', pink: '#FF3096', yellow: '#F4FF38', light: '#F7F8F5', ink: '#11131A' };
const letters = {
  W: [114, 'M0 0H22L35 69L49 15H66L80 69L92 0H114L92 100H71L58 51L45 100H23Z'],
  I: [22, 'M0 0H22V100H0Z'],
  B: [80, 'M0 0H62L80 18V38L68 50L80 62V82L62 100H0ZM22 19V42H53L59 36V25L53 19ZM22 59V81H54L60 75V65L54 59Z'],
  R: [84, 'M0 0H62L80 18V43L62 60L84 100H58L37 60H22V100H0ZM22 20V41H53L59 35V26L53 20Z'],
  A: [90, 'M0 100L31 0H59L90 100H66L60 78H30L24 100ZM36 58H54L45 27Z'],
  L: [70, 'M0 0H22V79H70V100H0Z'],
};
function wordmark(text, fill, gap = 12, colours = {}) {
  let x = 0;
  const body = [...text].map((letter, index) => {
    const [width, d] = letters[letter];
    const result = `<path transform="translate(${x} 0)" fill="${colours[index] || fill}" fill-rule="evenodd" d="${d}"/>`;
    x += width + gap;
    return result;
  }).join('\n');
  return { body, width: x - gap };
}
const markShapes = [
  ['blue', 'M14 20H48L72 101L99 20H133L90 148H56Z'],
  ['pink', 'M112 20H146L170 101L197 20H231L188 148H154Z'],
  ['yellow', 'M99 20H133L124 47H90Z'],
];
function foldMark(mono) {
  return markShapes.map(([colour, d]) => `<path fill="${mono || palette[colour]}" d="${d}"/>`).join('\n');
}
function svg(name, viewBox, body, description) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="logo-title logo-description">\n<title id="logo-title">${name}</title>\n<desc id="logo-description">${description}</desc>\n${body}\n</svg>\n`;
}
function primary(fill = palette.light, mono) {
  return svg('Wibrawl — Neon Fold', '0 0 968 180',
    `<g transform="translate(4 6)">${foldMark(mono)}</g>\n<g transform="translate(292 40)">${wordmark('WIBRAWL', mono || fill).body}</g>`,
    'An angular folded W in neon blue, pink and yellow beside custom Wibrawl lettering. Transparent background.');
}
function afterimage(fill = palette.blue, mono) {
  const word = wordmark('WIBRAWL', fill, 8);
  return svg('Wibrawl — Afterimage', '0 0 708 148',
    `<g transform="translate(45 22) skewX(-10)">\n${mono ? '' : `<g transform="translate(0 7)">${wordmark('WIBRAWL', palette.pink, 8).body}</g>`}\n${wordmark('WIBRAWL', mono || fill, 8, mono ? {} : { 1: palette.yellow }).body}\n</g>`,
    'Forward leaning Wibrawl lettering, neon blue with a pink lower echo and a yellow I. Transparent background.');
}
function monogram(mono) {
  return `<path fill="${mono || palette.blue}" d="M20 20H45L58 113L77 54H98L116 113L132 20H157L132 174H109L87 107L65 174H43Z"/>\n<path fill="${mono || palette.pink}" fill-rule="evenodd" d="M160 20H206L230 44V76L216 90L232 107V150L208 174H144L149 148H194L207 135V116L197 106H156L161 81H195L205 71V55L195 45H155Z"/>\n<path fill="${mono || palette.yellow}" d="M77 54H98L105 77H70Z"/>`;
}
function tag(fill = palette.light, mono) {
  return svg('Wibrawl — Label Code', '0 0 660 224',
    `<g transform="translate(0 16)">${monogram(mono)}</g>\n<g transform="translate(280 28) scale(.85)">${wordmark('WI', mono || fill).body}</g>\n<g transform="translate(280 130) scale(.76)">${wordmark('BRAWL', mono || fill, 8).body}</g>`,
    'A compact WB monogram with a yellow connection and a stacked Wibrawl wordmark. Transparent background.');
}
const assets = {
  'wibrawl-logo.svg': primary(),
  'wibrawl-logo-light.svg': primary(palette.ink),
  'wibrawl-logo-white.svg': primary(palette.light, '#FFFFFF'),
  'wibrawl-logo-black.svg': primary(palette.ink, '#000000'),
  'wibrawl-mark.svg': svg('Wibrawl — W mark', '0 0 248 168', foldMark(), 'Neon blue and pink folded W with a yellow accent. Transparent background.'),
  'wibrawl-mark-white.svg': svg('Wibrawl — W mark, white', '0 0 248 168', foldMark('#FFFFFF'), 'Single colour white Wibrawl mark. Transparent background.'),
  'wibrawl-icon.svg': svg('Wibrawl — Square icon', '0 0 256 256', `<g transform="translate(4 44)">${foldMark()}</g>`, 'Wibrawl folded W centred within a square transparent canvas for site and app icons.'),
  'wibrawl-wordmark.svg': svg('Wibrawl — Wordmark', '0 0 674 128', `<g transform="translate(14 14)">${wordmark('WIBRAWL', palette.light).body}</g>`, 'Custom Wibrawl lettering drawn entirely as vector paths. Transparent background.'),
  '02-afterimage.svg': afterimage(),
  '03-label-code.svg': tag(),
};
await fs.mkdir(directory, { recursive: true });
await Promise.all(Object.entries(assets).map(([file, artwork]) => fs.writeFile(path.join(directory, file), artwork)));

const previewItems = [
  { file: 'wibrawl-logo.svg', name: '01 / NEON FOLD', caption: 'Recommended · a folded W + custom lettering', view: '0 0 968 180' },
  { file: '02-afterimage.svg', name: '02 / AFTERIMAGE', caption: 'Wordmark first · blue lettering, pink echo, yellow I', view: '0 0 708 148' },
  { file: '03-label-code.svg', name: '03 / LABEL CODE', caption: 'Compact WB monogram · stacked lettering', view: '0 0 660 224' },
];
const cards = previewItems.map(({ file, name, caption }, index) => `<article><div class="row"><h2>${name}</h2><a href="./${file}" download>Download SVG</a></div><div class="artwork"><img src="./${file}" alt="${name.toLowerCase()} Wibrawl logo concept" /></div><p>${caption}</p>${index === 0 ? '<div class="mini"><img src="./wibrawl-mark.svg" alt="Wibrawl icon at 32 pixels" width="48" height="32"/><img src="./wibrawl-logo.svg" alt="Wibrawl logo at header size" width="194" height="36"/><span>Icon + header size</span></div>' : ''}</article>`).join('');
await fs.writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Wibrawl / Logo concepts</title><style>
*{box-sizing:border-box}body{margin:0;background:#090B10;color:#F7F8F5;font-family:Arial,sans-serif}main{max-width:1120px;margin:auto;padding:60px 40px}header{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:36px}h1{font-size:34px;letter-spacing:-1px;margin:0 0 12px}header p{color:#9399A7;margin:0;font-size:15px;line-height:1.6}.palette{display:flex;gap:14px}.swatch{font-size:10px;color:#AEB3BF;letter-spacing:.5px}.swatch i{display:block;height:22px;width:72px;margin-bottom:8px}article{border-top:1px solid #303440;padding:26px 0 28px}.row{display:flex;justify-content:space-between;gap:16px;align-items:center}h2{font-size:12px;letter-spacing:2px;font-weight:500;margin:0;color:#BEC3CD}a{color:#F4FF38;font-size:12px;text-underline-offset:5px}.artwork{height:184px;display:flex;align-items:center;justify-content:center}.artwork img{width:90%;max-height:150px}article:nth-of-type(3) .artwork img{width:60%;max-height:168px}article p{font-size:13px;color:#9399A7;margin:8px 0}.mini{display:flex;align-items:center;gap:28px;margin-top:22px}.mini span{font-size:11px;color:#727A89}footer{border-top:1px solid #303440;padding-top:28px;color:#9399A7;font-size:13px;line-height:1.6}.light-sample{background:#F4F5EF;padding:30px;margin-top:26px}.light-sample img{display:block;width:70%;max-width:680px;margin:auto}@media(max-width:650px){main{padding:30px 20px}header{display:block}.palette{margin-top:24px}.artwork{height:140px}.artwork img{width:100%}.mini{gap:18px;flex-wrap:wrap}.row{align-items:start}article:nth-of-type(3) .artwork img{width:88%}.light-sample img{width:100%}}
</style></head><body><main><header><div><h1>Wibrawl.</h1><p>Three vector directions. One cyberpunk palette.</p></div><div class="palette">${['blue', 'pink', 'yellow'].map(colour => `<div class="swatch"><i style="background:${palette[colour]}"></i>${palette[colour]}</div>`).join('')}</div></header>${cards}<footer>Every logo is transparent SVG with custom path lettering. No font installation needed.<div class="light-sample"><img src="./wibrawl-logo-light.svg" alt="Recommended Wibrawl logo on a light background"/></div></footer></main></body></html>`);

// PNGs are presentation previews only. The deliverable masters above stay SVG.
const panelBody = previewItems.map(({ file, name, caption }, index) => {
  const y = 208 + index * 280;
  const content = assets[file].match(/<desc[^>]*>.*?<\/desc>\n([\s\S]*)\n<\/svg>/)[1];
  const { view } = previewItems[index];
  const width = index === 2 ? 540 : 960;
  return `<path d="M64 ${y - 28}H1136" stroke="#303440"/><text x="64" y="${y}" fill="#BEC3CD" font-family="Arial,sans-serif" font-size="13" letter-spacing="2">${name}</text><svg x="${(1200 - width) / 2}" y="${y + 42}" width="${width}" height="${index === 2 ? 162 : 145}" viewBox="${view}">${content}</svg><text x="64" y="${y + 226}" fill="#9399A7" font-family="Arial,sans-serif" font-size="15">${caption}</text>`;
}).join('');
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1060" viewBox="0 0 1200 1060"><rect width="1200" height="1060" fill="#090B10"/><text x="64" y="86" fill="#F7F8F5" font-family="Arial,sans-serif" font-size="42" font-weight="700">Wibrawl.</text><text x="64" y="120" fill="#9399A7" font-family="Arial,sans-serif" font-size="16">Three vector directions. One cyberpunk palette.</text>${['blue','pink','yellow'].map((colour, i) => `<rect x="${866 + i * 94}" y="64" width="78" height="24" fill="${palette[colour]}"/><text x="${866 + i * 94}" y="110" font-family="Arial,sans-serif" font-size="12" fill="#9399A7">${palette[colour]}</text>`).join('')}${panelBody}</svg>`;
await sharp(Buffer.from(board)).png().toFile(path.join(directory, 'concepts-preview.png'));
await sharp(Buffer.from(primary())).resize(1452).flatten({ background: '#090B10' }).png().toFile(path.join(directory, 'wibrawl-logo-preview.png'));
console.log(`Wrote ${Object.keys(assets).length} SVG masters, HTML review and two PNG previews to ${directory}`);
