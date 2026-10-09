// Generate display copies only. Never overwrite the merchant's R2 originals
// or mutate product/order records. No customer or authenticated API is read.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const origin = 'https://glamiastore.com';
const output = 'public/product-media';
await mkdir(output, { recursive: true });
async function json(path) {
  const response = await fetch(origin + path);
  if (!response.ok) throw Error(`Public catalogue read failed: ${response.status}`);
  return response.json();
}
const products = [];
for (let page = 1; page <= 100; page++) {
  const data = await json(`/api/products?view=cards&limit=100&page=${page}`);
  products.push(...(data.products || []));
  if (!data.pagination?.has_more) break;
  if (page === 100) throw Error('Catalogue exceeds the explicit safety bound');
}
const paths = new Set();
for (const card of products) {
  const data = await json(`/api/products/${encodeURIComponent(card.id)}?cache=1`);
  const product = data.product || data;
  for (const image of product.images || []) {
    if (/^\/api\/assets\/products\/[\w-]+\/[\da-f-]{36}\.(png|jpe?g|webp)$/i.test(image)) paths.add(image);
  }
}
const manifest = {};
let originalBytes = 0;
let displayBytes = 0;
for (const source of paths) {
  const response = await fetch(origin + source);
  if (!response.ok || !/^image\/(png|jpeg|webp)(?:;|$)/.test(response.headers.get('content-type') || '')) throw Error('Unexpected product media response');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 25 * 1024 * 1024) throw Error('Product image exceeds the explicit 25 MB limit');
  const image = sharp(bytes, { limitInputPixels: 40000000 }).rotate();
  const metadata = await image.metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format)) throw Error('Only raster product photos may be converted');
  const record = {};
  for (const width of [160, 720, 960, 1600]) {
    const buffer = await image.clone().resize({ width, withoutEnlargement: true }).webp({ quality: width === 160 ? 75 : 85, effort: 5 }).toBuffer();
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
    const file = `${hash}-${width}.webp`;
    await writeFile(`${output}/${file}`, buffer);
    record[width] = `/product-media/${file}`;
    if (width === 960) displayBytes += buffer.length;
  }
  manifest[source] = record;
  originalBytes += bytes.length;
  console.log(JSON.stringify({ image: paths.size && Object.keys(manifest).length, total: paths.size, originalBytes: bytes.length }));
}
await writeFile('react-app/src/lib/productMediaManifest.js', `// Generated raster display copies. Original uploads remain untouched.\nexport const productMediaManifest = ${JSON.stringify(manifest, null, 2)};\n`);
console.log(JSON.stringify({ images: paths.size, originalBytes, mobileDisplayBytes: displayBytes, reductionPercent: Math.round((1 - displayBytes / originalBytes) * 100) }));
