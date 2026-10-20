# Footer redesign — 20 October 2026

Both storefronts use a shared semantic footer structure, with each brand keeping
its own logo, palette, shop language and configured social URLs. Glamia uses its
existing surface colours instead of an inverted black footer. Wibrawl keeps its
streetwear identity with a smaller mark and quieter tagline. Both themes retain
the same geometry.

References selected from the user's reference sheet:

- https://daisyui.com/components/footer/ — grouped navigation, logo section and a
  separate legal/copyright area.
- https://skiper-ui.com/v1/skiper40 — restrained link interaction as a direction.
  The hover CSS is original; no Skiper code or Framer Motion dependency was added.

Shop and customer-care links have comfortable hit areas. Policies remain visible
on phones in two columns. Domain-specific socials omit empty or unsafe URLs.
Cross-store links remain native anchors, preserving the account-cart handoff.
Keyboard focus is visible; reduced-motion settings disable the hover transitions.
The parent-brand SVG in Wibrawl's footer loads lazily. There are no fabricated
newsletter forms, contact details or payment badges.

Implementation:

- Shared structure: react-app/src/components/FooterParts.jsx
- Brand wrappers: StorefrontFooter.jsx and WibrawlFooter.jsx
- Shared styles: react-app/src/footer.css
- Removed retired footer rules from existing stylesheets.
- Footer shell styles are included in server-rendered critical CSS for both stores.

Validation:

- scripts/footer-browser-test.mjs: 16 accessibility/overflow audits across
  360/390/768/1440px, both brands and both themes; all passed.
- Empty, invalid and all-seven-social settings; policy/shop/care routes; native
  sibling links; keyboard focus; unchanged theme geometry; internal navigation;
  transform-only hover with no layout movement and reduced motion: passed.
- scripts/wibrawl.test.mjs + scripts/storefront-critical-css.test.mjs:
  20 server-rendering, storefront and critical CSS tests passed.
- Scoped footer lint: passed without warnings. Production build and complete
  asset graph checks passed. No new runtime dependencies or API/database changes.

Local screenshots and reports: tmp/footer-review/.
