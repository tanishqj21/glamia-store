import { STOREFRONT_ORIGINS } from '../../../src/storefront-identity.js';
import { apiFetch } from './api';

// Upgrade an existing host-only login without redirects or exposing the token
// to JavaScript. New logins already use the shared HttpOnly cookie.
export async function readStorefrontSession() {
  const read = async () => {
    const response = await apiFetch('/api/session', { dedupe: true });
    return response.ok ? response.json() : {};
  };
  let session = await read();
  if (session.user || !STOREFRONT_ORIGINS.includes(window.location.origin)) return session;
  for (const origin of STOREFRONT_ORIGINS.filter(origin => origin !== window.location.origin)) {
    try {
      const response = await fetch(`${origin}/api/session/storefront-bridge`, {
        credentials: 'include', headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok && (await response.json()).shared) {
        session = await read();
        if (session.user) break;
      }
    } catch { /* Guest browsing remains available if a sibling host is offline. */ }
  }
  return session;
}
