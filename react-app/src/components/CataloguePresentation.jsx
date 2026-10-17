import React, { useState } from 'react';
import { Link, productSubSubcategory, searchMatches } from './Header';
import { sellingPrice, isPreorder, productUrl } from '../lib/commerce';
import { useCatalogue } from '../lib/useCatalogue';
import { RecentlyViewed } from './RecentlyViewed';
import { Icon } from './Icon';
import { SpecialPrice } from './SpecialPrice';
import { catalogueMedia, recoverCatalogueMedia } from '../lib/catalogueMedia';
import { useWibrawlCommerce } from '../lib/wibrawlStorefront';
import { WibrawlProductCard } from './WibrawlProductCard';

export function selectNewInProducts(products = [], limit = 8) {
  const candidates = (Array.isArray(products) ? products : [])
    .map((product, index) => ({ product, index, createdAt: Date.parse(product?.created_at || "") }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.createdAt) ? left.createdAt : 0;
      const rightTime = Number.isFinite(right.createdAt) ? right.createdAt : 0;
      return rightTime - leftTime || left.index - right.index;
    })
    .map(({ product }) => product);
  const maxItems = Math.max(0, Math.floor(Number(limit) || 0));
  if (!maxItems) return [];

  const selected = [];
  const selectedByListing = new Map();
  const selectedProducts = new Set();
  const selectedCategories = new Set();
  const listingKey = (product) => String(product?.variant_group || product?.id || product?.slug || product?.name || "");
  const categoryKey = (product) => String(product?.category || "Other").trim().toLowerCase() || "other";
  const add = (product, diversify) => {
    const listing = listingKey(product);
    const productKey = product?.id || product?.slug || product;
    if (!listing || selectedProducts.has(productKey) || (selectedByListing.get(listing) || 0) >= 2) return false;
    const category = categoryKey(product);
    if (diversify && selectedCategories.has(category)) return false;
    selected.push(product);
    selectedProducts.add(productKey);
    selectedByListing.set(listing, (selectedByListing.get(listing) || 0) + 1);
    selectedCategories.add(category);
    return true;
  };

  // First take the newest representative from each category, then use the
  // remaining slots for additional fresh listings/colourways (max two each).
  candidates.some((product) => selected.length >= maxItems || add(product, true));
  if (selected.length < maxItems) candidates.forEach((product) => {
    if (selected.length < maxItems) add(product, false);
  });
  return selected;
}


function colorFamily(value) {
  const color = String(value || "").toLowerCase();
  const families = [["green", /green|teal|mint|olive|sage|emerald/], ["blue", /blue|navy|cobalt|aqua|cyan/], ["red", /red|maroon|burgundy|crimson|coral/], ["pink", /pink|rose|fuchsia|magenta/], ["purple", /purple|plum|violet|lilac/], ["yellow", /yellow|mustard|gold/], ["orange", /orange|rust|terracotta/], ["brown", /brown|tan|camel|beige|khaki/], ["black", /black|charcoal|midnight/], ["white", /white|ivory|cream/], ["grey", /grey|gray|silver/]];
  return families.find(([, pattern]) => pattern.test(color))?.[0] || String(value || "Other").trim().toLowerCase() || "Other";
}

function colorMatches(product, family) {
  return !family || colorFamily(product.color) === family;
}


export function ProductCard({ product, onNavigate, wishlist, toggleWishlist, onQuickView, eventLive = false, index = 0, headingLevel = 3, aboveFold = false }) {
  const wibrawl = useWibrawlCommerce();
  if (wibrawl) return <WibrawlProductCard product={product} onNavigate={onNavigate} wishlist={wishlist} toggleWishlist={toggleWishlist} onQuickView={onQuickView} index={index} headingLevel={headingLevel} aboveFold={aboveFold} />;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const id = product.id || product.slug;
  const delayClass = `product-card-delay-${Math.min(Math.max(Number(index) || 0, 0), 11)}`;
  return <article className={`product-card ${delayClass}`}>{isPreorder(product) && <span className="product-badge preorder-badge">Pre-order</span>}<button className={`wishlist-button ${wishlist.has(id) ? "is-saved" : ""}`} onClick={() => toggleWishlist(id)} aria-label={`${wishlist.has(id) ? "Remove" : "Add"} ${product.name} ${wishlist.has(id) ? "from" : "to"} wishlist`}><Icon name="heart" size={20} /></button><button className="product-image" onClick={() => onQuickView(product)} aria-label={`View ${product.name}`}>{product.image_url ? <img src={catalogueMedia(product.image_url)} onError={event => recoverCatalogueMedia(event, product.image_url)} alt={product.name} loading={aboveFold ? "eager" : "lazy"} fetchPriority={aboveFold && index === 0 ? "high" : undefined} decoding="async" width="480" height="600" sizes="(max-width: 700px) 46vw, (max-width: 1100px) 30vw, 22vw" /> : <span>No image</span>}<span className="quick-view">Quick view</span></button><div className="product-info"><p>{product.brand || product.category || "Glamia"}</p><Heading><Link href={productUrl(product)} onNavigate={onNavigate}>{product.name}</Link></Heading><SpecialPrice product={product} eventLive={eventLive} />{isPreorder(product) && <small className="product-availability">Reserve before it arrives</small>}</div></article>;
}


export function CatalogPage({ title, products, loading, error, categories, storefrontName = "Glamia", activeCategory, activeSubcategory = "", activeSubSubcategory = "", setActiveCategory, query, onNavigate, wishlist, toggleWishlist, onQuickView, eventLive = false, homepageNewIn = false, hasMoreProducts = false, loadingMoreProducts = false, productTotal = products.length, onLoadMore, pathname = typeof window === "undefined" ? "/" : window.location.pathname, initialCatalogue = null }) {
  const [color, setColor] = useState(""); const [size, setSize] = useState(""); const [minPrice, setMinPrice] = useState(""); const [maxPrice, setMaxPrice] = useState("");
  const [sort,setSort]=useState(pathname==="/just-arrived"?"newest":"featured");
  const catalogue=useCatalogue({enabled:!homepageNewIn,category:activeCategory,subcategory:activeSubcategory,subsubcategory:activeSubSubcategory,query:pathname==="/search"?(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("q")||query):query,color,size,minPrice,maxPrice,sort,mode:pathname,initial:initialCatalogue});
  if(!homepageNewIn){products=catalogue.products;loading=catalogue.loading;error=catalogue.error;hasMoreProducts=catalogue.pagination?.has_more;loadingMoreProducts=catalogue.loading;productTotal=catalogue.pagination?.total||0;onLoadMore=catalogue.loadMore;}
  const scoped = products.filter((product) => (!activeCategory || activeCategory === "All" || product.category === activeCategory) && (!activeSubcategory || product.subcategory === activeSubcategory) && (!activeSubSubcategory || productSubSubcategory(product) === activeSubSubcategory) && (storefrontName === "Wibrawl" ? `${product.name || ""} ${product.category || ""} ${product.subcategory || ""} ${product.color || ""} ${(product.tags || []).toString()}`.toLowerCase().includes(query.trim().toLowerCase()) : searchMatches(product, query)));
  const colorOptions = [...new Set((homepageNewIn?scoped.map(product=>product.color):catalogue.facets.colors).map(colorFamily).filter(Boolean))].sort();
  const sizeOptions = [...new Set((homepageNewIn?scoped.flatMap(product=>product.sizes||[]):catalogue.facets.sizes))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const priceBounds = scoped.reduce((range, product) => ({ min: Math.min(range.min, Number(product.price || 0)), max: Math.max(range.max, Number(product.price || 0)) }), { min: Infinity, max: 0 });
  const visible = scoped.filter((product) => colorMatches(product, color) && (!size || (product.sizes || []).some((item) => String(item).toLowerCase() === size.toLowerCase())) && (!minPrice || sellingPrice(product) >= Number(minPrice)) && (!maxPrice || sellingPrice(product) <= Number(maxPrice)));
  const displayed = homepageNewIn ? selectNewInProducts(visible) : visible;
  const wibrawlWaiting = storefrontName === "Wibrawl" && !products.length && !query && (!activeCategory || activeCategory === "All") && !color && !size && !minPrice && !maxPrice;
  function resetFilters() { setColor(""); setSize(""); setMinPrice(""); setMaxPrice(""); }
  return <main className="page-main"><section className="catalog-section catalog-page"><div className="section-heading"><div><p className="eyebrow">{storefrontName} collection</p>{homepageNewIn ? <h2 className="page-title">{title}</h2> : <h1 className="page-title">{title}</h1>}</div><p className="result-count">{loading ? "Loading collection…" : error ? "Collection unavailable" : `${displayed.length} of ${homepageNewIn?displayed.length:productTotal} pieces`}</p></div>{!wibrawlWaiting && <><div className="filter-row">{categories.map((item) => <button key={item} className={(activeCategory || "All") === item ? "active" : ""} onClick={() => { resetFilters(); setActiveCategory(item); }}>{item}</button>)}</div><div className="catalog-filter-panel"><label>Sort<select aria-label="Sort" value={sort} onChange={event=>setSort(event.target.value)}><option value="featured">Featured</option><option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option></select></label><label>Colour<select aria-label="Colour" value={color} onChange={(event) => setColor(event.target.value)}><option value="">All colours</option>{colorOptions.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}</select></label><label>Size<select aria-label="Size" value={size} onChange={(event) => setSize(event.target.value)}><option value="">All sizes</option>{sizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label>Min price<input aria-label="Min price" type="number" min="0" placeholder={Number.isFinite(priceBounds.min) ? String(priceBounds.min) : "0"} value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></label><label>Max price<input aria-label="Max price" type="number" min="0" placeholder={priceBounds.max ? String(priceBounds.max) : "0"} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label><button type="button" className="secondary-action" onClick={resetFilters}>Reset</button></div></>}{error && <div className="inline-note catalog-error" role="alert">{error}{!homepageNewIn&&<button type="button" className="secondary-action" onClick={catalogue.retry}>Try again</button>}</div>}{storefrontName === "Wibrawl" && loading && !displayed.length && <div className="wibrawl-skeleton" role="status" aria-label="Loading tees">{Array.from({length:4},(_,index)=><div key={index} />)}</div>}<div className="product-grid">{displayed.map((product, index) => <ProductCard key={product.id || product.slug} product={product} onNavigate={onNavigate} wishlist={wishlist} toggleWishlist={toggleWishlist} onQuickView={onQuickView} eventLive={eventLive} index={index} headingLevel={homepageNewIn ? 3 : 2} aboveFold={!homepageNewIn && index < 2} />)}</div>{!loading && !error && !displayed.length && <div className="empty-state"><h2>{wibrawlWaiting ? "The next drop is warming up." : "No pieces match these filters"}</h2><p>{wibrawlWaiting ? "Your next favourite tee is on its way. Check back for the first drop." : "Try another size or colour, or widen your price range."}</p>{!wibrawlWaiting && <button type="button" className="secondary-action" onClick={resetFilters}>Clear filters</button>}</div>}{hasMoreProducts && onLoadMore && <div className="catalog-load-more"><span>Loaded {products.length} of {productTotal} pieces. Filters apply across the full catalogue.</span><button type="button" className="secondary-action" onClick={onLoadMore} disabled={loadingMoreProducts}>{loadingMoreProducts ? "Loading more pieces…" : "Load more pieces"}</button></div>}{!homepageNewIn&&<RecentlyViewed onNavigate={onNavigate}/>}</section></main>;
}
