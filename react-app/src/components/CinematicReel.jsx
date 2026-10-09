import { useEffect, useMemo, useState } from "react";
import { productUrl } from "../lib/commerce";
import { Icon } from "./Icon";

const DEFAULT_SETTINGS = {
  visible: true,
  eyebrow: "The current mood",
  title: "Pieces that move",
  emphasis: "with you.",
  description: "",
  product_ids: []
};

export function CinematicReel({ products = [], settings = {}, onNavigate }) {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const manualIds = Array.isArray(mergedSettings.product_ids)
    ? [...new Set(mergedSettings.product_ids.map((id) => String(id)).filter(Boolean))]
    : [];
  const sourceProducts = manualIds.length
    ? manualIds.map((id) => products.find((product) => product.id === id)).filter(Boolean)
    : products;
  const uniqueProducts = useMemo(() => {
    const seen = new Set();
    return sourceProducts.filter((product) => {
      const key = product.variant_group || product.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return Boolean(product.image_url || product.thumbnail_url);
    }).slice(0, 8);
  }, [sourceProducts]);
  const [index, setIndex] = useState(0);

  useEffect(() => { if (index >= uniqueProducts.length) setIndex(0); }, [index, uniqueProducts.length]);
  useEffect(() => {
    if (uniqueProducts.length < 2) return undefined;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % uniqueProducts.length), 5200);
    return () => window.clearInterval(timer);
  }, [uniqueProducts.length]);

  if (mergedSettings.visible === false || !uniqueProducts.length) return null;
  const active = uniqueProducts[index] || uniqueProducts[0];
  const supporting = uniqueProducts.map((product, itemIndex) => ({ product, itemIndex })).filter(({ itemIndex }) => itemIndex !== index).slice(0, 3);
  const navigateToProduct = () => onNavigate?.(productUrl(active));

  return <section className="cinematic-reel" aria-labelledby="cinematic-reel-title">
    <div className="cinematic-reel-heading"><div><p className="eyebrow">{mergedSettings.eyebrow || DEFAULT_SETTINGS.eyebrow}</p><h2 id="cinematic-reel-title">{mergedSettings.title || DEFAULT_SETTINGS.title}<br /><em>{mergedSettings.emphasis || DEFAULT_SETTINGS.emphasis}</em></h2>{mergedSettings.description && <p>{mergedSettings.description}</p>}</div><span>{String(index + 1).padStart(2, "0")} / {String(uniqueProducts.length).padStart(2, "0")}</span></div>
    <div className="cinematic-reel-stage"><button type="button" className="cinematic-reel-feature" onClick={navigateToProduct}><img src={active.image_url || active.thumbnail_url} alt={active.name} /><span><strong>{active.name}</strong><small>{active.category || "The collection"} · View piece </small></span></button><div className="cinematic-reel-supporting">{supporting.map(({ product, itemIndex }) => <button type="button" key={product.id} className="cinematic-reel-supporting-card" onClick={() => { setIndex(itemIndex); }}><img src={product.thumbnail_url || product.image_url} alt={product.name} loading="lazy" /><span>{product.name}</span></button>)}</div></div>
    <div className="cinematic-reel-controls"><button type="button" onClick={() => setIndex((current) => (current - 1 + uniqueProducts.length) % uniqueProducts.length)} aria-label="Previous mood piece"><Icon name="chevronLeft" /></button><div>{uniqueProducts.map((product, itemIndex) => <button type="button" key={product.id} className={itemIndex === index ? "active" : ""} onClick={() => setIndex(itemIndex)} aria-label={`Show ${product.name}`} />)}</div><button type="button" onClick={() => setIndex((current) => (current + 1) % uniqueProducts.length)} aria-label="Next mood piece"><Icon name="chevronRight" /></button></div>
  </section>;
}
