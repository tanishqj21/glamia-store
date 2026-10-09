import { catalogueMediaManifest } from './catalogueMediaManifest.js';
export function catalogueMedia(source) {
  return catalogueMediaManifest[source]?.url || source;
}
export function recoverCatalogueMedia(event, original) {
  const image = event.currentTarget;
  if (image.getAttribute('src') !== original) image.src = original;
}
