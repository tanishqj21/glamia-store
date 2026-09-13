import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { apiFetch } from "./lib/api";
import { money, sellingPrice, availableQuantity, readStorage, writeStorage, readArray, productUrl, setSlugRegistry } from "./lib/commerce";
import { QuickView } from "./components/QuickView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Icon } from "./components/Icon";

const initialLoaderStartedAt = Date.now();
try { sessionStorage.setItem("glamia-splash", "1"); } catch { /* splash shows once per browsing session */ }

function dismissInitialLoader() {
  const loader = document.getElementById("initial-loader");
  if (!loader || loader.classList.contains("is-hidden")) return;
  loader.classList.add("is-hidden");
  window.setTimeout(() => loader.remove(), 550);
}

// Route-level chunks keep the public storefront light. Heavy account, checkout,
// support, policy, and admin code loads only when a visitor opens that route.
const AccountPage = lazy(() => import("./components/AccountPages").then((module) => ({ default: module.AccountPage })));
const ReactCheckoutPage = lazy(() => import("./components/CheckoutPage").then((module) => ({ default: module.CheckoutPage })));
const AdminWorkspace = lazy(() => import("./components/AdminWorkspace").then((module) => ({ default: module.AdminWorkspace })));
const CustomerSupportPage = lazy(() => import("./components/CustomerCare").then((module) => ({ default: module.CustomerSupportPage })));
const PoliciesPage = lazy(() => import("./components/PublicPages").then((module) => ({ default: module.PoliciesPage })));
const ContactPage = lazy(() => import("./components/PublicPages").then((module) => ({ default: module.ContactPage })));
const OrderTrackingPage = lazy(() => import("./components/OrderTrackingPage").then((module) => ({ default: module.OrderTrackingPage })));

const palettes = {
  forest: { label: "Evergreen", accent: "#b9d5c2", accentStrong: "#74ae8c" },
  terracotta: { label: "Terracotta", accent: "#f2b49b", accentStrong: "#d57958" },
  cobalt: { label: "Cobalt", accent: "#b9d5f1", accentStrong: "#70a7dc" },
  plum: { label: "Plum", accent: "#e0bddd", accentStrong: "#b978ad" },
  sand: { label: "Sand", accent: "#f3d2a2", accentStrong: "#d6a566" },
  graphite: { label: "Graphite", accent: "#d1d1d1", accentStrong: "#8f8f8f" },
};

const fallbackProducts = [
  { id: "fallback-shirt", name: "Ivory Linen Resort Shirt", category: "Men", brand: "North Loom", price: 1899, compare_at_price: 2799, rating: 4.6, stock: 38, color: "Ivory", sizes: ["S", "M", "L", "XL"], image_url: "https://images.unsplash.com/photo-1516826957135-700dedea698c?auto=format&fit=crop&w=900&q=82" },
  { id: "fallback-dress", name: "Midnight Satin Wrap Dress", category: "Women", brand: "Glamia", price: 4299, compare_at_price: 6999, rating: 4.9, stock: 22, color: "Midnight", sizes: ["XS", "S", "M", "L"], image_url: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=900&q=82" },
  { id: "fallback-blazer", name: "Sculpted Wool Blend Blazer", category: "Women", brand: "Atelier Loom", price: 5499, compare_at_price: 8299, rating: 4.8, stock: 16, color: "Charcoal", sizes: ["S", "M", "L"], image_url: "https://images.unsplash.com/photo-1548454782-15b189d129ab?auto=format&fit=crop&w=900&q=82" },
  { id: "fallback-loafers", name: "Tan Leather Penny Loafers", category: "Footwear", brand: "Cobbler & Co.", price: 2999, compare_at_price: 4499, rating: 4.5, stock: 11, color: "Tan", sizes: ["6", "7", "8", "9", "10"], image_url: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=82" },
];


const DEFAULT_META_DESCRIPTION = "Glamia — curated apparel and accessories for every wardrobe. Free and fast shipping across India, cash on delivery available.";

function setMetaDescription(text) { const meta = document.querySelector('meta[name="description"]'); if (meta) meta.setAttribute("content", String(text || "").slice(0, 300)); }

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

function productImages(product) {
  const images = Array.isArray(product?.images) ? product.images : [];
  return [...new Set([...(images.length ? images : []), productImage(product)].filter(Boolean))];
}

function colorFamily(value) {
  const color = String(value || "").toLowerCase();
  const families = [["green", /green|teal|mint|olive|sage|emerald/], ["blue", /blue|navy|cobalt|aqua|cyan/], ["red", /red|maroon|burgundy|crimson|coral/], ["pink", /pink|rose|fuchsia|magenta/], ["purple", /purple|plum|violet|lilac/], ["yellow", /yellow|mustard|gold/], ["orange", /orange|rust|terracotta/], ["brown", /brown|tan|camel|beige|khaki/], ["black", /black|charcoal|midnight/], ["white", /white|ivory|cream/], ["grey", /grey|gray|silver/]];
  return families.find(([, pattern]) => pattern.test(color))?.[0] || String(value || "Other").trim().toLowerCase() || "Other";
}

function colorMatches(product, family) {
  return !family || colorFamily(product.color) === family;
}

function slugify(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

function currentPath() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/react-preview" ? "/" : path;
}

function useRoute() {
  const [route, setRoute] = useState(() => currentPath());
  useEffect(() => {
    const onPopState = () => setRoute(currentPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return [route, (next) => { window.history.pushState({}, "", next); setRoute(currentPath()); window.scrollTo({ top: 0, behavior: "smooth" }); }];
}

function Link({ href, onNavigate, children, className = "", ...props }) {
  return <a {...props} className={className} href={href} onClick={(event) => { props.onClick?.(event); if (!event.defaultPrevented && !event.button && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !props.target && href.startsWith("/")) { event.preventDefault(); onNavigate(href); } }}>{children}</a>;
}

function productSubcategory(product) { return String(product?.subcategory || "").trim(); }
function productSubSubcategory(product) { return String(product?.sub_subcategory || product?.subsubcategory || product?.subSubcategory || "").trim(); }
function searchMatches(product, query) { const term = String(query || "").trim().toLowerCase(); return !term || `${product.name || ""} ${product.brand || ""} ${product.color || ""}`.toLowerCase().includes(term); }
function highlightMatch(text, query) {
  const value = String(text || ""); const term = String(query || "").trim();
  const index = term ? value.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (index < 0) return value;
  return <>{value.slice(0, index)}<mark>{value.slice(index, index + term.length)}</mark>{value.slice(index + term.length)}</>;
}

function buildCategoryTree(categories, categoryData, products) {
  const names = [...new Set([...categories, ...(categoryData?.categories || [])])].filter((category) => category && category !== "All");
  const tree = names.map((name) => ({ name, children: [] }));
  const byCategory = new Map(tree.map((node) => [String(node.name).toLowerCase(), node]));
  const byKey = new Map();
  function addSubcategory(categoryName, subcategoryName, subSubcategoryNames = []) {
    const parent = byCategory.get(String(categoryName || "").toLowerCase());
    const subName = String(subcategoryName || "").trim();
    if (!parent || !subName) return;
    const key = `${parent.name.toLowerCase()}::${subName.toLowerCase()}`;
    let node = byKey.get(key);
    if (!node) { node = { name: subName, children: [] }; parent.children.push(node); byKey.set(key, node); }
    for (const childName of subSubcategoryNames) {
      const clean = String(childName || "").trim();
      if (clean && !node.children.some((child) => child.name.toLowerCase() === clean.toLowerCase())) node.children.push({ name: clean, children: [] });
    }
  }
  for (const row of categoryData?.subcategories || []) {
    if (typeof row === "string") continue;
    const children = Array.isArray(row.sub_subcategories) ? row.sub_subcategories : Array.isArray(row.children) ? row.children : [];
    addSubcategory(row.category, row.name || row.subcategory, children.map((child) => typeof child === "string" ? child : child.name || child.label));
  }
  for (const product of products) {
    const sub = productSubcategory(product); const subSub = productSubSubcategory(product);
    if (sub) addSubcategory(product.category, sub, subSub ? [subSub] : []);
  }
  return tree;
}

function categoryHref(category, subcategory = "", subSubcategory = "") {
  const params = new URLSearchParams();
  if (subcategory) params.set("sub", subcategory);
  if (subSubcategory) params.set("subSub", subSubcategory);
  const queryString = params.toString();
  return `/category/${encodeURIComponent(category)}${queryString ? `?${queryString}` : ""}`;
}

function DrawerCategory({ node, category, onNavigate, closeMenu, depth = 0 }) {
  const hasChildren = depth === 0 || node.children?.length > 0;
  const href = depth === 0 ? categoryHref(category) : depth === 1 ? categoryHref(category, node.name) : categoryHref(category, node.parentSubcategory, node.name);
  if (!hasChildren) return <Link className={`drawer-leaf drawer-leaf-${depth}`} href={href} onNavigate={(nextHref) => { closeMenu(); onNavigate(nextHref); }}>{node.name}</Link>;
  return <details className={`drawer-category drawer-category-${depth}`}><summary><span>{node.name}</span><Icon name="chevronDown" size={16} /></summary><div className="drawer-category-children"><Link className="drawer-view-all" href={href} onNavigate={(nextHref) => { closeMenu(); onNavigate(nextHref); }}>View all {node.name}</Link>{node.children.map((child) => <DrawerCategory key={child.name} node={{ ...child, parentSubcategory: node.name }} category={category} onNavigate={onNavigate} closeMenu={closeMenu} depth={depth + 1} />)}</div></details>;
}

function Header({ onNavigate, query, setQuery, dark, setDark, palette, setPalette, menuOpen, setMenuOpen, categories, categoryData: providedCategoryData, products = [], wishlistCount, cartCount = 0, user, storefront, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [drawerCategoryData, setDrawerCategoryData] = useState(null);
  const searchRef = useRef(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [remoteSuggestions, setRemoteSuggestions] = useState(null);
  const searchSuggestions = useMemo(() => {
    if (remoteSuggestions) return remoteSuggestions.map(normalizeProduct);
    return products.filter((product) => searchMatches(product, query)).slice(0, 6);
  }, [remoteSuggestions, products, query]);
  const searchOpen = searchFocused && Boolean(query.trim());
  useEffect(() => {
    const term = query.trim();
    if (!term) { setRemoteSuggestions(null); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(term)}&limit=6`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setRemoteSuggestions(Array.isArray(data?.products) ? data.products : null))
        .catch(() => {});
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  useEffect(() => {
    if (!searchOpen) return;
    function onPointerDown(event) { if (!searchRef.current?.contains(event.target)) { setSearchFocused(false); setHighlightIndex(-1); } }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [searchOpen]);
  useEffect(() => { let active = true; apiFetch("/api/categories?cache=1").then((response) => response.ok ? response.json() : null).then((data) => active && setDrawerCategoryData(data)).catch(() => {}); return () => { active = false; }; }, []);
  const categoryTree = useMemo(() => buildCategoryTree(categories || [], providedCategoryData || drawerCategoryData, []), [categories, providedCategoryData, drawerCategoryData]);
  function closeSearch() { setSearchFocused(false); setHighlightIndex(-1); }
  function submitSearch(event) { event.preventDefault(); closeSearch(); onNavigate(`/search?query=${encodeURIComponent(query)}`); }
  function pickSuggestion(product) { closeSearch(); onNavigate(productUrl(product)); }
  function onSearchKeyDown(event) {
    const total = searchSuggestions.length + 1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!searchOpen) return;
      event.preventDefault();
      setHighlightIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + total) % total);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (searchOpen && highlightIndex >= 0 && highlightIndex < searchSuggestions.length) pickSuggestion(searchSuggestions[highlightIndex]);
      else submitSearch(event);
    } else if (event.key === "Escape" && searchOpen) {
      closeSearch();
    }
  }
  function navigateFromAccount(href) { document.querySelector(".account-menu")?.removeAttribute("open"); onNavigate(href); }
  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await apiFetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not log out. Please try again.");
      document.querySelector(".account-menu")?.removeAttribute("open");
      onLogout();
      onNavigate("/");
    } catch (error) {
      setLogoutError(error.message);
      setLoggingOut(false);
    }
  }
  const [menuTop, setMenuTop] = useState(0);
  function toggleMenu() {
    const header = document.querySelector(".site-header");
    setMenuTop(header ? Math.max(0, header.getBoundingClientRect().bottom) : 0);
    setMenuOpen((open) => !open);
  }
  return <>
    {storefront?.announcement?.visible !== false && <div className="announce">{storefront?.announcement?.text || "Complimentary shipping across India · Cash on Delivery available"}</div>}
    <header className="site-header">
      <button className="menu-button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="shop-menu" onClick={toggleMenu}><span /><span /><span /></button>
      <nav className="quick-links" aria-label="Collections"><Link href="/offers" onNavigate={onNavigate}>Offers</Link><Link href="/just-arrived" onNavigate={onNavigate}>Just arrived</Link><Link href="/best-sellers" onNavigate={onNavigate}>Best sellers</Link></nav>
      <Link className="wordmark" href="/" onNavigate={onNavigate}>GLAMIA</Link>
      <div className="header-tools">
        <div className="search-suggest" ref={searchRef}>
          <form className="search-box" role="search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="reactSearch">Search products</label>
            <input id="reactSearch" value={query} onChange={(event) => { setQuery(event.target.value); setHighlightIndex(-1); setSearchFocused(true); }} onFocus={() => setSearchFocused(true)} onMouseDown={() => setSearchFocused(true)} onKeyDown={onSearchKeyDown} placeholder="What are you looking for?" type="search" autoComplete="off" role="combobox" aria-expanded={searchOpen} aria-controls="search-suggest-list" aria-activedescendant={searchOpen && highlightIndex >= 0 ? `search-suggest-option-${highlightIndex}` : undefined} />
            <Icon name="search" size={18} />
          </form>
          {searchOpen && <div className="search-suggest-panel" id="search-suggest-list" role="listbox" aria-label="Search suggestions">
            {searchSuggestions.map((product, index) => <button key={product.id || product.slug} type="button" role="option" id={`search-suggest-option-${index}`} aria-selected={highlightIndex === index} className={`search-suggest-option ${highlightIndex === index ? "active" : ""}`} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlightIndex(index)} onClick={() => pickSuggestion(product)}>
              <span className="search-suggest-thumb">{product.image_url ? <img src={product.image_url} alt="" loading="lazy" decoding="async" width="88" height="110" /> : <Icon name="search" size={16} />}</span>
              <span className="search-suggest-copy"><strong>{highlightMatch(product.name, query)}</strong><small>{product.brand || product.category || "Glamia"}{product.color ? ` · ${product.color}` : ""}</small></span>
              <span className="search-suggest-price">{money(sellingPrice(product))}</span>
            </button>)}
            <button type="button" role="option" id={`search-suggest-option-${searchSuggestions.length}`} aria-selected={highlightIndex === searchSuggestions.length} className={`search-suggest-all ${highlightIndex === searchSuggestions.length ? "active" : ""}`} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlightIndex(searchSuggestions.length)} onClick={submitSearch}>Search for “{query.trim()}”</button>
          </div>}
        </div>
        {user ? <details className="account-menu"><summary aria-label="Open account menu"><span className="account-avatar">{String(user.name || user.email || "A").trim().charAt(0).toUpperCase()}</span><span className="account-menu-name">{String(user.name || "Account").split(" ")[0]}</span><span className="account-chevron"><Icon name="chevronDown" size={14} /></span></summary><div className="account-menu-panel" role="menu">{user.role === "admin" && <Link role="menuitem" className="account-menu-link" href="/admin" onNavigate={navigateFromAccount}>Admin console</Link>}<Link role="menuitem" className="account-menu-link" href="/profile" onNavigate={navigateFromAccount}>Profile</Link><Link role="menuitem" className="account-menu-link" href="/wishlist" onNavigate={navigateFromAccount}>Wishlist <span className="account-menu-count">{wishlistCount || 0}</span></Link><Link role="menuitem" className="account-menu-link" href="/orders" onNavigate={navigateFromAccount}>Your orders</Link><div role="group" aria-label="Colour palette" className="account-menu-palettes"><span className="account-menu-palettes-title">Colour palette</span><div className="account-menu-palette-list">{Object.entries(palettes).map(([key, value]) => <button key={key} type="button" className={`account-menu-palette ${palette === key ? "active" : ""}`} aria-pressed={palette === key} onClick={() => setPalette(key)}><span className={`swatch swatch-${key}`} />{value.label}</button>)}</div></div><button role="menuitem" className="account-menu-link account-menu-logout" type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? "Logging out…" : "Log out"}</button>{logoutError && <p className="account-menu-error" role="alert">{logoutError}</p>}</div></details> : <Link className="login-link" href="/login" onNavigate={onNavigate}>Log in</Link>}
        <button className="tool-button theme-toggle" onClick={() => setDark((value) => !value)} aria-label="Toggle dark mode" title="Toggle dark mode"><Icon name={dark ? "sun" : "moon"} size={18} /></button>
        <Link className="tool-button cart-link" href="/cart" onNavigate={onNavigate} aria-label={`Open cart, ${cartCount || 0} item${cartCount === 1 ? "" : "s"}`}><Icon name="bag" size={19} />{cartCount > 0 && <span className="cart-count">{cartCount}</span>}</Link>
      </div>
    </header>
    {menuOpen && <div className="menu-layer" style={{ "--menu-top": `${menuTop}px` }}><button className="menu-backdrop" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} /><aside id="shop-menu" className="menu-drawer" aria-label="Shop menu"><button className="drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close shop menu"><Icon name="close" size={20} /></button><p className="eyebrow">Shop Glamia</p><h2>Find your next edit.</h2><div className="drawer-categories">{categoryTree.map((node) => <DrawerCategory key={node.name} node={node} category={node.name} onNavigate={onNavigate} closeMenu={() => setMenuOpen(false)} />)}</div><Link className="drawer-account-link" href="/profile" onNavigate={(href) => { setMenuOpen(false); onNavigate(href); }}>Your account</Link></aside></div>}
  </>;
}

function ProductCard({ product, onNavigate, wishlist, toggleWishlist, onQuickView, index = 0 }) {
  const id = product.id || product.slug;
  return <article className="product-card" style={{ "--delay": `${index * 70}ms` }}><button className={`wishlist-button ${wishlist.has(id) ? "is-saved" : ""}`} onClick={() => toggleWishlist(id)} aria-label={`${wishlist.has(id) ? "Remove" : "Add"} ${product.name} ${wishlist.has(id) ? "from" : "to"} wishlist`}><Icon name="heart" size={20} /></button><button className="product-image" onClick={() => onQuickView(product)} aria-label={`View ${product.name}`}>{product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" decoding="async" width="480" height="600" sizes="(max-width: 700px) 46vw, (max-width: 1100px) 30vw, 22vw" /> : <span>No image</span>}<span className="quick-view">Quick view</span></button><div className="product-info"><p>{product.brand || product.category || "Glamia"}</p><h3><Link href={productUrl(product)} onNavigate={onNavigate}>{product.name}</Link></h3><span>{money(sellingPrice(product))} {product.mrp && <del>{money(product.mrp)}</del>}</span></div></article>;
}

function DeliveryEstimate() {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  async function check(event) {
    event.preventDefault();
    setBusy(true); setResult("");
    try {
      const response = await apiFetch(`/api/postal-lookup?pin=${encodeURIComponent(pin)}`, { cacheTtl: 300000 });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Enter a valid Indian PIN code");
      setResult(`Estimated delivery to ${data.city || data.district || "your area"}: 3–7 business days.`);
    } catch (error) { setResult(error.message); } finally { setBusy(false); }
  }
  return <section className="product-care-card"><div><p className="eyebrow">Delivery estimate</p><strong>Check your PIN code</strong></div><form className="delivery-check" onSubmit={check}><input inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} placeholder="6-digit Indian PIN" aria-label="Indian PIN code" required /><button type="submit" className="secondary-action" disabled={busy}>{busy ? "Checking…" : "Check"}</button></form>{result && <p className="form-hint" role="status">{result}</p>}</section>;
}

function ProductQuestions({ productId, user, onNavigate }) {
  const [questions, setQuestions] = useState([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; apiFetch(`/api/products/${encodeURIComponent(productId)}/questions`, { cacheTtl: 30000 }).then((response) => response.ok ? response.json() : {}).then((data) => active && setQuestions(data.questions || [])).catch(() => {}); return () => { active = false; }; }, [productId]);
  async function ask(event) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const response = await apiFetch(`/api/products/${encodeURIComponent(productId)}/questions`, { method: "POST", body: JSON.stringify({ question }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Question could not be sent");
      setQuestion(""); setStatus("Question sent for review. We’ll publish the answer once it is ready.");
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  return <section className="product-questions"><div className="product-care-heading"><div><p className="eyebrow">Product care</p><h2>Questions & answers</h2></div><span>{questions.length} answered</span></div>{questions.length ? <div className="question-list">{questions.map((item) => <article key={item.id}><strong>Q: {item.question}</strong><p>A: {item.answer}</p></article>)}</div> : <p className="muted">Ask about fit, fabric, or care and our team will help.</p>}{user ? <form className="question-form" onSubmit={ask}><label className="sr-only" htmlFor="productQuestion">Ask a question</label><textarea id="productQuestion" rows="3" maxLength="600" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this piece…" required /><button className="secondary-action" disabled={busy}>{busy ? "Sending…" : "Ask a question"}</button></form> : <button type="button" className="text-link" onClick={() => onNavigate("/login")}>Sign in to ask a question</button>}{status && <p className="form-hint" role="status">{status}</p>}</section>;
}

function CatalogPage({ title, products, loading, error, categories, activeCategory, activeSubcategory = "", activeSubSubcategory = "", setActiveCategory, query, onNavigate, wishlist, toggleWishlist, onQuickView }) {
  const [color, setColor] = useState(""); const [size, setSize] = useState(""); const [minPrice, setMinPrice] = useState(""); const [maxPrice, setMaxPrice] = useState("");
  const scoped = products.filter((product) => (!activeCategory || activeCategory === "All" || product.category === activeCategory) && (!activeSubcategory || product.subcategory === activeSubcategory) && (!activeSubSubcategory || productSubSubcategory(product) === activeSubSubcategory) && searchMatches(product, query));
  const colorOptions = [...new Set(scoped.map((product) => colorFamily(product.color)).filter(Boolean))].sort();
  const sizeOptions = [...new Set(scoped.flatMap((product) => product.sizes || []))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const priceBounds = scoped.reduce((range, product) => ({ min: Math.min(range.min, Number(product.price || 0)), max: Math.max(range.max, Number(product.price || 0)) }), { min: Infinity, max: 0 });
  const visible = scoped.filter((product) => colorMatches(product, color) && (!size || (product.sizes || []).some((item) => String(item).toLowerCase() === size.toLowerCase())) && (!minPrice || Number(product.price) >= Number(minPrice)) && (!maxPrice || Number(product.price) <= Number(maxPrice)));
  function resetFilters() { setColor(""); setSize(""); setMinPrice(""); setMaxPrice(""); }
  return <main className="page-main"><section className="catalog-section catalog-page"><div className="section-heading"><div><p className="eyebrow">Glamia collection</p><h1 className="page-title">{title}</h1></div><p className="result-count">{loading ? "Loading collection…" : `${visible.length} pieces`}</p></div><div className="filter-row">{categories.map((item) => <button key={item} className={(activeCategory || "All") === item ? "active" : ""} onClick={() => { resetFilters(); setActiveCategory(item); }}>{item}</button>)}</div><div className="catalog-filter-panel"><label>Colour<select value={color} onChange={(event) => setColor(event.target.value)}><option value="">All colours</option>{colorOptions.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}</select></label><label>Size<select value={size} onChange={(event) => setSize(event.target.value)}><option value="">All sizes</option>{sizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label>Min price<input type="number" min="0" placeholder={Number.isFinite(priceBounds.min) ? String(priceBounds.min) : "0"} value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></label><label>Max price<input type="number" min="0" placeholder={priceBounds.max ? String(priceBounds.max) : "0"} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label><button type="button" className="secondary-action" onClick={resetFilters}>Reset</button></div>{error && <p className="inline-note" role="status">{error}</p>}<div className="product-grid">{visible.map((product, index) => <ProductCard key={product.id || product.slug} product={product} onNavigate={onNavigate} wishlist={wishlist} toggleWishlist={toggleWishlist} onQuickView={onQuickView} index={index} />)}</div>{!loading && !visible.length && <div className="empty-state">No pieces match this edit yet.</div>}</section></main>;
}

function ProductDetailPage({ productRef, products = [], onNavigate, addToCart, wishlist, toggleWishlist, user }) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState("");
  const [message, setMessage] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [colourways, setColourways] = useState([]);
  useEffect(() => { let active = true; setLoading(true); setProduct(null); setColourways([]); setImageIndex(0); setSize(""); setMessage(""); apiFetch(`/api/products/${encodeURIComponent(productRef)}`, { cacheTtl: 30000 }).then(async (productResponse) => { if (!productResponse.ok) throw new Error("Product unavailable"); const data = await productResponse.json(); const resolved = data.product || data; const reviewResponse = await apiFetch(`/api/products/${encodeURIComponent(resolved.id)}/reviews`, { cacheTtl: 15000 }); const reviews = reviewResponse.ok ? await reviewResponse.json() : {}; if (active) { setProduct(normalizeProduct({ ...resolved, reviews: reviews.reviews || [] })); setColourways((data.colourways || []).map(normalizeProduct)); document.title = `${resolved.name || "Product"} | Glamia`; setMetaDescription(String(resolved.description || `${resolved.name} — ${resolved.brand || "Glamia"} curated piece in ${resolved.color || "a timeless finish"}.`).slice(0, 300));
const inStock = (resolved.sizes || []).length ? Object.values(resolved.size_stock || {}).some((quantity) => Number(quantity) > 0) : Number(resolved.stock || 0) > 0;
const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: resolved.name, description: resolved.description || undefined, image: productImages(resolved).slice(0, 4), sku: resolved.id, color: resolved.color || undefined, brand: { "@type": "Brand", name: resolved.brand || "Glamia" }, offers: { "@type": "Offer", url: `${window.location.origin}${productUrl(resolved)}`, priceCurrency: "INR", price: Number(sellingPrice(resolved)) || Number(resolved.price) || 0, availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", itemCondition: "https://schema.org/NewCondition" }, ...(Number(resolved.rating) > 0 && Number(resolved.review_count) > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(resolved.rating), reviewCount: Number(resolved.review_count) } } : {}) };
let jsonLdScript = document.getElementById("product-jsonld");
if (!jsonLdScript) { jsonLdScript = document.createElement("script"); jsonLdScript.type = "application/ld+json"; jsonLdScript.id = "product-jsonld"; document.head.appendChild(jsonLdScript); }
jsonLdScript.textContent = JSON.stringify(jsonLd); } }).catch(() => active && setMessage("This product is no longer available.")).finally(() => active && setLoading(false)); return () => { active = false; document.getElementById("product-jsonld")?.remove(); }; }, [productRef]);
  useEffect(() => {
    if (!product) return;
    const canonical = productUrl(product);
    if (window.location.pathname !== canonical) window.history.replaceState(window.history.state, "", canonical);
  }, [product, products]);
  if (loading) return <main className="page-main"><div className="loading-card">Loading product details…</div></main>;
  if (!product) return <main className="page-main"><div className="empty-state">{message || "Product not found."}<br /><button className="primary-action" onClick={() => onNavigate("/best-sellers")}>Browse best sellers</button></div></main>;
  const sizes = product.sizes || []; const images = productImages(product); const currentImage = images[imageIndex] || product.image_url; const previousImage = () => setImageIndex((current) => (current - 1 + images.length) % images.length); const nextImage = () => setImageIndex((current) => (current + 1) % images.length);
  return <main className="page-main"><section className="detail-page"><div className="detail-gallery" onTouchStart={(event) => setTouchStart(event.changedTouches[0].clientX)} onTouchEnd={(event) => { if (touchStart === null) return; const distance = event.changedTouches[0].clientX - touchStart; if (Math.abs(distance) > 40) distance < 0 ? nextImage() : previousImage(); setTouchStart(null); }}><img src={currentImage} alt={product.name} loading="eager" decoding="async" fetchPriority="high" /><span className="detail-label">{product.category || "Glamia edit"}</span>{images.length > 1 && <><button type="button" className="gallery-control gallery-prev" onClick={previousImage} aria-label="Previous product image"><Icon name="chevronLeft" /></button><button type="button" className="gallery-control gallery-next" onClick={nextImage} aria-label="Next product image"><Icon name="chevronRight" /></button><div className="gallery-dots" aria-label={`Image ${imageIndex + 1} of ${images.length}`}>{images.map((image, index) => <button type="button" key={image} className={index === imageIndex ? "active" : ""} onClick={() => setImageIndex(index)} aria-label={`Show image ${index + 1}`} />)}</div></>}</div><div className="detail-copy"><button type="button" className={`detail-wishlist ${wishlist.has(product.id) ? "is-saved" : ""}`} onClick={() => toggleWishlist(product.id)}><Icon name="heart" size={18} />{wishlist.has(product.id) ? "Saved to wishlist" : "Save to wishlist"}</button><p className="eyebrow">{product.brand || "Glamia"}</p><h1>{product.name}</h1><p className="detail-price">{money(sellingPrice(product))} {product.mrp && <del>{money(product.mrp)}</del>}</p><p className="muted">{product.color || "Curated colour"} · {product.rating ? `${product.rating} / 5 rating` : "New arrival"}</p>{colourways.length > 1 && <div className="colourway-picker"><strong>Colour</strong><div>{colourways.map((colourway) => <button type="button" className={colourway.id === product.id ? "selected" : ""} key={colourway.id} onClick={() => onNavigate(productUrl(colourway))}><span className="colourway-swatch" style={{ background: colourway.color || "var(--accent)" }} />{colourway.color || "Colourway"}</button>)}</div></div>}<p className="detail-description">{product.description || "A considered piece made for everyday wear, with a finish that lasts beyond the season."}</p>{sizes.length > 0 && <div className="size-list"><strong>Select size</strong><div>{sizes.map((item) => <button key={item} aria-pressed={size === item} disabled={!availableQuantity(product, item)} className={size === item ? "selected" : ""} onClick={() => setSize(item)}>{item}</button>)}</div></div>}{product.size_chart_url && <a className="text-link size-chart-link" href={product.size_chart_url} target="_blank" rel="noreferrer">View size chart</a>}<button className="primary-action" onClick={() => { if (sizes.length && !size) return setMessage("Choose a size first."); if (!availableQuantity(product, size)) return setMessage("This selection is out of stock."); addToCart(product, size); setMessage("Added to your cart."); }}><span>Add to bag</span><Icon name="bag" size={18} /></button>{message && <p className="inline-note" role="status">{message}</p>}<button className="text-link" onClick={() => onNavigate("/support")}>Need help with this piece?</button><DeliveryEstimate /></div></section><ProductQuestions productId={product.id} user={user} onNavigate={onNavigate} /></main>;
}

function CartPage({ cart, products, setCart, onNavigate }) {
  const lines = cart.map((item) => ({ ...item, product: products.find((product) => product.id === item.id) }));
  const total = lines.reduce((sum, item) => sum + sellingPrice(item.product) * item.quantity, 0);
  const matches = (a, b) => a.id === b.id && a.size === b.size;
  function quantity(item, delta) { setCart((current) => current.map((line) => matches(line, item) ? { ...line, quantity: Math.max(1, line.quantity + delta) } : line)); }
  return <main className="page-main"><section className="account-page"><p className="eyebrow">Your edit</p><h1 className="page-title">Shopping bag</h1>{lines.length ? <><div className="cart-list">{lines.map((item) => <article className="cart-line" key={`${item.id}-${item.size}`}>{item.product?.image_url ? <img src={item.product.image_url} alt="" /> : <span aria-hidden="true">—</span>}<div><h2>{item.product?.name || "Unavailable item"}</h2><p className="muted">{item.size && `Size ${item.size}`}</p><p>{item.product ? money(sellingPrice(item.product)) : "Remove this item to continue"} · Quantity {item.quantity}</p></div><div className="cart-actions"><button aria-label={`Increase quantity of ${item.product?.name || "item"}`} disabled={item.quantity >= availableQuantity(item.product, item.size)} onClick={() => quantity(item, 1)}>+</button><button aria-label={`Decrease quantity of ${item.product?.name || "item"}`} disabled={item.quantity <= 1} onClick={() => quantity(item, -1)}>−</button><button onClick={() => setCart((current) => current.filter((line) => !matches(line, item)))}>Remove</button></div></article>)}</div><div className="cart-total" role="status"><span>Total</span><strong>{money(total)}</strong></div><button className="primary-action" onClick={() => onNavigate("/checkout")}>Continue to checkout ↗</button></> : <div className="empty-state">Your bag is ready for something excellent.<br /><button className="primary-action" onClick={() => onNavigate("/best-sellers")}>Browse best sellers ↗</button></div>}</section></main>;
}

function LoginPage({ onNavigate, onSignedIn }) {
  const [mode, setMode] = useState("login");
  const [signupEnabled, setSignupEnabled] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", gender: "", dob: "" });
  useEffect(() => {
    let attempts = 0; let cancelled = false;
    async function init() {
      const config = await apiFetch("/api/config").then((response) => response.json()).catch(() => ({}));
      if (cancelled) return;
      setSignupEnabled(config.passwordSignupEnabled === true);
      if (!config.googleClientId || config.googleClientId.includes("REPLACE_WITH")) return;
      if (!window.google?.accounts?.id) { if (attempts++ < 20) return setTimeout(init, 250); return setStatus("Google sign-in is unavailable right now."); }
      window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: async (response) => { try { const result = await apiFetch("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: response.credential }) }); const data = await result.json(); if (!result.ok) throw new Error(data.error || "Sign-in failed"); onSignedIn(data.user); onNavigate("/"); } catch (error) { setStatus(error.message); } } });
      const container = document.getElementById("reactGoogleButton"); if (container) { container.innerHTML = ""; window.google.accounts.id.renderButton(container, { theme: "outline", size: "large", shape: "pill", text: "signin_with" }); }
    }
    init(); return () => { cancelled = true; };
  }, [onNavigate, onSignedIn]);
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setStatus("");
    try {
      const response = await apiFetch(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(mode === "signup" ? form : { email: form.email, password: form.password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Authentication failed");
      onSignedIn(data.user); onNavigate("/");
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  return <main className="page-main"><section className="login-page"><p className="eyebrow">Welcome to Glamia</p><h1 className="page-title">Your wardrobe,<br /><em>your edit.</em></h1><p className="muted">{mode === "signup" ? "Create an account to save your details, orders, and wishlist." : "Sign in to view saved addresses, orders, wishlist items, and member checkout options."}</p><form className="login-form" onSubmit={submit}><label>Email<input type="email" name="email" autoComplete="email" value={form.email} onChange={change} required /></label>{mode === "signup" && <label>Full name<input name="name" autoComplete="name" value={form.name} onChange={change} required /></label>}<label>Password<input type="password" name="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength="8" value={form.password} onChange={change} required /></label>{mode === "signup" && <div className="form-row"><label>Gender / sex<select name="gender" value={form.gender} onChange={change}><option value="">Prefer not to specify</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><label>Date of birth<input type="date" name="dob" autoComplete="bday" value={form.dob} onChange={change} required /></label></div>}<button className="primary-action" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"} <span aria-hidden="true">↗</span></button></form><div id="reactGoogleButton" className="google-button" /><p className="inline-note" role="status">{status}</p>{signupEnabled && <button type="button" className="text-link" onClick={() => { setMode((current) => current === "login" ? "signup" : "login"); setStatus(""); }}>{mode === "signup" ? "Already have an account? Sign in" : "New to Glamia? Create an account"}</button>}<button type="button" className="text-link" onClick={() => onNavigate("/")}>Continue browsing as a guest ↗</button></section></main>;
}

function CinematicHero({ slides = [], onNavigate }) {
  const availableSlides = slides.length ? slides : [{ eyebrow: "The Glamia Edit", title: "Everyday pieces, beautifully composed.", tagline: "Curated apparel and accessories for every wardrobe, sourced from independent ateliers.", cta_label: "Explore the collection", cta_category: "", frames: [] }];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (index >= availableSlides.length) setIndex(0); }, [availableSlides.length, index]);
  useEffect(() => { if (paused || availableSlides.length < 2) return undefined; const timer = window.setInterval(() => setIndex((current) => (current + 1) % availableSlides.length), 6000); return () => window.clearInterval(timer); }, [availableSlides.length, paused]);
  const slide = availableSlides[index] || availableSlides[0];
  const frame = slide?.frames?.[0];
  function changeSlide(direction) { setPaused(true); setIndex((current) => (current + direction + availableSlides.length) % availableSlides.length); }
  return <section className="cinematic-home" aria-label="Featured collection"><div className="cinematic-copy"><p className="eyebrow">{slide?.eyebrow || "The Glamia Edit"}</p><h1>{slide?.title || "Everyday pieces, beautifully composed."}</h1><p>{slide?.tagline || "Curated apparel and accessories for every wardrobe, sourced from independent ateliers."}</p>{(slide?.words || []).length > 0 && <div className="cinematic-words">{slide.words.map((word) => <span key={word}>{word}</span>)}</div>}<button className="primary-action" onClick={() => onNavigate(slide?.cta_category ? `/category/${encodeURIComponent(slide.cta_category)}` : "/best-sellers")}>{slide?.cta_label || "Explore the collection"}</button></div><div className="cinematic-stage">{frame?.image ? <button type="button" className="cinematic-frame" key={frame.id || frame.image} onClick={() => onNavigate(productUrl(frame))} aria-label={`View ${frame.name || slide?.title || "featured product"}`}><img src={frame.image} alt={frame.name || slide?.title || "Featured collection"} fetchPriority="high" /></button> : <div className="hero-gradient" />}</div><button type="button" className="cinematic-arrow cinematic-prev" onClick={() => changeSlide(-1)} aria-label="Previous featured edit"><Icon name="chevronLeft" /></button><button type="button" className="cinematic-arrow cinematic-next" onClick={() => changeSlide(1)} aria-label="Next featured edit"><Icon name="chevronRight" /></button><div className="cinematic-progress" role="group" aria-label={`Featured edit ${index + 1} of ${availableSlides.length}`}>{availableSlides.map((item, itemIndex) => <span key={item.id || itemIndex} className={itemIndex === index ? "active" : ""} />)}</div></section>;
}

function NotFoundPage({ onNavigate }) {
  return <main className="page-main"><section className="empty-state error-page" aria-labelledby="not-found-title"><div><p className="eyebrow">Glamia</p><h1 id="not-found-title">This page has moved.</h1><p>Choose a destination from the React storefront.</p><button className="primary-action" type="button" onClick={() => onNavigate("/best-sellers")}>Browse best sellers ↗</button></div></section></main>;
}

function App() {
  const [route, onNavigate] = useRoute();
  const [products, setProducts] = useState([]); const [heroSlides, setHeroSlides] = useState([]); const [hero, setHero] = useState(null); const [categoryData, setCategoryData] = useState(null); const [storefront, setStorefront] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("query") || ""); const [category, setCategory] = useState("All"); const [palette, setPalette] = useState(() => readStorage("glamia-palette") || "forest"); const [dark, setDark] = useState(() => readStorage("glamia-theme") === "dark"); const [menuOpen, setMenuOpen] = useState(false); const [selected, setSelected] = useState(null); const [wishlist, setWishlist] = useState(() => new Set(readArray("glamia-react-wishlist"))); const [cart, setCart] = useState(() => readArray("glamia-react-cart").filter((item) => item && typeof item.id === "string" && Number.isSafeInteger(item.quantity) && item.quantity > 0)); const [user, setUser] = useState(null); const [addresses, setAddresses] = useState([]); const [orders, setOrders] = useState([]); const [vectorSearch, setVectorSearch] = useState(null);
  useEffect(() => {
    const fallback = window.setTimeout(dismissInitialLoader, 5000);
    return () => window.clearTimeout(fallback);
  }, []);
  useEffect(() => {
    if (loading) return undefined;
    const remaining = Math.max(0, 850 - (Date.now() - initialLoaderStartedAt));
    const timer = window.setTimeout(dismissInitialLoader, remaining);
    return () => window.clearTimeout(timer);
  }, [loading]);
  useEffect(() => { document.documentElement.dataset.palette = palettes[palette] ? palette : "forest"; document.documentElement.dataset.theme = dark ? "dark" : "light"; writeStorage("glamia-palette", palette); writeStorage("glamia-theme", dark ? "dark" : "light"); }, [palette, dark]);
  useEffect(() => { writeStorage("glamia-react-cart", JSON.stringify(cart)); }, [cart]); useEffect(() => { writeStorage("glamia-react-wishlist", JSON.stringify([...wishlist])); }, [wishlist]);
  async function reloadAccount() { const session = await apiFetch("/api/session").then((response) => response.json()).catch(() => ({})); setUser(session.user || null); if (session.user) { const [addressResponse, orderResponse] = await Promise.all([apiFetch("/api/addresses").catch(() => null), apiFetch("/api/orders").catch(() => null)]); setAddresses(addressResponse?.ok ? ((await addressResponse.json()).addresses || []) : []); setOrders(orderResponse?.ok ? ((await orderResponse.json()).orders || []) : []); } }
  useEffect(() => { let cancelled = false; Promise.all([apiFetch("/api/products?view=cards", { cacheTtl: 30000 }), apiFetch("/api/hero?cache=1", { cacheTtl: 30000 }), apiFetch("/api/storefront-settings?cache=1", { cacheTtl: 30000 }), apiFetch("/api/categories?cache=1", { cacheTtl: 30000 }), reloadAccount()]).then(async ([productResponse, heroResponse, storefrontResponse, categoryResponse]) => { if (!productResponse.ok) throw new Error("Products could not be loaded"); const productData = await productResponse.json(); const heroData = heroResponse.ok ? await heroResponse.json() : null; const storefrontData = storefrontResponse.ok ? await storefrontResponse.json() : null; const categoryDataResponse = categoryResponse.ok ? await categoryResponse.json() : null; if (!cancelled) { setProducts((productData.products || []).map(normalizeProduct)); setHeroSlides(heroData?.slides || []); setHero(heroData?.slides?.[0] || null); setStorefront(storefrontData); setCategoryData(categoryDataResponse); } }).catch(() => { if (!cancelled) { setError("The collection could not be loaded. Please refresh to try again."); setProducts([]); } }).finally(() => !cancelled && setLoading(false)); return () => { cancelled = true; }; }, []);
  useEffect(() => {
    const term = route === "/search" ? query.trim() : "";
    setVectorSearch(null);
    if (!term) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    apiFetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled) setVectorSearch(data?.engine === "vector" ? { products: (data.products || []).map(normalizeProduct) } : null); })
      .catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, [route, query]);
  const categories = useMemo(() => ["All", ...new Set(products.map((product) => product.category).filter(Boolean))], [products]);
  useEffect(() => { setSlugRegistry(products); }, [products]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetch("/api/analytics/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: window.location.pathname + window.location.search, referrer: document.referrer }), keepalive: true }).catch(() => {});
    }, 600);
    return () => window.clearTimeout(timer);
  }, [route]);
  const categoryTree = useMemo(() => buildCategoryTree(categories, categoryData, products), [categories, categoryData, products]);
  function toggleWishlist(id) { setWishlist((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function clearAccount() { setUser(null); setAddresses([]); setOrders([]); }
  function addToCart(product, size = "") { const id = product.id || product.slug; setCart((current) => { const existing = current.find((item) => item.id === id && item.size === size); return existing ? current.map((item) => item === existing ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { id, size, quantity: 1 }]; }); }
  const routeMatch = route.match(/^\/product\/([^/]+)$/);
  const categoryPathMatch = route.match(/^\/([^/]+)$/);
  const categoryRoute = categoryPathMatch ? categories.find((item) => item !== "All" && slugify(item) === categoryPathMatch[1]) : null;
  const routeSubcategory = categoryRoute || route.startsWith("/category/") ? new URLSearchParams(window.location.search).get("sub") || "" : "";
  const routeSubSubcategory = categoryRoute || route.startsWith("/category/") ? new URLSearchParams(window.location.search).get("subSub") || "" : "";
  const catalogTitle = route === "/offers" ? "Offers" : route === "/just-arrived" ? "Just arrived" : route === "/best-sellers" ? "Best sellers" : route.startsWith("/category/") ? decodeURIComponent(route.split("/").pop()) : categoryRoute || (route === "/search" ? `Search results for “${query}”` : "The collection");
  const reactRoutes = new Set(["/", "/login", "/offers", "/just-arrived", "/best-sellers", "/search", "/cart", "/checkout", "/profile", "/address", "/orders", "/wishlist", "/support", "/contact", "/policies", "/track-order", "/admin", "/admin/storefront", "/admin/labels", "/admin/hero", "/admin/add-product", "/admin/bulk-listing", "/admin/orders", "/admin/products", "/admin/inventory", "/admin/notifications", "/admin/customers", "/admin/reviews", "/admin/questions", "/admin/coupons", "/admin/deals", "/admin/categories", "/admin/returns", "/admin/support", "/admin/system", "/admin/manage-store"]);
  const usesReactRoute = reactRoutes.has(route) || routeMatch || route.startsWith("/category/") || Boolean(categoryRoute);
  const collectionProducts = route === "/offers" ? products.filter((p) => sellingPrice(p) < Number(p.mrp || p.price)) : route === "/just-arrived" ? [...products].sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at)) : route === "/best-sellers" ? [...products].sort((a,b) => Number(b.sold_total || 0) - Number(a.sold_total || 0)) : products;
  useEffect(() => {
    document.title = `${route === "/" ? "Everyday style" : route.split("/").filter(Boolean).join(" · ").replaceAll("-", " ")} | Glamia`;
    setMetaDescription(route === "/" ? "Shop curated apparel and accessories from independent ateliers — free and fast shipping across India, cash on delivery available." : DEFAULT_META_DESCRIPTION);
  }, [route]);
  let content = route === "/" ? <div><CinematicHero slides={heroSlides} onNavigate={onNavigate} />{storefront?.trust_strip?.visible !== false && <section className="trust-strip" aria-label="Store promises">{(storefront?.trust_strip?.items || [{ title: "Free & fast shipping" }, { title: "7-day easy returns" }, { title: "Secure checkout" }]).filter((item) => item.visible !== false).map((item) => <span key={item.id || item.title}>{item.title}</span>)}</section>}<CatalogPage title="New in" products={products} loading={loading} error={error} categories={categories} activeCategory={category} activeSubcategory="" setActiveCategory={setCategory} query={query} onNavigate={onNavigate} wishlist={wishlist} toggleWishlist={toggleWishlist} onQuickView={setSelected} /></div> : route === "/login" ? <LoginPage onNavigate={onNavigate} onSignedIn={(nextUser) => { setUser(nextUser); reloadAccount(); }} /> : route === "/contact" ? <ContactPage storefront={storefront} onNavigate={onNavigate} /> : route === "/policies" ? <PoliciesPage /> : route === "/track-order" ? <OrderTrackingPage /> : routeMatch ? <ProductDetailPage productRef={decodeURIComponent(routeMatch[1])} products={products} onNavigate={onNavigate} addToCart={addToCart} wishlist={wishlist} toggleWishlist={toggleWishlist} user={user} /> : ["/offers", "/just-arrived", "/best-sellers", "/search"].includes(route) || route.startsWith("/category/") ? <CatalogPage key={route} title={catalogTitle} products={route === "/search" && vectorSearch ? vectorSearch.products : collectionProducts} loading={loading} error={error} categories={categories} activeCategory={categoryRoute || (route.startsWith("/category/") ? catalogTitle : category)} activeSubcategory={routeSubcategory} setActiveCategory={setCategory} query={route === "/search" && vectorSearch ? "" : query} onNavigate={onNavigate} wishlist={wishlist} toggleWishlist={toggleWishlist} onQuickView={setSelected} /> : route === "/support" ? <CustomerSupportPage user={user} onNavigate={onNavigate} /> : ["/profile", "/address", "/orders", "/wishlist"].includes(route) ? <AccountPage route={route} user={user} addresses={addresses} orders={orders} products={products} wishlist={wishlist} toggleWishlist={toggleWishlist} onNavigate={onNavigate} /> : ["/admin", "/admin/storefront", "/admin/labels", "/admin/hero", "/admin/add-product", "/admin/bulk-listing", "/admin/orders", "/admin/products", "/admin/inventory", "/admin/notifications", "/admin/customers", "/admin/reviews", "/admin/questions", "/admin/coupons", "/admin/deals", "/admin/categories", "/admin/returns", "/admin/support", "/admin/system", "/admin/manage-store"].includes(route) ? <AdminWorkspace route={route} onNavigate={onNavigate} /> : route === "/cart" ? <CartPage cart={cart} products={products} setCart={setCart} onNavigate={onNavigate} /> : route === "/checkout" ? <ReactCheckoutPage cart={cart} products={products} user={user} addresses={addresses} onNavigate={onNavigate} onOrderPlaced={() => { setCart([]); reloadAccount(); }} /> : usesReactRoute ? <NotFoundPage onNavigate={onNavigate} /> : <NotFoundPage onNavigate={onNavigate} />;
  if (!usesReactRoute) return content;
  content = <Suspense fallback={<main className="page-main"><div className="loading-card" role="status" aria-live="polite">Preparing your edit…</div></main>}>{content}</Suspense>;
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><Header onNavigate={onNavigate} query={query} setQuery={setQuery} dark={dark} setDark={setDark} palette={palette} setPalette={setPalette} menuOpen={menuOpen} setMenuOpen={setMenuOpen} categories={categories} categoryData={categoryData} products={products} wishlistCount={wishlist.size} cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)} user={user} storefront={storefront} onLogout={clearAccount} /><div id="main-content" tabIndex={-1}>{content}</div>{selected && <QuickView key={selected.id} product={selected} onClose={() => setSelected(null)} onNavigate={onNavigate} addToCart={addToCart} />}<footer className="site-footer"><Link className="footer-mark" href="/" onNavigate={onNavigate}>GLAMIA</Link><p>Curated apparel from independent ateliers — delivered fast,<br />styled to last.</p><nav aria-label="Footer"><Link href="/best-sellers" onNavigate={onNavigate}>The collection</Link> · <Link href="/track-order" onNavigate={onNavigate}>Track an order</Link> · <Link href="/contact" onNavigate={onNavigate}>Contact us</Link> · <Link href="/support" onNavigate={onNavigate}>Support</Link> · <Link href="/policies" onNavigate={onNavigate}>Policies</Link> · <Link href="/profile" onNavigate={onNavigate}>Your account</Link></nav></footer></div>;
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
