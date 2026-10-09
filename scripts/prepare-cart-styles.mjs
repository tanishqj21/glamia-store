import { readFileSync, writeFileSync } from 'node:fs';
import { criticalStorefrontCss } from './lib/storefront-critical-css.mjs';

// Mechanical extraction: preserve rule/media order and the existing cart,
// coupon and removal-dialog design without loading all admin/account rules.
const css = readFileSync('react-app/src/route-ui.css', 'utf8');
const cart = criticalStorefrontCss(css, name => /^(?:cart(?:-.+)?|coupon(?:-.+)?|account-page|page-main|page-title|empty-state|loading-card|inline-(?:error|note)|preorder-line-label|selected)$/.test(name));
writeFileSync('react-app/src/cart-ui.css', '/* Generated from route-ui.css by scripts/prepare-cart-styles.mjs. */\n' + cart);
console.log(`Prepared ${Buffer.byteLength(cart)} bytes of cart-specific styles.`);
