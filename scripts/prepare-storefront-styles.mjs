import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { criticalStorefrontCss, deferredStorefrontCss } from './lib/storefront-critical-css.mjs';

// Keep server-rendered styles exactly aligned with Vite's reviewed entry CSS.
const manifest = JSON.parse(readFileSync('public/.vite/manifest.json', 'utf8'));
// The theme boot scripts must run before paint without weakening the CSP.
const scriptHashes = [...readFileSync('public/index.html', 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(([, attributes, code]) => !/\bsrc\s*=/.test(attributes) && code.trim())
  .map(([, , code]) => createHash('sha256').update(code).digest('base64'));
const entry = Object.values(manifest).find(item => item.isEntry);
if (!entry?.css?.length) throw new Error('Storefront entry CSS missing');
const mainEntry = Object.keys(manifest).find(key => /(?:^|\/)main\.jsx$/.test(key));
function routeAssets(component) {
  const root = Object.keys(manifest).find(key => key.endsWith(`/${component}.jsx`));
  const visited = new Set(), scripts = new Set(), styles = new Set();
  function visit(key) {
    if (!key || visited.has(key)) return;
    visited.add(key);
    const item = manifest[key];
    if (!item) return;
    if (item.file?.endsWith('.js')) scripts.add(item.file);
    for (const style of item.css || []) styles.add(style);
    for (const dependency of item.imports || []) visit(dependency);
  }
  visit(mainEntry); visit(root);
  // Route CSS is a separate lazy boundary in the application.
  if (component && component !== 'CartPage') visit(Object.keys(manifest).find(key => key.endsWith('/RouteStyles.jsx')));
  return { scripts: [...scripts], styles: [...styles] };
}
const routePreloads = Object.fromEntries(['ProductDetailPage', 'CartPage', 'CheckoutPage', 'AccountPages', 'PublicPages', ''].map(component => [component || 'catalogue', routeAssets(component)]));
const fullCss = entry.css.map(file => readFileSync('public/' + file, 'utf8')).join('\n');
const firstScreenFonts = JSON.parse(readFileSync('src/first-screen-fonts.json', 'utf8'));
const inlineFontRules = firstScreenFonts.map(font => {
  if (!/^fonts\/first-screen-[a-f0-9]{12}\.woff2$/.test(font.file) || !['Jost', 'Cormorant Garamond'].includes(font.family)) throw Error('Unexpected first-screen font');
  const bytes = readFileSync('public/' + font.file);
  if (bytes.length !== font.bytes || bytes.length > 30000) throw Error('First-screen font exceeds its verified budget');
  return { family: font.family, css: `@font-face{font-family:"${font.family}";font-style:normal;font-weight:400 600;font-display:swap;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format("woff2");unicode-range:${font.range}}` };
});
const withReadyFonts = (css, families = ['Jost', 'Cormorant Garamond']) => css + '\n' + inlineFontRules.filter(font => families.includes(font.family)).map(font => font.css).join('\n');
const routeCss = (routePreloads.ProductDetailPage.styles || []).filter(file => !entry.css.includes(file)).map(file => readFileSync('public/' + file, 'utf8')).join('\n');
const productClass = name => /^(?:page-main|page-title|detail(?:-.+)?|product(?:-.+)?|gallery(?:-.+)?|size-list|colourway(?:-.+)?|preorder(?:-.+)?|review(?:-.+)?|question(?:-.+)?|delivery(?:-.+)?|form-hint|inline-note|inline-error|selected|is-.+|empty-state|loading-card|special-price-label)$/.test(name);
// Keep the entire public stylesheet, plus all product/review/question route
// rules. Product pages must not download the unrelated admin/account sheet.
const fullProductCss = fullCss + '\n' + criticalStorefrontCss(routeCss, productClass);
const fullCartCss = fullCss + '\n' + (routePreloads.CartPage.styles || []).filter(file => !entry.css.includes(file)).map(file => readFileSync('public/' + file, 'utf8')).join('\n');
const cartCss = criticalStorefrontCss(fullCartCss, name => /^(?:page-main|page-title|cart(?:-.+)?|account-page|empty-state|muted)$/.test(name));
const productCss = criticalStorefrontCss(fullProductCss, productClass);
const catalogueCss = criticalStorefrontCss(fullCss, name => /^(?:page-main|page-title|catalog(?:-.+)?|product(?:-.+)?|wishlist-button|quick-view|preorder-badge|section-heading|result-count|filter-row|empty-state|inline-note|selected|special-price-label|is-.+)$/.test(name));
const routeCriticalStyles = {};
for (const [name, critical, complete] of [['product', productCss, fullProductCss], ['catalogue', catalogueCss, fullCss], ['cart', cartCss, fullCartCss]]) {
  if (/<\/style/i.test(critical)) throw Error('Unsafe route CSS');
  const deferred = deferredStorefrontCss(complete);
  const filename = `assets/${name}-styles-${createHash('sha256').update(deferred).digest('hex').slice(0, 8)}.css`;
  writeFileSync('public/' + filename, deferred);
  manifest[`glamia-${name}-styles.css`] = { file: filename, src: `glamia-${name}-styles.css` };
  const ready = withReadyFonts(critical);
  routeCriticalStyles[name] = { css: ready, hash: createHash('sha256').update(ready).digest('base64'), file: filename };
}
const css = withReadyFonts(criticalStorefrontCss(fullCss, () => false, { storefront: 'glamia' }));
const wibrawlCss = withReadyFonts(criticalStorefrontCss(fullCss, () => false, { storefront: 'wibrawl' }), ['Jost']);
const wibrawlHash = createHash('sha256').update(wibrawlCss).digest('base64');
if (/<\/style/i.test(css)) throw new Error('Unsafe CSS closing tag');
const hash = createHash('sha256').update(css).digest('base64');
const deferredCss = deferredStorefrontCss(fullCss);
const deferredHash = createHash('sha256').update(deferredCss).digest('hex').slice(0, 8);
const deferredFile = `assets/homepage-styles-${deferredHash}.css`;
writeFileSync('public/' + deferredFile, deferredCss);
manifest['glamia-homepage-styles.css'] = { file: deferredFile, src: 'glamia-homepage-styles.css' };
writeFileSync('public/.vite/manifest.json', JSON.stringify(manifest, null, 2));
writeFileSync('src/storefront-styles.js', `// Generated by scripts/prepare-storefront-styles.mjs after the React build.\nexport const storefrontCss = ${JSON.stringify(css)};\nexport const wibrawlStorefrontCss = ${JSON.stringify(wibrawlCss)};\nexport const wibrawlStorefrontStyleHash = ${JSON.stringify(wibrawlHash)};\nexport const storefrontStyleHash = ${JSON.stringify(hash)};\nexport const storefrontScriptHashes = ${JSON.stringify(scriptHashes)};\nexport const storefrontStyleFiles = ${JSON.stringify(entry.css)};\nexport const storefrontDeferredStyleFile = ${JSON.stringify(deferredFile)};\nexport const storefrontRoutePreloads = ${JSON.stringify(routePreloads)};\nexport const storefrontRouteCriticalStyles = ${JSON.stringify(routeCriticalStyles)};\n`);
console.log(`Prepared ${Buffer.byteLength(css)} bytes of first-screen CSS (full stylesheet: ${Buffer.byteLength(fullCss)} bytes) with its CSP hash.`);
