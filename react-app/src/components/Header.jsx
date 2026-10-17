import { GlamiaLogo } from './GlamiaLogo';
import { AnnouncementBar } from './AnnouncementBar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { normalizeProduct } from '../lib/productPresentation';
import { money, sellingPrice, productUrl } from '../lib/commerce';
import { adminLandingPath } from '../lib/workspaceAccess';
import { Icon } from './Icon';
import { CreditsBalance } from './CreditsBalance';
import { WibrawlThemeToggle } from './WibrawlThemeToggle';
import { WibrawlHeader } from './WibrawlHeader';
import { WIBRAWL_ORIGIN, collectionNames } from '../../../src/storefront-identity.js';

function Link({ href, onNavigate, children, className = "", ...props }) {
  return <a {...props} className={className} href={href} onClick={(event) => { props.onClick?.(event); if (!event.defaultPrevented && !event.button && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !props.target && href.startsWith("/")) { event.preventDefault(); onNavigate(href); } }}>{children}</a>;
}

function moveWibrawlGlow(event) {
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const angle = Math.atan2(event.clientY - bounds.y - bounds.height / 2, event.clientX - bounds.x - bounds.width / 2) * 180 / Math.PI + 90;
  event.currentTarget.style.setProperty('--wibrawl-glow-angle', `${angle}deg`);
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

function DrawerCategory({ node, category, onNavigate, closeMenu, arrowFree = false, depth = 0 }) {
  const hasChildren = depth === 0 || node.children?.length > 0;
  const href = depth === 0 ? categoryHref(category) : depth === 1 ? categoryHref(category, node.name) : categoryHref(category, node.parentSubcategory, node.name);
  if (!hasChildren) return <Link className={`drawer-leaf drawer-leaf-${depth}`} href={href} onNavigate={(nextHref) => { closeMenu(); onNavigate(nextHref); }}>{node.name}</Link>;
  return <details className={`drawer-category drawer-category-${depth}`}><summary><span>{node.name}</span>{arrowFree ? <span className="drawer-expand" aria-hidden="true">+</span> : <Icon name="chevronDown" size={16} />}</summary><div className="drawer-category-children"><Link className="drawer-view-all" href={href} onNavigate={(nextHref) => { closeMenu(); onNavigate(nextHref); }}>View all {node.name}</Link>{node.children.map((child) => <DrawerCategory key={child.name} node={{ ...child, parentSubcategory: node.name }} category={category} onNavigate={onNavigate} closeMenu={closeMenu} arrowFree={arrowFree} depth={depth + 1} />)}</div></details>;
}

function Header({ onNavigate, query, setQuery, dark, setDark, wibrawlMode = false, themeMode = "sports", setThemeMode, menuOpen, setMenuOpen, categories, categoryData: providedCategoryData, products = [], wishlistCount, cartCount = 0, user, storefront, onBeforeLogout, onLogout, adminMode = false }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [drawerCategoryData, setDrawerCategoryData] = useState(null);
  const searchRef = useRef(null);
  const accountRef = useRef(null);
  const drawerRef = useRef(null);
  useEffect(() => {
    if (!menuOpen || adminMode || wibrawlMode) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector('button')?.focus();
    function keyboard(event) {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); }
      if (event.key !== 'Tab') return;
      const controls = [...(drawerRef.current?.querySelectorAll('a,button,summary,input,select,[tabindex="0"]') || [])].filter(element => element.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [menuOpen, adminMode, wibrawlMode, setMenuOpen]);
  useEffect(() => {
    const closeOutside = event => {
      if (accountRef.current?.open && !accountRef.current.contains(event.target)) accountRef.current.open = false;
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape' && accountRef.current?.open) {
        accountRef.current.open = false;
        accountRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [remoteSuggestions, setRemoteSuggestions] = useState(null);
  const searchSuggestions = useMemo(() => {
    if (remoteSuggestions) return remoteSuggestions.map(normalizeProduct).slice(0, 6);
    return products.filter((product) => wibrawlMode ? `${product.name || ''} ${product.category || ''} ${product.subcategory || ''} ${product.color || ''} ${(product.tags || []).toString()}`.toLowerCase().includes(query.trim().toLowerCase()) : searchMatches(product, query)).slice(0, 6);
  }, [remoteSuggestions, products, query, wibrawlMode]);
  const searchOpen = searchFocused && Boolean(query.trim());
  useEffect(() => {
    if (adminMode) return undefined;
    const term = query.trim();
    if (!term) { setRemoteSuggestions(null); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(term)}&cache=1`, { signal: controller.signal, cacheTtl: 10000 })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setRemoteSuggestions(Array.isArray(data?.products) ? data.products : null))
        .catch(() => {});
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, adminMode]);
  useEffect(() => {
    if (!searchOpen) return;
    function onPointerDown(event) { if (!searchRef.current?.contains(event.target)) { setSearchFocused(false); setHighlightIndex(-1); } }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [searchOpen]);
  useEffect(() => { if (adminMode) return undefined; let active = true; apiFetch("/api/categories?cache=1", { cacheTtl: 30000 }).then((response) => response.ok ? response.json() : null).then((data) => active && setDrawerCategoryData(data)).catch(() => {}); return () => { active = false; }; }, [adminMode]);
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
      // Cart/wishlist sync is best-effort here. Its outage/rate limit must not
      // prevent server-side session revocation on a shared customer device.
      try { await onBeforeLogout?.(); } catch { console.warn("logout_saved_sync_failed"); }
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
  function toggleMenu() {
    setMenuOpen((open) => !open);
  }
  if (wibrawlMode && !adminMode) return <WibrawlHeader onNavigate={onNavigate} query={query} setQuery={setQuery} themeMode={themeMode} setThemeMode={setThemeMode} menuOpen={menuOpen} setMenuOpen={setMenuOpen} categoryTree={categoryTree} wishlistCount={wishlistCount} cartCount={cartCount} user={user} storefront={storefront} logout={logout} loggingOut={loggingOut} logoutError={logoutError} suggestions={searchSuggestions} moveGlow={moveWibrawlGlow} />;
  const names = collectionNames(themeMode);
  const collectionLinks = wibrawlMode
    ? [["/just-arrived", names.arrived], ["/best-sellers", names.best], ["/offers", names.offers]]
    : [["/offers", "Offers"], ["/just-arrived", "Just arrived"], ["/best-sellers", "Best sellers"]];
  const themeControl = <WibrawlThemeToggle theme={themeMode} onChange={setThemeMode} />;
  return <>
    {!adminMode && <AnnouncementBar announcement={storefront?.announcement} />}
    <header className={`site-header ${adminMode ? "admin-site-header" : ""}`}>
      {!adminMode && <button className="menu-button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="shop-menu" onClick={toggleMenu}><span /><span /><span /></button>}
      {!adminMode && !wibrawlMode && <nav className="quick-links" aria-label="Collections">{collectionLinks.map(([href, label]) => <Link key={href} href={href} onNavigate={onNavigate}>{label}</Link>)}{!wibrawlMode && <a className="wibrawl-store-link" href={WIBRAWL_ORIGIN} onPointerMove={moveWibrawlGlow}><span className="wibrawl-store-pill"><img src="/wibrawl/logo.svg" alt="Wibrawl" width="96" height="20" /></span></a>}</nav>}
      <Link className={`wordmark ${wibrawlMode ? "wibrawl-wordmark" : ""}`} href="/" onNavigate={onNavigate} onPointerMove={wibrawlMode ? moveWibrawlGlow : undefined}>{wibrawlMode ? <span className="wibrawl-logo-glow"><img className="wibrawl-logo" src="/wibrawl/logo.svg" alt="Wibrawl" width="212" height="44" fetchPriority="high" /></span> : <GlamiaLogo width="221" height="43" />}<span className="sr-only"> home</span></Link>
      <div className="header-tools">
        {!adminMode && <>
        <div className="search-suggest" ref={searchRef}>
          <form className="search-box" role="search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="reactSearch">Search products</label>
            <input id="reactSearch" value={query} onChange={(event) => { setQuery(event.target.value); setHighlightIndex(-1); setSearchFocused(true); }} onFocus={() => setSearchFocused(true)} onMouseDown={() => setSearchFocused(true)} onKeyDown={onSearchKeyDown} placeholder={wibrawlMode ? "Find your next favourite tee" : "Search the edit"} type="search" autoComplete="off" role="combobox" aria-expanded={searchOpen} aria-controls="search-suggest-list" aria-activedescendant={searchOpen && highlightIndex >= 0 ? `search-suggest-option-${highlightIndex}` : undefined} />
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
        </>}
{user ? <details name="glamia-account-navigation" className="account-menu" ref={accountRef}><summary aria-label="Open account menu"><span className="account-avatar">{String(user.name || user.email || "A").trim().charAt(0).toUpperCase()}</span><span className="account-menu-name">{String(user.name || "Account").split(" ")[0]}</span>{!wibrawlMode && <span className="account-chevron"><Icon name="chevronDown" size={14} /></span>}</summary><div className="account-menu-panel" role="menu">{user.role === "admin" && <Link role="menuitem" className="account-menu-link" href={adminLandingPath(user)} onNavigate={navigateFromAccount}>Admin console</Link>}<Link role="menuitem" className="account-menu-link" href="/profile" onNavigate={navigateFromAccount}>Profile</Link><Link role="menuitem" className="account-menu-link" href="/address" onNavigate={navigateFromAccount}>Saved addresses</Link><Link role="menuitem" className="account-menu-link" href="/wishlist" onNavigate={navigateFromAccount}>Wishlist <span className="account-menu-count">{wishlistCount || 0}</span></Link><Link role="menuitem" className="account-menu-link" href="/orders" onNavigate={navigateFromAccount}>Your orders</Link><button role="menuitem" className="account-menu-link account-menu-logout" type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? "Logging out…" : "Log out"}</button>{logoutError && <p className="account-menu-error" role="alert">{logoutError}</p>}</div></details> : wibrawlMode ? <details name="glamia-account-navigation" className="account-menu wibrawl-guest-account" ref={accountRef}><summary aria-label="Open account menu"><span>Account</span><span className="wibrawl-account-plus" aria-hidden="true">+</span></summary><nav className="account-menu-panel" aria-label="Your account"><Link className="account-menu-link" href="/login" onNavigate={navigateFromAccount}>Log in / Sign up</Link><Link className="account-menu-link" href="/orders" onNavigate={navigateFromAccount}>Your orders</Link><Link className="account-menu-link" href="/wishlist" onNavigate={navigateFromAccount}>Wishlist <span className="account-menu-count">{wishlistCount || 0}</span></Link><Link className="account-menu-link" href="/credits" onNavigate={navigateFromAccount}>Store credits</Link></nav></details> : <Link className="login-link" href="/login" onNavigate={onNavigate}>Log in</Link>}
        {wibrawlMode ? themeControl : <button className="tool-button theme-toggle" onClick={() => setDark((value) => !value)} aria-label="Toggle dark mode" title="Toggle dark mode"><Icon name={dark ? "sun" : "moon"} size={18} /></button>}
        {!adminMode && <CreditsBalance user={user} onNavigate={onNavigate} showWhenSignedOut={wibrawlMode} />}
        {!adminMode && <Link className="tool-button cart-link" href="/cart" onNavigate={onNavigate} aria-label={`Open cart, ${cartCount || 0} item${cartCount === 1 ? "" : "s"}`}><Icon name="bag" size={19} />{cartCount > 0 && <span className="cart-count">{cartCount}</span>}</Link>}
      </div>
    </header>
    {wibrawlMode && !adminMode && <div className="wibrawl-navigation"><nav aria-label="Collections">{collectionLinks.map(([href, label]) => <Link key={href} href={href} onNavigate={onNavigate}>{label}</Link>)}</nav></div>}
    {!adminMode && menuOpen && <div className="menu-layer"><button className="menu-backdrop" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} /><aside id="shop-menu" className="menu-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="shop-menu-title"><button className="drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close shop menu"><Icon name="close" size={20} /></button><p className="eyebrow">Shop {wibrawlMode ? "Wibrawl" : "Glamia"}</p><h2 id="shop-menu-title">{wibrawlMode ? "Pick your side." : "Find your next edit."}</h2>{wibrawlMode && <nav className="wibrawl-drawer-collections" aria-label="Collections">{collectionLinks.map(([href,label]) => <Link key={href} href={href} onNavigate={(next) => { setMenuOpen(false); onNavigate(next); }}>{label}</Link>)}</nav>}<div className="drawer-categories">{categoryTree.map((node) => <DrawerCategory key={node.name} node={node} category={node.name} onNavigate={onNavigate} closeMenu={() => setMenuOpen(false)} arrowFree={wibrawlMode} />)}</div><Link className="drawer-account-link" href="/profile" onNavigate={(href) => { setMenuOpen(false); onNavigate(href); }}>Your account</Link>{wibrawlMode && <a className="drawer-glamia-link" href="https://glamiastore.com" aria-label="Back to Glamia"><span>Back to</span><GlamiaLogo width="164" height="32" /></a>}</aside></div>}
  </>;
}


export { Header, Link, DrawerCategory, productSubcategory, productSubSubcategory, searchMatches, categoryHref };
