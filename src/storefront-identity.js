// One source of truth for the storefront's public hostname and collection names.
export const WIBRAWL_HOSTNAME = 'wibrawl.glamiastore.com';
export const WIBRAWL_ORIGIN = `https://${WIBRAWL_HOSTNAME}`;
export const GLAMIA_ORIGIN = 'https://glamiastore.com';
export const STOREFRONT_ORIGINS = Object.freeze([
  'https://glamiastore.com', 'https://www.glamiastore.com', WIBRAWL_ORIGIN
]);

export const WIBRAWL_HERO_LAYOUTS = Object.freeze(['poster', 'collage', 'split']);

export function isWibrawlUrl(input) {
  const url = input instanceof URL ? input : new URL(input);
  const hostname = url.hostname.toLowerCase();
  return hostname === WIBRAWL_HOSTNAME
    || (['localhost', '127.0.0.1'].includes(hostname) && url.searchParams.has('wibrawl-preview'));
}

export function storefrontForUrl(input) {
  return isWibrawlUrl(input) ? 'wibrawl' : 'glamia';
}

// Shared products stay on the current store; exclusive products open on their owner.
export function productStorefront(product, current = 'glamia') {
  const visibility = product?.storefront_visibility || 'glamia';
  return visibility === 'both' ? current : visibility === 'wibrawl' ? 'wibrawl' : 'glamia';
}

export function storefrontOrigin(storefront) {
  return storefront === 'wibrawl' ? WIBRAWL_ORIGIN : GLAMIA_ORIGIN;
}

export function collectionNames(theme) {
  return theme === 'gaming'
    ? { offers: 'Loot Deals', arrived: 'Just Spawned', best: 'Current Meta' }
    : { offers: 'Matchday Deals', arrived: 'New Signings', best: 'League Leaders' };
}

export function preferredWibrawlTheme(saved, prefersDark) {
  return saved === 'gaming' || saved === 'sports' ? saved : prefersDark ? 'gaming' : 'sports';
}
