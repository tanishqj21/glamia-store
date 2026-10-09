// Public presentation only. Stock and prices are rechecked by the API; checkout
// continues to validate authoritative values on the server.
import { restoreFirstScreenMedia } from './storefrontBootstrap';
export function readProductBootstrap(reference) {
  if (typeof document === 'undefined') return null;
  try {
    const data = JSON.parse(document.getElementById('glamia-product-bootstrap')?.textContent || 'null');
    const id = data?.product?.id;
    if (!id || (reference !== id && !String(reference).endsWith(`-${id}`))) return null;
    // Do not reuse this page's bootstrap after client-side navigation elsewhere.
    if (data.path !== window.location.pathname) return null;
    return restoreFirstScreenMedia(data, document).product;
  } catch { return null; }
}
