import sharp from 'sharp';

// Compress existing artwork; never generate or replace a product design here.
for (const width of [480, 720, 960, 1440]) {
  await sharp('public/wibrawl/streetwear-campaign-1440.webp')
    .resize({ width, withoutEnlargement: true })
    .avif({ quality: 45, effort: 6 })
    .toFile(`public/wibrawl/streetwear-campaign-${width}.avif`);
}
for (const theme of ['gaming', 'sports']) {
  await sharp(`public/wibrawl/${theme}-campaign-640.webp`)
    .resize({ width: 96, withoutEnlargement: true })
    .webp({ quality: 76, effort: 6 })
    .toFile(`public/wibrawl/${theme}-campaign-96.webp`);
}
