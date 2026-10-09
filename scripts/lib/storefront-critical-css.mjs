import postcss from 'postcss';

// Only the server-rendered header, hero, promises, event and editorial need
// inline CSS. The unmodified full stylesheet still loads before React mounts.
const shellClass = /^(?:app-shell|skip-link|sr-only|announce(?:-.+)?|site-header|menu-button|tool-button|quick-links|wordmark|header-tools|header-credits|search-box|search-suggest(?:-.+)?|login-link|account(?:-.+)?|heart-link|nav(?:-.+)?|menu(?:-.+)?|cinematic-(?:home(?:-.+)?|copy|words|stage|frame(?:-.+)?|arrow|prev|next|progress)|hero-gradient(?:-.+)?|primary-action|secondary-action|text-link|eyebrow|trust-(?:strip(?:-.+)?|promise)|campaign-feature(?:-.+)?|event-theme-.+|homepage-editorial(?:-.+)?|active|muted)$/;

export function criticalStorefrontCss(css, additionalClass = () => false) {
  const root = postcss.parse(css);
  root.walkComments(comment => comment.remove());
  root.walkRules(rule => {
    // Keyframe selectors are not document selectors.
    if (rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const selectors = postcss.list.comma(rule.selector).filter(selector => {
      const classes = [...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match => match[1]);
      return classes.every(name => shellClass.test(name) || additionalClass(name) || /^(?:site-footer|footer(?:-.+)?)$/.test(name) || ['ui-icon', 'theme-toggle', 'cart-link', 'cart-count'].includes(name));
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
