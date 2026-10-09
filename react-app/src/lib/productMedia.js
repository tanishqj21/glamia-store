import { productMediaManifest } from './productMediaManifest';

export function productMedia(source, width = 1600) {
  return productMediaManifest[source]?.[width] || source;
}

export function productMediaSrcSet(source, inlineImage = null) {
  const variants = productMediaManifest[source];
  const mobile = inlineImage?.source === source && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(inlineImage.data || '') && inlineImage.data.length <= 65600 ? inlineImage.data : variants?.[720];
  return variants ? [mobile && `${mobile} 720w`, `${variants[960]} 960w`, `${variants[1600]} 1600w`].filter(Boolean).join(', ') : undefined;
}

export function recoverProductMedia(event, original) {
  const image = event.currentTarget;
  if (image.getAttribute('src') === original) return;
  image.removeAttribute('srcset');
  image.src = original;
}
