import postcss from 'postcss';

// Only the server-rendered header, hero, promises, event and editorial need
// inline CSS. The unmodified full stylesheet still loads before React mounts.
const shellClass = /^(?:app-shell|skip-link|sr-only|announce(?:-.+)?|site-header|menu-button|tool-button|quick-links|wordmark|header-tools|header-credits|search-box|search-suggest(?:-.+)?|login-link|account(?:-.+)?|heart-link|nav(?:-.+)?|menu(?:-.+)?|cinematic-(?:home(?:-.+)?|copy|words|stage|frame(?:-.+)?|arrow|prev|next|progress)|hero-gradient(?:-.+)?|primary-action|secondary-action|text-link|eyebrow|trust-(?:strip(?:-.+)?|promise)|campaign-feature(?:-.+)?|event-theme-.+|homepage-editorial(?:-.+)?|active|muted)$/;
// Wibrawl's first document contains the command bar, hero, hubs and footer.
// Catalogue/account/admin and retired-layout rules arrive in the deferred CSS.
const wibrawlShellClass = /^(?:wibrawl-(?:shell|logo|primary-action|secondary-action)|wb-(?:storefront|tech|hint(?:-badge)?|header(?:-.+)?|command-.+|logo-badge|hub-bar|category-trigger|icon-action|search-trigger|mode-switch|credit-badge|count|dock-symbol|arena-.+|hero--.+|poster-hud|collage-.+|split-.+|spine-loop|home-(?:telemetry|hubs|hub-sign|signoff)|stadium-footer|footer-.+|catalog-deck|product-spec-page)|is-current|is-paused)$/;
const wibrawlSharedClass = /^(?:app-shell|skip-link|sr-only|announce(?:-.+)?|primary-action|secondary-action|text-link|trust-(?:strip(?:-.+)?|promise)|ui-icon|cart-link|cart-count|glamia-logo|active|muted)$/;

export function criticalStorefrontCss(css, additionalClass = () => false, { storefront = 'both' } = {}) {
  const root = postcss.parse(css);
  root.walkComments(comment => comment.remove());
  root.walkRules(rule => {
    // Keyframe selectors are not document selectors.
    if (rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const selectors = postcss.list.comma(rule.selector).filter(selector => {
      // A public rule such as .site-header:not(.admin-site-header) must stay:
      // the negated private class is not a dependency of the visible shell.
      const positiveSelector = selector.replace(/:not\([^)]*\)/g, '');
      const classes = [...positiveSelector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match => match[1]);
      if (storefront === 'wibrawl' && classes.some(name => !wibrawlShellClass.test(name) && !wibrawlSharedClass.test(name))) return false;
      if (classes.some(name => /^(?:admin-|wibrawl-admin-|wibrawl-preview-)/.test(name))) return false;
      if (storefront === 'glamia' && (/data-brand=["']?wibrawl/.test(selector) || classes.some(name => /^wb-/.test(name) || /^wibrawl-/.test(name) && !['wibrawl-store-link', 'wibrawl-store-pill'].includes(name)))) return false;
      if (storefront === 'wibrawl' && classes.some(name => /^(?:cinematic-(?:home|copy|words|stage|frame|arrow|prev|next|progress)|homepage-editorial|campaign-feature)/.test(name))) return false;
      return classes.every(name => shellClass.test(name) || additionalClass(name) || /^(?:site-footer|footer(?:-.+)?|wibrawl(?:-.+)?|wb-.+)$/.test(name) || ['ui-icon', 'theme-toggle', 'cart-link', 'cart-count', 'glamia-logo'].includes(name));
    });
    if (selectors.length) rule.selector = selectors.join(',');
    else rule.remove();
  });
  const animations = new Set();
  root.walkDecls(/^animation(?:-name)?$/, declaration => {
    for (const token of declaration.value.match(/[a-zA-Z_][\w-]*/g) || []) animations.add(token);
  });
  root.walkAtRules(rule => {
    if (/keyframes$/i.test(rule.name) && !animations.has(rule.params)) rule.remove();
  });
  // Work from the inside out so empty responsive wrappers are removed too.
  const wrappers = [];
  root.walkAtRules(rule => { if (rule.nodes) wrappers.push(rule); });
  for (const rule of wrappers.reverse()) if (!rule.nodes.length) rule.remove();
  return root.toString();
}

export function deferredStorefrontCss(css) {
  const root = postcss.parse(css);
  // The inline shell already declares these exact font faces. Declaring them
  // again creates new FontFace objects and can trigger a second swap/reflow.
  root.walkAtRules('font-face', rule => rule.remove());
  return root.toString();
}
