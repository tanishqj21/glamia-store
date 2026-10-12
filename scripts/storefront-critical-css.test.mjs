import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { criticalStorefrontCss, deferredStorefrontCss } from './lib/storefront-critical-css.mjs';

test('critical styles retain shell selectors, media order, fonts and used animations', () => {
  const css = ':root{--ink:black}.cinematic-copy,.product-modal{color:var(--ink)}@media(max-width:600px){.cinematic-copy{padding:24px}.product-modal{padding:40px}}.announce{animation:announce-in .4s ease}@keyframes announce-in{from{opacity:0}to{opacity:1}}@keyframes refund-pulse{from{opacity:0}to{opacity:1}}@font-face{font-family:Jost;src:url(/font.woff2)}';
  const result = criticalStorefrontCss(css);
  assert.ok(result.includes(':root{--ink:black}'));
  assert.ok(result.includes('.cinematic-copy{color:var(--ink)}'));
  assert.ok(result.includes('@media(max-width:600px){.cinematic-copy{padding:24px}}'));
  assert.ok(result.includes('@font-face'));
  assert.ok(result.includes('@keyframes announce-in'));
  assert.ok(!result.includes('product-modal'));
  assert.ok(!result.includes('refund-pulse'));
});

test('critical styles keep pseudo-class commas and reject non-shell descendants', () => {
  const result = criticalStorefrontCss('.cinematic-copy:is(:hover,:focus-visible){color:red}.cinematic-copy .product-modal{display:grid}@media(max-width:600px){.product-modal{display:none}}');
  assert.ok(result.includes(':is(:hover,:focus-visible)'));
  assert.ok(!result.includes('product-modal'));
  assert.ok(!result.includes('@media'));
});

test('deferred styles preserve all visual rules without re-declaring loaded fonts', () => {
  const css = '@font-face{font-family:Jost;src:url(/font.woff2)}.product-modal{display:grid}.cinematic-copy{padding:24px}';
  assert.equal(deferredStorefrontCss(css), '.product-modal{display:grid}.cinematic-copy{padding:24px}');
});

test('storefront first screens omit the other brand and private preview styles while retaining the cross-store link', () => {
  const css = ':root{--ink:black}.wordmark{display:flex}.wibrawl-store-pill::before{background:blue}.wibrawl-hero{display:grid}.wibrawl-shell .site-header:not(.admin-site-header){display:grid}.wibrawl-admin-preview .wibrawl-hero{width:500px}.cinematic-copy{padding:30px}:root[data-brand=wibrawl]{--ink:green}';
  const glamia = criticalStorefrontCss(css, () => false, { storefront: 'glamia' });
  assert.ok(glamia.includes('.wordmark') && glamia.includes('.wibrawl-store-pill') && glamia.includes('.cinematic-copy'));
  assert.ok(!glamia.includes('.wibrawl-hero') && !glamia.includes('data-brand=wibrawl'));
  const wibrawl = criticalStorefrontCss(css, () => false, { storefront: 'wibrawl' });
  assert.ok(wibrawl.includes('.wordmark') && wibrawl.includes('.wibrawl-hero') && wibrawl.includes('data-brand=wibrawl'));
  assert.ok(wibrawl.includes('.site-header:not(.admin-site-header)'));
  assert.ok(!wibrawl.includes('.cinematic-copy') && !wibrawl.includes('.wibrawl-admin-preview'));
});

test('every campaign rule stays in public CSS, including responsive rules and interaction states', () => {
  const publicCss = readFileSync('react-app/src/styles.css', 'utf8');
  const routeCss = readFileSync('react-app/src/route-ui.css', 'utf8');
  assert.ok(!routeCss.includes('.campaign-feature'), 'The homepage cannot depend on account/admin route styles');
  const critical = criticalStorefrontCss(publicCss);
  const selectors = css => {
    const result = [];
    postcss.parse(css).walkRules(rule => {
      if (rule.selector.includes('.campaign-feature')) result.push(postcss.list.comma(rule.selector).join(','));
    });
    return result;
  };
  assert.ok(selectors(publicCss).length >= 20, 'Desktop, mobile, pseudo-element and hover rules must remain');
  assert.deepEqual(selectors(critical), selectors(publicCss), 'First paint must also contain the whole campaign layout');
});
