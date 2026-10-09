import { productMediaManifest } from '../react-app/src/lib/productMediaManifest';
import { readBoundedBody } from './security';

// Embed the existing, unchanged mobile display copy. Bigger screens still
// select their full-resolution srcset candidate; new uploads retain normal URLs.
export async function inlineProductImage(product, env, origin) {
  const source=product.images?.[0] || product.image_url;
  const image=productMediaManifest[source]?.[720];
  if(!/^\/product-media\/[a-f0-9]{24}-720\.webp$/.test(image || '')) return null;
  try {
    const response=await env.ASSETS.fetch(new Request(new URL(image,origin),{signal:AbortSignal.timeout(1000)}));
    if(!response.ok || !/^image\/webp(?:;|$)/i.test(response.headers.get('Content-Type') || '')) return null;
    const bytes=await readBoundedBody(response,48*1024);
    if(!bytes.length) return null;
    return {source,data:`data:image/webp;base64,${btoa(String.fromCharCode(...bytes))}`};
  } catch { return null; }
}
