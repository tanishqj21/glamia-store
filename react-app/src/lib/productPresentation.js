function productImage(product) {
  return product.thumbnail_url || product.image_url || product.image || product.images?.[0] || "";
}

function productSizes(product) {
  if (Array.isArray(product.sizes)) return product.sizes;
  if (typeof product.sizes === "string") {
    try { return JSON.parse(product.sizes); } catch { return product.sizes.split(",").map((size) => size.trim()).filter(Boolean); }
  }
  return [];
}

function normalizeProduct(product) {
  return { ...product, sizes: productSizes(product), image_url: productImage(product) };
}


export { productImage, productSizes, normalizeProduct };
