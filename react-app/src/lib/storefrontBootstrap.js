// Reuse the bytes already present in the server-rendered first photo. The JSON
// keeps the original URL, not a second copy of the same embedded image.
export function restoreFirstScreenMedia(data, rootDocument) {
  if (!data || !rootDocument) return data;
  const readImage = selector => {
    const image = rootDocument.querySelector(selector);
    const candidate = (image?.getAttribute('srcset') || image?.getAttribute('src') || '').match(/data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+/)?.[0];
    return candidate && candidate.length <= 65600 ? candidate : null;
  };
  if (data.hero?.first_image_from_dom) {
    const image = readImage('#root .cinematic-home .cinematic-frame img, #root .wibrawl-hero-frames img');
    const frame = data.hero.slides?.[0]?.frames?.[0];
    if (image && frame) frame.image = image;
  }
  if (data.product?.first_image_inline?.from_dom) {
    const image = readImage('#root .detail-gallery > img');
    if (image) data.product.first_image_inline = { source: data.product.first_image_inline.source, data: image };
    else data.product.first_image_inline = null;
  }
  return data;
}
