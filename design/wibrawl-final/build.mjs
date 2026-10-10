import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
await fs.mkdir(directory, { recursive: true });
const selected = await fs.readFile(path.join(directory, '..', 'wibrawl-logo', '02-afterimage.svg'), 'utf8');
const artwork = selected.replace(/<title id="logo-title">.*?<\/title>/, '<title id="logo-title">WIBRAWL — Afterimage</title>');
await fs.writeFile(path.join(directory, 'wibrawl-logo.svg'), artwork);
await sharp(Buffer.from(artwork)).resize(2124).png().toFile(path.join(directory, 'wibrawl-logo-transparent.png'));
await sharp(Buffer.from(artwork)).resize(1416).flatten({ background: '#101413' }).png().toFile(path.join(directory, 'wibrawl-logo-preview.png'));
console.log('Finalized the selected Afterimage logo as one SVG master and two PNG exports.');
