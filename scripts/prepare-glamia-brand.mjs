import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const master = new URL('design/glamia-brand/', root);
const destination = new URL('public/glamia/', root);
await mkdir(destination, { recursive: true });
for (const file of ['g.svg', 'logo.svg', 'logo-light.svg']) {
  await copyFile(new URL(file, master), new URL(file, destination));
}
const mark = await readFile(new URL('g.svg', master), 'utf8');
const logo = await readFile(new URL('logo.svg', master), 'utf8');
const letters = await readFile(new URL('lettering.svg', master), 'utf8');
const letteringBody = letters.slice(letters.indexOf('>') + 1, letters.lastIndexOf('</svg>'));
const viewBox = logo.match(/viewBox="([^"]+)"/)[1];
await writeFile(new URL('public/favicon.svg', root), mark);
await writeFile(new URL('react-app/src/components/GlamiaLogo.jsx', root), `// Generated from design/glamia-brand by scripts/prepare-glamia-brand.mjs.
import React from 'react';

export function GlamiaLogo({ className = '', ...props }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" className={'glamia-logo ' + className} role="img" aria-label="Glamia" {...props}><image href="/glamia/g.svg" width="512" height="512" />${letteringBody}</svg>;
}
`);

for (const app of ['glamia-shoppers-app', 'glamia-packer-app']) {
  const assets = new URL(`${app}/assets/`, root);
  await copyFile(new URL('g.svg', master), new URL('glamia-favicon.svg', assets));
  await copyFile(new URL('logo.svg', master), new URL('glamia-logo.svg', assets));
  await copyFile(new URL('CormorantGaramond-OFL.txt', master), new URL('CormorantGaramond-OFL.txt', assets));
  // Native launcher formats require PNG; their artwork comes from the vector master.
  const foreground = await sharp(Buffer.from(mark)).resize(620, 620).png().toBuffer();
  const icon = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#151515' } })
    .composite([{ input: foreground, gravity: 'centre' }]).png().toBuffer();
  await writeFile(new URL(app === 'glamia-shoppers-app' ? 'glamia-icon.png' : 'icon.png', assets), icon);
  await writeFile(new URL('glamia-adaptive.png', assets), await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
    .composite([{ input: foreground, gravity: 'centre' }]).png().toBuffer());
  const component = `// Generated from design/glamia-brand. Run scripts/prepare-glamia-brand.mjs.
import React, { memo, useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
const logo = ${JSON.stringify(logo)};
const mark = ${JSON.stringify(mark)};
export const GlamiaLogo = memo(function GlamiaLogo({ width = 200, height = 40, color = '#151515', markOnly = false, ...props }) {
  const xml = useMemo(() => markOnly ? mark : logo.replaceAll('#151515', color), [color, markOnly]);
  return <SvgXml xml={xml} width={width} height={height} accessible accessibilityLabel="Glamia" {...props} />;
});
`;
  await writeFile(new URL(`${app}/src/GlamiaLogo.js`, root), component);
}
console.log('Prepared Glamia SVG logo, SVG favicon, and native brand assets.');
