// One source of truth for the storefront's public hostname and collection names.
export const WIBRAWL_HOSTNAME = 'wibrawl.glamiastore.com';
export const WIBRAWL_ORIGIN = `https://${WIBRAWL_HOSTNAME}`;
export const STOREFRONT_ORIGINS = Object.freeze([
  'https://glamiastore.com', 'https://www.glamiastore.com', WIBRAWL_ORIGIN
]);

export function isWibrawlUrl(input) {
  const url = input instanceof URL ? input : new URL(input);
  const hostname = url.hostname.toLowerCase();
  return hostname === WIBRAWL_HOSTNAME
    || (['localhost', '127.0.0.1'].includes(hostname) && url.searchParams.has('wibrawl-preview'));
}

export function storefrontForUrl(input) {
  return isWibrawlUrl(input) ? 'wibrawl' : 'glamia';
}

export function collectionNames(theme) {
  return theme === 'gaming'
    ? { offers: 'Loot Deals', arrived: 'Just Spawned', best: 'Current Meta' }
    : { offers: 'Matchday Deals', arrived: 'New Signings', best: 'League Leaders' };
}

export function preferredWibrawlTheme(saved, prefersDark) {
  return saved === 'gaming' || saved === 'sports' ? saved : prefersDark ? 'gaming' : 'sports';
}
