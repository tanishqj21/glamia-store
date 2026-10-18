import { EventCountdown } from './components/EventCountdown';
import { normalizeProduct } from './lib/productPresentation';
import { appendAnalyticsTag } from './lib/analyticsWorker';
import { restoreFirstScreenMedia } from './lib/storefrontBootstrap';
import { Header } from './components/Header';
import { WibrawlHome } from './components/WibrawlHome';
import { WibrawlCommerce } from './lib/wibrawlStorefront';
import { WibrawlFooter } from './components/WibrawlFooter';
import { wibrawlPersona } from './lib/wibrawlPersona';

import { useWibrawlTheme } from './lib/useWibrawlTheme';
import { useWibrawlCartMotion } from './lib/useWibrawlCartMotion';
import { isWibrawlUrl } from '../../src/storefront-identity.js';
import { StorePromises, CampaignFeature, CinematicHero, HomepageEditorial } from './components/HomepagePresentation';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { StorefrontFooter } from './components/StorefrontFooter';
import { apiFetch } from "./lib/api";
import { readStorefrontSession } from './lib/storefrontSession';
import { loadGoogleSignIn } from "./lib/googleSignIn";
import { CatalogPage } from './components/CataloguePresentation';
export { selectNewInProducts } from './components/CataloguePresentation';
import { ADMIN_AREA_PERMISSIONS, adminLandingPath, canUseAdminArea } from "./lib/workspaceAccess";
import { sellingPrice, readStorage, writeStorage, readArray } from "./lib/commerce";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Icon } from "./components/Icon";

import { CinematicReel } from "./components/CinematicReel";
import { MobileAppDownload } from "./components/MobileAppDownload";
import { cleanSavedCart, cleanSavedWishlist, savedItemChanges, savedItemSnapshot, hasSavedItemChanges } from "./lib/savedItems";
import { useSavedForLater } from "./lib/useSavedForLater";
import { readSavedForLater, savedForLaterKey } from "./lib/savedForLater";

const storefrontBootstrap = (() => {
  try { return restoreFirstScreenMedia(JSON.parse((document.getElementById('glamia-storefront-bootstrap') || document.getElementById('glamia-product-bootstrap') || document.getElementById('glamia-catalogue-bootstrap') || document.getElementById('glamia-cart-bootstrap'))?.textContent || 'null'), document); }
  catch { return null; }
})();
const isWibrawlStorefront = isWibrawlUrl(window.location.href);
const PUBLIC_CATALOG_PAGE_SIZE = 24;

const hydrateFirstScreen = Boolean(document.querySelector('#glamia-storefront-bootstrap, #glamia-product-bootstrap, #glamia-catalogue-bootstrap, #glamia-cart-bootstrap') && document.getElementById('root')?.hasChildNodes() && !new URLSearchParams(window.location.search).get('query'));
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
let ProductDetailPage = lazy(() => import("./components/ProductDetailPage"));
const QuickView = lazy(() => import("./components/QuickView").then((module) => ({ default: module.QuickView })));
const StoreCreditsPage = lazy(() => import("./components/StoreCredits").then((module) => ({ default: module.StoreCreditsPage })));
let RouteStyles = lazy(() => import("./components/RouteStyles"));
const ProfileCompletionPage = lazy(() => import("./components/AccountPages").then((module) => ({ default: module.ProfileCompletionPage })));
const ReactCheckoutPage = lazy(() => import("./components/CheckoutPage").then((module) => ({ default: module.CheckoutPage })));
const WibrawlCatalogPage = lazy(() => import('./components/WibrawlCatalogPage'));
const WibrawlCartPage = lazy(() => import('./components/WibrawlCartPage'));
const WibrawlCheckoutPage = lazy(() => import('./components/WibrawlCheckoutPage'));
const WibrawlCreditsPage = lazy(() => import('./components/WibrawlCreditsPage'));
const WibrawlOrdersPage = lazy(() => import('./components/WibrawlOrdersPage'));
const WibrawlSupportPage = lazy(() => import('./components/WibrawlSupportPage'));
let CartPage = lazy(() => import("./components/CartPage").then((module) => ({ default: module.CartPage })));
const AdminWorkspace = lazy(() => import("./components/AdminWorkspace").then((module) => ({ default: module.AdminWorkspace })));
const CustomerSupportPage = lazy(() => import("./components/CustomerCare").then((module) => ({ default: module.CustomerSupportPage })));
const PoliciesPage = lazy(() => import("./components/PublicPages").then((module) => ({ default: module.PoliciesPage })));
const ContactPage = lazy(() => import("./components/PublicPages").then((module) => ({ default: module.ContactPage })));
const WibrawlReturnsPage = lazy(() => import("./components/WibrawlReturnsPage"));
const AboutPage = lazy(() => import("./components/AboutPage"));
const OrderTrackingPage = lazy(() => import("./components/OrderTrackingPage").then((module) => ({ default: module.OrderTrackingPage })));

const policyRouteIds = {
  "/terms-and-conditions": "terms",
  "/privacy-policy": "privacy",
  "/refund-cancellation-policy": "refund-cancellation",
  "/return-policy": "returns",
  "/shipping-policy": "shipping"
};


const DEFAULT_META_DESCRIPTION = "Glamia — curated apparel and accessories for every wardrobe. Free and fast shipping across India, with secure payments available.";

function setMetaDescription(text) { const meta = document.querySelector('meta[name="description"]'); if (meta) meta.setAttribute("content", String(text || "").slice(0, 300)); }

function validGoogleMeasurementId(value) {
  return /^G-[A-Z0-9]+$/i.test(String(value || "").trim());
}

function queueGoogleAnalyticsCommand(...args) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag(...args);
}

function ensureGoogleAnalytics(measurementId) {
  const id = String(measurementId || "").trim();
  if (!validGoogleMeasurementId(id)) return false;
  if (!document.querySelector("script[data-glamia-google-tag]") && !window.__glamiaGoogleTagScheduled) {
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    tag.dataset.glamiaGoogleTag = "true";
    window.__glamiaGoogleTagScheduled = true;
    const append = () => appendAnalyticsTag(tag);
    const schedule = () => window.requestIdleCallback ? window.requestIdleCallback(append, { timeout: 2000 }) : window.setTimeout(append, 0);
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
  }
  if (window.__glamiaGoogleAnalyticsMeasurementId !== id) {
    queueGoogleAnalyticsCommand("js", new Date());
    queueGoogleAnalyticsCommand("config", id, { send_page_view: false, anonymize_ip: true });
    window.__glamiaGoogleAnalyticsMeasurementId = id;
  }
  return true;
}

// The homepage is an edit, not the complete catalogue. Keep colourway-linked
// listings discoverable elsewhere while showing a varied first impression here.

function slugify(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

function currentPath() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path;
}

function useRoute() {
  const [route, setRoute] = useState(() => currentPath());
  useEffect(() => {
    const onPopState = () => setRoute(currentPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return [route, (next) => {
    const target = new URL(next, window.location.origin);
    window.history.pushState({}, "", `${target.pathname}${target.search}${target.hash}`);
    setRoute(currentPath());
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (target.hash) window.setTimeout(() => document.getElementById(target.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }];
}





function LoginPage({ onNavigate, onSignedIn }) {
  const [status, setStatus] = useState(() => new URLSearchParams(window.location.search).has("apple_error") ? "Apple sign-in was cancelled or could not be completed. Please try again." : "");
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let attempts = 0; let cancelled = false;
    async function init() {
      const config = await apiFetch("/api/config").then((response) => response.json()).catch(() => ({}));
      if (cancelled) return;
      setAppleAvailable(config.appleWebAvailable === true);
      if (!config.googleClientId || config.googleClientId.includes("REPLACE_WITH")) return;
      try { await loadGoogleSignIn(); } catch { if (!cancelled) setStatus("Google sign-in is unavailable right now."); return; }
      if (cancelled) return;
      if (!window.google?.accounts?.id) { if (attempts++ < 20) return setTimeout(init, 250); return setStatus("Google sign-in is unavailable right now."); }
      window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: async (response) => { try { const result = await apiFetch("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: response.credential }) }); const data = await result.json(); if (!result.ok) throw new Error(data.error || "Sign-in failed"); onSignedIn(data.user); onNavigate("/"); } catch (error) { setStatus(error.message); } } });
      const container = document.getElementById("reactGoogleButton"); if (container) { container.innerHTML = ""; window.google.accounts.id.renderButton(container, { theme: "outline", size: "large", shape: "pill", text: "signin_with" }); }
    }
    init(); return () => { cancelled = true; };
  }, [onNavigate, onSignedIn]);
  return <main className="page-main"><section className="login-page"><p className="eyebrow">Welcome to {isWibrawlStorefront ? "Wibrawl" : "Glamia"}</p><h1 className="page-title">{isWibrawlStorefront ? <>YOUR PEOPLE.<br /><span>YOUR WORLD.</span></> : <>Your wardrobe,<br /><em>your edit.</em></>}</h1><p className="muted">Sign in to view saved addresses, orders, wishlist items, and member checkout options.</p><div id="reactGoogleButton" className="google-button" />{appleAvailable && <a className="apple-signin-button" href="/api/auth/apple/web/start" aria-label="Continue with Apple"><img className="apple-signin-light" src="https://appleid.cdn-apple.com/appleid/button?height=44&width=220&color=black&type=continue&border_radius=22&scale=2&locale=en_US" alt="" /><img className="apple-signin-dark" src="https://appleid.cdn-apple.com/appleid/button?height=44&width=220&color=white&type=continue&border_radius=22&scale=2&locale=en_US" alt="" /></a>}<p className="inline-note" role="status">{status}</p><button type="button" className="text-link" onClick={() => onNavigate("/")}>Continue browsing as a guest</button>{!isWibrawlStorefront && <MobileAppDownload />}</section></main>;
}
function SaleCampaignPopup({ campaign, onClose, onNavigate }) {
  const dialog = useRef(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  async function copyCode() { try { await navigator.clipboard.writeText(campaign.coupon_code); setCopied(true); } catch { setCopied(false); } }
  return <dialog ref={dialog} className={`sale-popup event-theme-${campaign.theme || "graphite"}`} aria-labelledby="sale-popup-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target !== dialog.current) return; const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); }}><button type="button" className="sale-popup-close" onClick={onClose} aria-label="Close event message">×</button><span className="sale-popup-mark">GLAMIA / A NOTE FOR YOU</span><span className="sale-popup-symbol" aria-hidden="true">✳</span><div className="sale-popup-copy"><p className="sale-popup-overline">Welcome back</p><h2 id="sale-popup-title">{campaign.headline}</h2><p>{campaign.message}</p><EventCountdown endsAt={campaign.ends_at} />{campaign.coupon_code && <div className="sale-popup-code"><small>YOUR CODE</small><strong>{campaign.coupon_code}</strong><button type="button" onClick={copyCode}>{copied ? "Copied" : "Copy code"}</button></div>}<div className="sale-popup-actions"><button type="button" className="primary-action" onClick={() => { onClose(); onNavigate(campaign.cta_href || "/offers"); }}>{campaign.cta_label || "Explore the edit"} </button><button type="button" className="sale-popup-later" onClick={onClose}>Maybe later</button></div></div></dialog>;
}

function NotFoundPage({ onNavigate }) {
  return <main className="page-main"><section className="empty-state error-page" aria-labelledby="not-found-title"><div><p className="eyebrow">404 · Glamia</p><h1 id="not-found-title">Page not found.</h1><p>This link is unavailable. Browse the collection to find your next piece.</p><button className="primary-action" type="button" onClick={() => onNavigate("/best-sellers")}>Browse best sellers</button></div></section></main>;
}

function App() {
  const [route, onNavigate] = useRoute();
  // Attach controls to the existing homepage first. Below-fold collections
  // join after hydration, without discarding the already visible hero image.
  const [homepageMounted, setHomepageMounted] = useState(false);
  useEffect(() => { setHomepageMounted(true); }, []);
  const [products, setProducts] = useState(() => (storefrontBootstrap?.catalogue?.products || []).map(normalizeProduct)); const [productPagination, setProductPagination] = useState(null); const [loadingMoreProducts, setLoadingMoreProducts] = useState(false); const [heroSlides, setHeroSlides] = useState(storefrontBootstrap?.hero?.slides || []); const [heroReady, setHeroReady] = useState(Boolean(storefrontBootstrap?.hero)); const [categoryData, setCategoryData] = useState(null); const [storefront, setStorefront] = useState(storefrontBootstrap?.settings || null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("query") || ""); const [category, setCategory] = useState("All"); const [dark, setDark] = useState(() => !hydrateFirstScreen && readStorage("glamia-theme") === "dark"); const [wibrawlTheme, setWibrawlTheme] = useWibrawlTheme(hydrateFirstScreen && isWibrawlStorefront, isWibrawlStorefront); const themeIsDark = isWibrawlStorefront ? wibrawlTheme === "gaming" : dark; const [menuOpen, setMenuOpen] = useState(false); const [selected, setSelected] = useState(null); const [wishlist, setWishlist] = useState(() => new Set(hydrateFirstScreen ? [] : readArray("glamia-react-wishlist"))); const [cart, setCart] = useState(() => (hydrateFirstScreen ? [] : readArray("glamia-react-cart")).filter((item) => item && typeof item.id === "string" && Number.isSafeInteger(item.quantity) && item.quantity > 0)); const [appliedCoupon, setAppliedCoupon] = useState(null); const [user, setUser] = useState(null); const [sessionReady, setSessionReady] = useState(false); const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false); const [addresses, setAddresses] = useState([]); const [orders, setOrders] = useState([]); const [vectorSearch, setVectorSearch] = useState(null); const [gaMeasurementId, setGaMeasurementId] = useState("");
  const [adminToast, setAdminToast] = useState(null);
  const [browserPreferencesReady, setBrowserPreferencesReady] = useState(!hydrateFirstScreen);
  useEffect(() => {
    if (!hydrateFirstScreen) return;
    // Match public server HTML first, then restore private browser preferences.
    // Persistence stays paused until restoration, so saved selections are safe.
    setDark(readStorage('glamia-theme') === 'dark');
    setWishlist(new Set(readArray('glamia-react-wishlist')));
    setCart(readArray('glamia-react-cart').filter(item => item && typeof item.id === 'string' && Number.isSafeInteger(item.quantity) && item.quantity > 0));
    setBrowserPreferencesReady(true);
  }, []);
  const requestedSavedProducts = useRef(new Set());
  const [salePopup, setSalePopup] = useState(null);
  const [eventClock, setEventClock] = useState(() => Date.now());
  useEffect(() => {
    if (!storefront?.active_event) return undefined;
    const ends = Date.parse(storefront.active_event.ends_at || '');
    if (!Number.isFinite(ends)) return;
    const timer = window.setTimeout(() => setEventClock(Date.now()), Math.max(0, Math.min(ends - Date.now() + 25, 2147483647)));
    return () => window.clearTimeout(timer);
  }, [storefront?.active_event]);
  useEffect(() => {
    let lastRefresh = Date.now();
    let active = true;
    let revision = 0;
    function loadSettings(fresh = false) {
      const currentRevision = ++revision;
      return apiFetch(fresh ? "/api/storefront-settings" : "/api/storefront-settings?cache=1", { cacheTtl: fresh ? 0 : 30000 })
        .then(response => response.ok ? response.json() : null)
        .then(data => { if (active && currentRevision === revision && data) setStorefront(data); }).catch(() => {});
    }
    function refreshEvent() {
      if (document.visibilityState !== "visible") return;
      setEventClock(Date.now());
      if (Date.now() - lastRefresh < 60000) return;
      lastRefresh = Date.now();
      loadSettings();
    }
    function refreshAfterSave(event) {
      lastRefresh = Date.now();
      loadSettings(true);
      if (event.detail?.hero) apiFetch("/api/hero").then(response => response.ok ? response.json() : null)
        .then(data => { if (active && data) setHeroSlides(data.slides || []); }).catch(() => {});
    }
    if (!storefrontBootstrap?.settings) loadSettings();
    document.addEventListener("visibilitychange", refreshEvent);
    window.addEventListener("glamia-storefront-updated", refreshAfterSave);
    return () => { active = false; document.removeEventListener("visibilitychange", refreshEvent); window.removeEventListener("glamia-storefront-updated", refreshAfterSave); };
  }, []);
  const lastSaleUserRef = useRef("");
  useEffect(() => {
    const boundary = Date.parse(storefront?.announcement?.next_change_at);
    if (!Number.isFinite(boundary)) return undefined;
    let active = true;
    let timer;
    function refreshAtBoundary() {
      if (Date.now() < boundary) { schedule(); return; }
      apiFetch('/api/storefront-settings', { cacheTtl: 0 }).then(response => response.ok ? response.json() : null)
        .then(data => { if (active && data) setStorefront(data); }).catch(() => {});
    }
    function schedule() { timer = window.setTimeout(refreshAtBoundary, Math.min(Math.max(boundary - Date.now() + 100, 1000), 2147483647)); }
    schedule();
    return () => { active = false; window.clearTimeout(timer); };
  }, [storefront?.announcement?.next_change_at]);
  useEffect(() => {
    if (route.startsWith("/admin")) return undefined;
    if (!user?.email) { lastSaleUserRef.current = ""; return undefined; }
    const campaign = storefront?.sign_in_event || storefront?.sales_campaign;
    if (!campaign) return undefined;
    if (lastSaleUserRef.current) return undefined;
    lastSaleUserRef.current = user.email;
    if (!campaign?.active || !campaign.show_after_sign_in) return undefined;
    const campaignKey = `glamia-sale-popup:${campaign.id || campaign.headline}:${campaign.starts_at || "always"}:${campaign.ends_at || "open"}`;
    if (campaign.show_once && readStorage(campaignKey)) return undefined;
    if (campaign.show_once) writeStorage(campaignKey, "seen");
    setSalePopup(campaign);
    return undefined;
  }, [route, storefront?.sign_in_event, storefront?.sales_campaign, user?.email]);
  useEffect(() => {
    function showAdminToast(event) {
      setAdminToast({ id: Date.now(), message: event.detail?.message || "Changes saved successfully." });
    }
    window.addEventListener("glamia-admin-save-success", showAdminToast);
    return () => window.removeEventListener("glamia-admin-save-success", showAdminToast);
  }, []);
  useEffect(() => {
    if (!adminToast) return undefined;
    const timer = window.setTimeout(() => setAdminToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [adminToast]);
  useEffect(() => {
    const fallback = window.setTimeout(dismissInitialLoader, 5000);
    return () => window.clearTimeout(fallback);
  }, []);
  useEffect(() => {
    if (route === "/" && loading && !heroReady) return undefined;
    const frame = window.requestAnimationFrame(dismissInitialLoader);
    return () => window.cancelAnimationFrame(frame);
  }, [route, loading, heroReady]);
  useEffect(() => { if (!browserPreferencesReady) return; document.documentElement.dataset.brand = isWibrawlStorefront ? "wibrawl" : "glamia"; document.documentElement.dataset.palette = isWibrawlStorefront ? "wibrawl" : "graphite"; document.documentElement.dataset.theme = themeIsDark ? "dark" : "light"; if (!isWibrawlStorefront) writeStorage("glamia-theme", dark ? "dark" : "light"); }, [dark, themeIsDark, wibrawlTheme, browserPreferencesReady]);
  useEffect(() => { if (browserPreferencesReady) writeStorage("glamia-react-cart", JSON.stringify(cart)); }, [cart, browserPreferencesReady]); useEffect(() => { if (browserPreferencesReady) writeStorage("glamia-react-wishlist", JSON.stringify([...wishlist])); }, [wishlist, browserPreferencesReady]);
  const [savedSyncTick, setSavedSyncTick] = useState(0);
  const savedForLater = useSavedForLater(user?.email, sessionReady);
  const { items: laterItems, ready: laterReady, replaceItems: replaceLaterItems, getBaseline: getLaterBaseline } = savedForLater;
  const [savedSyncError, setSavedSyncError] = useState("");
  const [savedConnectTick, setSavedConnectTick] = useState(0);
  const savedCurrentRef = useRef({ cart: [], wishlist: [] });
  const savedServerRef = useRef({ cart: [], wishlist: [] });
  const savedSyncEmailRef = useRef("");
  const savedBusyRef = useRef(false);
  const savedPendingWriteRef = useRef(null);
  const savedLastReadRef = useRef(0);
  useEffect(() => { savedCurrentRef.current = savedItemSnapshot({ cart, wishlist: [...wishlist], saved_for_later: laterItems }); }, [cart, wishlist, laterItems]);
  useEffect(() => {
    if (!sessionReady || !laterReady || !user?.email) { savedSyncEmailRef.current = ""; return undefined; }
    const email = String(user.email).toLowerCase();
    let active = true;
    (async () => {
      const previouslySynced = readStorage("glamia-saved-sync-user");
      const local = savedCurrentRef.current;
      const laterBaseline = getLaterBaseline();
      const firstResponse = await apiFetch("/api/saved-items");
      if (!firstResponse.ok || !Array.isArray((await firstResponse.clone().json()).saved_for_later)) throw new Error("Account saved-for-later syncing is not available yet");
      if (!active) return;
      let response;
      if (previouslySynced === email) {
        let baseline = null;
        try { const raw = readStorage("glamia-saved-baseline"); baseline = raw ? JSON.parse(raw) : null; } catch { /* Merge selections from before the baseline existed. */ }
        if (!baseline) response = await apiFetch("/api/saved-items/merge", { method: "POST", body: JSON.stringify({ ...local, saved_for_later: laterBaseline === null ? local.saved_for_later : [] }) });
        else {
          baseline.saved_for_later = laterBaseline ?? baseline.saved_for_later;
          const unsent = savedItemChanges(savedItemSnapshot(baseline), local);
          response = hasSavedItemChanges(unsent)
            ? await apiFetch("/api/saved-items", { method: "PATCH", body: JSON.stringify(unsent) })
            : firstResponse;
        }
      } else response = previouslySynced ? firstResponse : await apiFetch("/api/saved-items/merge", { method: "POST", body: JSON.stringify({ ...local, saved_for_later: laterBaseline === null ? local.saved_for_later : [] }) });
      if (!response.ok) throw new Error("Saved items could not be loaded");
      let data = await response.json();
      if (!active) return;
      // A per-account baseline prevents an old device cache from resurrecting remotely removed items after sign-out.
      const ownLater = savedItemChanges(savedItemSnapshot({ saved_for_later: laterBaseline || [] }), savedItemSnapshot({ saved_for_later: local.saved_for_later }));
      if (ownLater.saved_for_later.length && (previouslySynced !== email || !readStorage("glamia-saved-baseline")) && (previouslySynced || laterBaseline !== null)) {
        response = await apiFetch("/api/saved-items", { method: "PATCH", body: JSON.stringify(ownLater) });
        if (!response.ok) throw new Error("Saved for later could not be synced");
        data = await response.json();
        if (!active) return;
      }
      const late = savedItemChanges(local, savedCurrentRef.current);
      if (hasSavedItemChanges(late)) {
        response = await apiFetch("/api/saved-items", { method: "PATCH", body: JSON.stringify(late) });
        if (!response.ok) throw new Error("Saved items could not be synced");
        data = await response.json();
      }
      if (!active) return;
      let guestMergeError = "";
      const guestKey = savedForLaterKey();
      const guest = readSavedForLater(localStorage, guestKey);
      if (guest.ready && guest.items.length) {
        try {
          response = await apiFetch("/api/saved-items/merge", { method: "POST", body: JSON.stringify({ cart: [], wishlist: [], saved_for_later: guest.items }) });
          if (!response.ok) throw new Error("Guest selections could not be merged");
          data = await response.json();
          localStorage.removeItem(guestKey);
        } catch { guestMergeError = "Guest saved items are still in this browser. Free space in Saved for later or reconnect to sync them."; }
      }
      if (!active) return;
      savedServerRef.current = savedItemSnapshot(data);
      savedCurrentRef.current = savedServerRef.current;
      setCart(savedServerRef.current.cart);
      setWishlist(new Set(savedServerRef.current.wishlist));
      replaceLaterItems(savedServerRef.current.saved_for_later);
      setSavedSyncError(guestMergeError);
      savedSyncEmailRef.current = email;
      writeStorage("glamia-saved-sync-user", email);
      writeStorage("glamia-saved-baseline", JSON.stringify(savedServerRef.current));
    })().catch(() => { if (active) setSavedSyncError("Saved on this device. Account syncing is unavailable; reconnect to sync with the app and website."); });
    return () => { active = false; savedSyncEmailRef.current = ""; };
  }, [sessionReady, user?.email, savedConnectTick, laterReady, replaceLaterItems, getLaterBaseline]);
  useEffect(() => {
    if (!user?.email || savedSyncEmailRef.current !== String(user.email).toLowerCase()) return undefined;
    const timer = window.setTimeout(async () => {
      if (savedBusyRef.current) return;
      const delta = savedItemChanges(savedServerRef.current, savedCurrentRef.current);
      if (!hasSavedItemChanges(delta)) return;
      savedBusyRef.current = true;
      const sent = savedCurrentRef.current;
      try {
        savedPendingWriteRef.current = apiFetch("/api/saved-items", { method: "PATCH", body: JSON.stringify(delta) });
        const response = await savedPendingWriteRef.current;
        if (!response.ok) throw new Error("Saved items could not be synced");
        const data = await response.json();
        if (savedSyncEmailRef.current !== String(user.email).toLowerCase()) return;
        savedServerRef.current = savedItemSnapshot(data);
        writeStorage("glamia-saved-baseline", JSON.stringify(savedServerRef.current));
        const changedWhileSaving = savedItemChanges(sent, savedCurrentRef.current);
        if (!hasSavedItemChanges(changedWhileSaving)) {
          savedCurrentRef.current = savedServerRef.current;
          setCart(savedServerRef.current.cart);
          setWishlist(new Set(savedServerRef.current.wishlist));
          replaceLaterItems(savedServerRef.current.saved_for_later);
          setSavedSyncError("");
        } else setSavedSyncTick(value => value + 1);
      } catch { setSavedSyncError("Saved on this device. Reconnect to sync your changes with the app and website."); }
      finally { savedBusyRef.current = false; savedPendingWriteRef.current = null; }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [cart, wishlist, laterItems, user?.email, savedSyncTick, replaceLaterItems]);
  useEffect(() => {
    function refreshSaved() {
      if (document.visibilityState !== "visible" || !user?.email || savedBusyRef.current) return;
      if (savedSyncEmailRef.current !== String(user.email).toLowerCase()) { setSavedConnectTick(value => value + 1); return; }
      const pending = savedItemChanges(savedServerRef.current, savedCurrentRef.current);
      if (hasSavedItemChanges(pending)) { setSavedSyncTick(value => value + 1); return; }
      if (Date.now() - savedLastReadRef.current < 60000) return;
      savedLastReadRef.current = Date.now();
      apiFetch("/api/saved-items").then(response => response.ok ? response.json() : null).then(data => {
        if (!data || savedSyncEmailRef.current !== String(user.email).toLowerCase() || hasSavedItemChanges(savedItemChanges(savedServerRef.current, savedCurrentRef.current))) return;
        savedServerRef.current = savedItemSnapshot(data);
        writeStorage("glamia-saved-baseline", JSON.stringify(savedServerRef.current));
        savedCurrentRef.current = savedServerRef.current;
        setCart(savedServerRef.current.cart);
        setWishlist(new Set(savedServerRef.current.wishlist));
        replaceLaterItems(savedServerRef.current.saved_for_later);
        setSavedSyncError("");
      }).catch(() => {});
    }
    document.addEventListener("visibilitychange", refreshSaved);
    window.addEventListener("online", refreshSaved);
    window.addEventListener("focus", refreshSaved);
    window.addEventListener("glamia-refresh-saved-items", refreshSaved);
    return () => { document.removeEventListener("visibilitychange", refreshSaved); window.removeEventListener("online", refreshSaved); window.removeEventListener("focus", refreshSaved); window.removeEventListener("glamia-refresh-saved-items", refreshSaved); };
  }, [user?.email, replaceLaterItems]);
  useEffect(() => { if (route === "/cart") window.dispatchEvent(new Event("glamia-refresh-saved-items")); }, [route]);
  const accountCollectionsLoaded = useRef({ addresses: false, orders: false });
  async function loadAccountCollections({ addresses: loadAddresses = false, orders: loadOrders = false } = {}) {
    if (!user || (!loadAddresses && !loadOrders)) return;
    const requests = [];
    if (loadAddresses && !accountCollectionsLoaded.current.addresses) requests.push(["addresses", apiFetch("/api/addresses")]);
    if (loadOrders && !accountCollectionsLoaded.current.orders) requests.push(["orders", apiFetch("/api/orders")]);
    const responses = await Promise.all(requests.map(([, request]) => request.catch(() => null)));
    await Promise.all(responses.map(async (response, index) => {
      const kind = requests[index][0];
      if (!response?.ok) return;
      const data = await response.json();
      accountCollectionsLoaded.current[kind] = true;
      if (kind === "addresses") setAddresses(data.addresses || []);
      if (kind === "orders") setOrders(data.orders || []);
    }));
  }
  async function reloadAccount({ addresses: loadAddresses = false, orders: loadOrders = false } = {}) {
    const session = await readStorefrontSession().catch(() => ({}));
    const nextUser = session.user || null;
    setUser(nextUser);
    setNeedsProfileCompletion(Boolean(session.needs_profile_completion || nextUser?.needs_profile_completion));
    setSessionReady(true);
    if (!nextUser) {
      if (readStorage("glamia-saved-sync-user")) { writeStorage("glamia-saved-sync-user", ""); writeStorage("glamia-saved-baseline", ""); setCart([]); setWishlist(new Set()); }
      accountCollectionsLoaded.current = { addresses: false, orders: false };
      setAddresses([]);
      setOrders([]);
      return;
    }
    await loadAccountCollections({
      addresses: loadAddresses || window.location.pathname === "/checkout" || window.location.pathname === "/address",
      orders: loadOrders || window.location.pathname === "/orders" || (isWibrawlStorefront && window.location.pathname === "/returns")
    });
  }
  useEffect(() => {
    if (!user) return undefined;
    const needsAddresses = route === "/address" || route === "/checkout";
    const needsOrders = route === "/orders" || (isWibrawlStorefront && route === "/returns");
    if (!needsAddresses && !needsOrders) return undefined;
    loadAccountCollections({ addresses: needsAddresses, orders: needsOrders });
    return undefined;
  }, [route, user?.email]);
  useEffect(() => {
    let cancelled = false;
    const optionalRead = (url) => apiFetch(url, { cacheTtl: 30000 }).then((response) => response.ok ? response.json() : null).catch(() => null);
    Promise.all([
      apiFetch(`/api/products?view=cards&limit=${PUBLIC_CATALOG_PAGE_SIZE}&page=1`, { cacheTtl: 30000 }),
      (storefrontBootstrap?.hero ? Promise.resolve(storefrontBootstrap.hero) : optionalRead("/api/hero?cache=1")).then(data => { if (!cancelled) { setHeroSlides(data?.slides || []); setHeroReady(true); } return data; }),
      optionalRead("/api/categories?cache=1"),
      reloadAccount().catch(() => null)
    ]).then(async ([productResponse, heroData, categoryDataResponse]) => {
      if (!productResponse.ok) throw new Error("Products could not be loaded");
      const productData = await productResponse.json();
      const loadedProducts = (productData.products || []).map(normalizeProduct);
      const loadedIds = new Set(loadedProducts.map((product) => product.id));
      const savedIds = [...new Set([...cart.map((item) => item.id), ...wishlist])].filter((id) => id && !loadedIds.has(id)).slice(0, 100);
      if (savedIds.length) {
        const savedResponse = await apiFetch(`/api/products?view=cards&include_stock=1&ids=${savedIds.map((id) => encodeURIComponent(id)).join(",")}`, { cacheTtl: 30000 }).catch(() => null);
        if (savedResponse?.ok) {
          const savedData = await savedResponse.json();
          loadedProducts.push(...(savedData.products || []).map(normalizeProduct));
        }
      }
      if (!cancelled) {
        setProducts(loadedProducts);
        setProductPagination(productData.pagination || null);
        setHeroSlides(heroData?.slides || []);
        setCategoryData(categoryDataResponse);
      }
    }).catch(() => {
      if (!cancelled) { setError("The collection could not be loaded. Please refresh to try again."); setProducts([]); }
    }).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);
  async function loadMoreProducts() { if (!productPagination?.has_more || loadingMoreProducts) return; setLoadingMoreProducts(true); setError(""); try { const nextPage = Number(productPagination.page || 1) + 1; const response = await apiFetch(`/api/products?view=cards&limit=${PUBLIC_CATALOG_PAGE_SIZE}&page=${nextPage}`, { cacheTtl: 30000 }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "More products could not be loaded"); const nextProducts = (data.products || []).map(normalizeProduct); setProducts((current) => { const byId = new Map(current.map((product) => [product.id, product])); nextProducts.forEach((product) => byId.set(product.id, product)); return [...byId.values()]; }); setProductPagination(data.pagination || { ...productPagination, page: nextPage, has_more: false }); } catch (loadError) { setError(loadError.message || "More products could not be loaded"); } finally { setLoadingMoreProducts(false); } }
  useEffect(() => {
    if (loading) return;
    const known = new Set(products.map(product => product.id));
    const missing = [...new Set([...cart.map(item => item.id), ...wishlist])].filter(id => id && !known.has(id) && !requestedSavedProducts.current.has(id)).slice(0, 100);
    if (!missing.length) return;
    missing.forEach(id => requestedSavedProducts.current.add(id));
    apiFetch(`/api/products?view=cards&include_stock=1&ids=${missing.map(encodeURIComponent).join(",")}`, { cacheTtl: 30000 })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data?.products?.length) return;
        setProducts(current => {
          const byId = new Map([...current, ...data.products.map(normalizeProduct)].map(product => [product.id, product]));
          return [...byId.values()];
        });
      }).catch(() => missing.forEach(id => requestedSavedProducts.current.delete(id)));
  }, [cart, wishlist, products, loading]);
  useEffect(() => {
    let active = true;
    apiFetch("/api/config", { cacheTtl: 300000 })
      .then((response) => (response.ok ? response.json() : {}))
      .then((config) => { if (active) setGaMeasurementId(config.googleAnalyticsMeasurementId || ""); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const term = route === "/search" ? query.trim() : "";
    setVectorSearch(null);
    if (!term) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    apiFetch(`/api/search?q=${encodeURIComponent(term)}&cache=1`, { signal: controller.signal, cacheTtl: 10000 })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled) setVectorSearch(data?.engine === "vector" ? { products: (data.products || []).map(normalizeProduct) } : null); })
      .catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, [route, query]);
  const categories = useMemo(() => ["All", ...new Set(products.map((product) => product.category).filter(Boolean))], [products]);
  const analyticsPathRef = useRef("");
  useEffect(() => {
    const analyticsPath = window.location.pathname + window.location.search;
    if (analyticsPathRef.current === analyticsPath) return undefined;
    analyticsPathRef.current = analyticsPath;
    const timer = window.setTimeout(() => {
      fetch("/api/analytics/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: analyticsPath, referrer: document.referrer }), keepalive: true }).then(response => response.arrayBuffer()).catch(() => {});
    }, 600);
    return () => window.clearTimeout(timer);
  }, [route]);
  function toggleWishlist(id) { setWishlist((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function mergeLoadedProduct(nextProduct) {
    if (!nextProduct?.id) return;
    setProducts((current) => {
      const existing = current.some((product) => product.id === nextProduct.id);
      return existing ? current.map((product) => product.id === nextProduct.id ? { ...product, ...nextProduct } : product) : [...current, nextProduct];
    });
  }
  function handleSignedIn(nextUser) { accountCollectionsLoaded.current = { addresses: false, orders: false }; setUser(nextUser); setNeedsProfileCompletion(Boolean(nextUser?.needs_profile_completion)); setSessionReady(true); }
  function completeProfile(nextProfile) { setNeedsProfileCompletion(false); setUser((current) => current ? { ...current, name: nextProfile.name } : current); reloadAccount(); onNavigate("/"); }
  async function flushSavedBeforeLogout() {
    const email = String(user?.email || "").toLowerCase();
    if (savedPendingWriteRef.current) {
      const response = await savedPendingWriteRef.current;
      if (!response.ok) throw new Error("Saved items could not be synced. Please try again.");
    }
    if (savedSyncEmailRef.current !== email) {
      if (savedCurrentRef.current.cart.length || savedCurrentRef.current.wishlist.length) throw new Error("Saved items are still syncing. Please try again shortly.");
      return;
    }
    const delta = savedItemChanges(savedServerRef.current, savedCurrentRef.current);
    if (!delta.cart.length && !delta.wishlist.length) return;
    const response = await apiFetch("/api/saved-items", { method: "PATCH", body: JSON.stringify(delta) });
    if (!response.ok) throw new Error("Saved items could not be synced. Please try again.");
    const data = await response.json();
    savedServerRef.current = { cart: cleanSavedCart(data.cart), wishlist: cleanSavedWishlist(data.wishlist) };
    writeStorage("glamia-saved-baseline", JSON.stringify(savedServerRef.current));
  }
  function clearAccount() { accountCollectionsLoaded.current = { addresses: false, orders: false }; savedSyncEmailRef.current = ""; writeStorage("glamia-saved-sync-user", ""); writeStorage("glamia-saved-baseline", ""); setCart([]); setWishlist(new Set()); setUser(null); setNeedsProfileCompletion(false); setAddresses([]); setOrders([]); setSessionReady(true); }
  useEffect(() => {
    function handleAdminAuthFailure() {
      clearAccount();
      if (currentPath().startsWith("/admin")) onNavigate("/");
    }
    window.addEventListener("glamia-admin-auth-failed", handleAdminAuthFailure);
    return () => window.removeEventListener("glamia-admin-auth-failed", handleAdminAuthFailure);
  }, [onNavigate]);
  function addToCart(product, size = "", origin) { const id = product.id || product.slug; setCart((current) => { const existing = current.find((item) => item.id === id && item.size === size); return existing ? current.map((item) => item === existing ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { id, size, quantity: 1 }]; }); playCartMotion(product, origin); }
  const routeMatch = route.match(/^\/product\/([^/]+)$/);
  const seoProductMatch = route.match(/^\/(?!category(?:\/|$)|product(?:\/|$))([^/]+)\/([^/]+)\/([^/]+)$/i);
  const productRouteRef = seoProductMatch?.[3] || routeMatch?.[1] || "";
  const productPathContext = seoProductMatch ? { category: seoProductMatch[1], subcategory: seoProductMatch[2] } : null;
  const categoryPathMatch = route.match(/^\/([^/]+)$/);
  const categoryRoute = categoryPathMatch ? categories.find((item) => item !== "All" && slugify(item) === categoryPathMatch[1]) : null;
  const routeSubcategory = categoryRoute || route.startsWith("/category/") ? new URLSearchParams(window.location.search).get("sub") || "" : "";
  const wibrawlSections = wibrawlPersona(wibrawlTheme).sections;
  const catalogTitle = route === "/offers" ? (isWibrawlStorefront ? wibrawlSections.offers : "Offers") : route === "/just-arrived" ? (isWibrawlStorefront ? wibrawlSections.arrived : "Just arrived") : route === "/best-sellers" ? (isWibrawlStorefront ? wibrawlSections.best : "Best sellers") : route.startsWith("/category/") ? decodeURIComponent(route.split("/").pop()) : categoryRoute || (route === "/search" ? `Search results for “${query}”` : "The collection");
   const reactRoutes = new Set(["/", "/login", "/offers", "/just-arrived", "/best-sellers", "/search", "/cart", "/checkout", "/profile", "/address", "/orders", "/wishlist", "/reviews", "/support", "/contact", "/about", "/policies", ...Object.keys(policyRouteIds), "/track-order", "/admin", "/admin/storefront", "/admin/about", "/admin/events", "/admin/labels", "/admin/hero", "/admin/tax", "/admin/add-product", "/admin/bulk-listing", "/admin/orders", "/admin/completed-orders", "/admin/products", "/admin/inventory", "/admin/notifications", "/admin/customers", "/admin/employees", "/admin/reviews", "/admin/questions", "/admin/coupons", "/admin/deals", "/admin/categories", "/admin/returns", "/admin/support", "/admin/system", "/admin/manage-store", "/admin/credits", "/credits"]);
  const isAdminRoute = route === "/admin" || route.startsWith("/admin/");
  const playCartMotion = useWibrawlCartMotion(isWibrawlStorefront && !isAdminRoute, route);
  useEffect(() => { if (isWibrawlStorefront && !isAdminRoute) { document.documentElement.dataset.wibrawlTheme = themeIsDark ? "dark" : "light"; document.documentElement.dataset.wibrawlMode = wibrawlTheme; } else {delete document.documentElement.dataset.wibrawlTheme;delete document.documentElement.dataset.wibrawlMode;} }, [isAdminRoute, themeIsDark]);
  const usesReactRoute = Boolean(user && needsProfileCompletion) || (reactRoutes.has(route) || (isWibrawlStorefront && route === "/returns")) || routeMatch || seoProductMatch || route.startsWith("/category/") || Boolean(categoryRoute) || isAdminRoute;
  // Event pricing is presentation only; checkout and product records retain their real prices.
  const eventLive = Boolean(storefront?.active_event?.active && (!storefront.active_event.ends_at || Date.parse(storefront.active_event.ends_at) > eventClock));
  const collectionProducts = route === "/offers" ? (eventLive ? products : products.filter((p) => sellingPrice(p) < Number(p.mrp || p.price))) : route === "/just-arrived" ? [...products].sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at)) : route === "/best-sellers" ? [...products].sort((a,b) => Number(b.sold_total || 0) - Number(a.sold_total || 0)) : products;
  useEffect(() => {
    const wibrawlTitle = { "/offers": wibrawlSections.offers, "/just-arrived": wibrawlSections.arrived, "/best-sellers": wibrawlSections.best }[route];
    document.title = route === "/" ? (isWibrawlStorefront ? "Wibrawl | Pick your side. Wear your world." : storefront?.seo?.title || "Glamia — Curated apparel for every wardrobe") : route === "/about" ? (isWibrawlStorefront ? "About Wibrawl | Wibrawl" : "About Glamia | Glamia") : `${isWibrawlStorefront && wibrawlTitle ? wibrawlTitle : route.split("/").filter(Boolean).join(" · ").replaceAll("-", " ")} | ${isWibrawlStorefront ? "Wibrawl" : "Glamia"}`;
    setMetaDescription(isWibrawlStorefront ? "Tees for the things you play, watch, follow, and love. Pick your side. Wear your world." : route === "/" ? storefront?.seo?.description || DEFAULT_META_DESCRIPTION : DEFAULT_META_DESCRIPTION);
  }, [route, storefront?.seo?.title, storefront?.seo?.description, wibrawlTheme]);
  useEffect(() => {
    if (route.startsWith("/admin") || !ensureGoogleAnalytics(gaMeasurementId)) return undefined;
    queueGoogleAnalyticsCommand("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
    });
    return undefined;
  }, [gaMeasurementId, route]);
  const profileGate = Boolean(user && needsProfileCompletion);
  const adminAccessLoading = isAdminRoute && !sessionReady;
  const adminAccessDenied = isAdminRoute && sessionReady && !canUseAdminArea(user, route);
  useEffect(() => {
    if (!isAdminRoute || !user?.employee_id) return undefined;
    let active = true;
    const refreshAccess = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await apiFetch("/api/session", { dedupe: true });
        if (!response.ok) return;
        const session = await response.json();
        if (active) setUser((current) => JSON.stringify(current) === JSON.stringify(session.user) ? current : session.user);
      } catch { /* Keep the current view during a transient connection failure; the server still checks every request. */ }
    };
    const timer = window.setInterval(refreshAccess, 30000);
    document.addEventListener("visibilitychange", refreshAccess);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshAccess); };
  }, [isAdminRoute, user?.employee_id]);
  useEffect(() => {
    if (adminAccessDenied) onNavigate(adminLandingPath(user));
  }, [adminAccessDenied, onNavigate, user]);
const CurrentCatalogPage = isWibrawlStorefront ? WibrawlCatalogPage : CatalogPage;
const CurrentCartPage = isWibrawlStorefront ? WibrawlCartPage : CartPage;
const CurrentCheckoutPage = isWibrawlStorefront ? WibrawlCheckoutPage : ReactCheckoutPage;
const CurrentCreditsPage = isWibrawlStorefront ? WibrawlCreditsPage : StoreCreditsPage;
const CurrentSupportPage = isWibrawlStorefront ? WibrawlSupportPage : CustomerSupportPage;
let content = adminAccessLoading ? <main className="page-main"><div className="loading-card" role="status">Checking admin access…</div></main> : adminAccessDenied ? <NotFoundPage onNavigate={onNavigate} /> : profileGate ? <ProfileCompletionPage user={user} onComplete={completeProfile} brandName={isWibrawlStorefront ? "Wibrawl" : "Glamia"} /> : route === "/" ? isWibrawlStorefront ? <WibrawlHome theme={wibrawlTheme} slides={heroSlides} ready={heroReady} onNavigate={onNavigate} products={products} wishlist={wishlist} toggleWishlist={toggleWishlist} onQuickView={setSelected} storefront={storefront} catalogReady={homepageMounted} /> : <div><CinematicHero slides={heroSlides} ready={heroReady} onNavigate={onNavigate} /><StorePromises settings={storefront?.trust_strip} /><CampaignFeature campaign={storefront?.sales_campaign} onNavigate={onNavigate} /><HomepageEditorial onNavigate={onNavigate} />{homepageMounted && <><CinematicReel products={products} settings={storefront?.cinematic_reel} onNavigate={onNavigate} /><CatalogPage title="New in" products={products} loading={loading} error={error} categories={categories} storefrontName={isWibrawlStorefront ? "Wibrawl" : "Glamia"} activeCategory={category} activeSubcategory="" setActiveCategory={setCategory} query={query} onNavigate={onNavigate} wishlist={wishlist} toggleWishlist={toggleWishlist} onQuickView={setSelected} homepageNewIn eventLive={eventLive} /></>}</div> : route === "/login" ? <LoginPage onNavigate={onNavigate} onSignedIn={handleSignedIn} /> : route === "/contact" ? <ContactPage storefront={storefront} onNavigate={onNavigate} /> : route === "/about" ? <AboutPage brandName={isWibrawlStorefront ? "Wibrawl" : "Glamia"} /> : route === "/policies" || policyRouteIds[route] ? <PoliciesPage storefront={storefront} onNavigate={onNavigate} policyId={policyRouteIds[route] || ""} /> : route === "/track-order" ? <OrderTrackingPage /> : productRouteRef ? <ProductDetailPage wibrawlMode={isWibrawlStorefront} productRef={decodeURIComponent(productRouteRef)} productPathContext={productPathContext} products={products} onNavigate={onNavigate} addToCart={addToCart} wishlist={wishlist} toggleWishlist={toggleWishlist} user={user} onProductLoaded={mergeLoadedProduct} eventLive={eventLive} /> : ["/offers", "/just-arrived", "/best-sellers", "/search"].includes(route) || route.startsWith("/category/") || (isWibrawlStorefront && categoryRoute) ? <CurrentCatalogPage searchResults={isWibrawlStorefront && route === "/search" && vectorSearch ? vectorSearch.products : null} key={route} title={catalogTitle} products={route === "/search" && vectorSearch ? vectorSearch.products : collectionProducts} loading={loading} error={error} categories={categories} storefrontName={isWibrawlStorefront ? "Wibrawl" : "Glamia"} activeCategory={categoryRoute || (route.startsWith("/category/") ? catalogTitle : category)} activeSubcategory={routeSubcategory} setActiveCategory={setCategory} query={route === "/search" && vectorSearch ? "" : query} onNavigate={onNavigate} wishlist={wishlist} toggleWishlist={toggleWishlist} onQuickView={setSelected} hasMoreProducts={!(route === "/search" && vectorSearch) && Boolean(productPagination?.has_more)} loadingMoreProducts={loadingMoreProducts} productTotal={productPagination?.total || products.length} onLoadMore={loadMoreProducts} eventLive={eventLive} /> : isWibrawlStorefront && route === "/returns" ? <WibrawlReturnsPage user={user} orders={orders} products={products} onNavigate={onNavigate} /> : route === "/support" ? <CurrentSupportPage storefront={storefront} user={user} onNavigate={onNavigate} /> : isWibrawlStorefront && route === "/orders" ? <WibrawlOrdersPage user={user} orders={orders} products={products} onNavigate={onNavigate} /> : ["/profile", "/address", "/orders", "/wishlist", "/reviews"].includes(route) ? <AccountPage route={route} user={user} addresses={addresses} orders={orders} products={products} wishlist={wishlist} toggleWishlist={toggleWishlist} onNavigate={onNavigate} /> : ["/admin", "/admin/storefront", "/admin/about", "/admin/labels", "/admin/hero", "/admin/tax", "/admin/add-product", "/admin/bulk-listing", "/admin/orders", "/admin/inventory", "/admin/notifications", "/admin/customers", "/admin/employees", "/admin/reviews", "/admin/questions", "/admin/coupons", "/admin/deals", "/admin/categories", "/admin/returns", "/admin/support", "/admin/system", "/admin/manage-store", "/admin/credits"].includes(route) ? <AdminWorkspace route={route} onNavigate={onNavigate} user={user} /> : route === "/credits" ? <CurrentCreditsPage user={user} onNavigate={onNavigate} /> : route === "/cart" ? <CurrentCartPage bootPending={!browserPreferencesReady} saved={savedForLater} syncError={savedSyncError} user={user} sessionReady={sessionReady} loading={loading} cart={cart} products={products} setCart={setCart} onNavigate={onNavigate} appliedCoupon={appliedCoupon} onCouponApplied={setAppliedCoupon} onCouponRemoved={() => setAppliedCoupon(null)} /> : route === "/checkout" ? <CurrentCheckoutPage storefront={storefront} cart={cart} products={products} user={user} addresses={addresses} appliedCoupon={appliedCoupon} onCouponApplied={setAppliedCoupon} onCouponRemoved={() => setAppliedCoupon(null)} onOrderPlaced={() => { setCart([]); setAppliedCoupon(null); reloadAccount(); window.dispatchEvent(new Event("glamia-credits-changed")); }} onNavigate={onNavigate} /> : usesReactRoute ? <NotFoundPage onNavigate={onNavigate} /> : <NotFoundPage onNavigate={onNavigate} />;
  // Keep the products management route explicit here as well as in the route manifest.
  // Every recognized admin route uses one workspace on both storefronts.
  if (Object.hasOwn(ADMIN_AREA_PERMISSIONS, route) && !adminAccessDenied && !adminAccessLoading && !profileGate) content = <AdminWorkspace route={route} onNavigate={onNavigate} user={user} />;
  if (salePopup && !isAdminRoute) content = <>{content}<SaleCampaignPopup campaign={salePopup} onClose={() => setSalePopup(null)} onNavigate={onNavigate} /></>;
  if (!usesReactRoute) return content;
  content = <Suspense fallback={<main className="page-main"><div className="loading-card" role="status" aria-live="polite">Preparing your edit…</div></main>}>{profileGate || (!(productRouteRef && document.getElementById('glamia-product-bootstrap')) && route !== "/" && !["/offers", "/just-arrived", "/best-sellers", "/search", "/cart"].includes(route) && !route.startsWith("/category/") && !categoryRoute) ? <RouteStyles>{content}</RouteStyles> : content}</Suspense>;
  return <WibrawlCommerce.Provider value={isWibrawlStorefront && !isAdminRoute ? { products, addToCart, onProductLoaded: mergeLoadedProduct, onQuickView: setSelected, mode: wibrawlTheme, cartProps: { bootPending: !browserPreferencesReady, saved: savedForLater, syncError: savedSyncError, user, sessionReady, loading, cart, products, setCart, appliedCoupon, onCouponApplied: setAppliedCoupon, onCouponRemoved: () => setAppliedCoupon(null) } } : null}><div className={`app-shell ${isWibrawlStorefront ? `wibrawl-shell${!isAdminRoute ? " wb-storefront" : ""}` : ""}`} data-wibrawl-mode={isWibrawlStorefront && !isAdminRoute ? wibrawlTheme : undefined} data-wibrawl-theme={isWibrawlStorefront && !isAdminRoute ? (themeIsDark ? "dark" : "light") : undefined}><a className="skip-link" href="#main-content">Skip to content</a><Header onNavigate={onNavigate} query={query} setQuery={setQuery} dark={themeIsDark} setDark={setDark} wibrawlMode={isWibrawlStorefront} themeMode={wibrawlTheme} setThemeMode={setWibrawlTheme} menuOpen={menuOpen} setMenuOpen={setMenuOpen} categories={categories} categoryData={categoryData} products={products} wishlistCount={wishlist.size} cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)} user={user} storefront={storefront} onBeforeLogout={flushSavedBeforeLogout} onLogout={clearAccount} adminMode={isAdminRoute} /><div id="main-content" tabIndex={-1}>{content}</div>{selected && <Suspense fallback={<p className="inline-note" role="status">Loading product preview…</p>}><QuickView key={selected.id} wibrawlMode={isWibrawlStorefront && !isAdminRoute} product={selected} onClose={() => setSelected(null)} onNavigate={onNavigate} addToCart={addToCart} eventLive={eventLive} /></Suspense>}{isAdminRoute && adminToast && <div className="admin-save-toast" role="status" aria-live="polite"><Icon name="check" size={18} /><span>{adminToast.message}</span><button type="button" aria-label="Dismiss saved message" onClick={() => setAdminToast(null)}>×</button></div>}{isWibrawlStorefront && !isAdminRoute ? <WibrawlFooter storefront={storefront} onNavigate={onNavigate} mode={wibrawlTheme} /> : <StorefrontFooter storefront={storefront} onNavigate={onNavigate} wibrawlMode={isWibrawlStorefront} />}</div></WibrawlCommerce.Provider>;
}

export async function mountApplication() {
  // Retain the server-rendered product until its interactive counterpart and
  // styles are ready; do not replace the gallery with a suspense loading card.
  if (document.getElementById('glamia-product-bootstrap')) {
    const product = await import('./components/ProductDetailPage');
    ProductDetailPage = product.default;
  }
  if (document.getElementById('glamia-cart-bootstrap')) CartPage = (await import('./components/CartPage')).CartPage;
  const root = document.getElementById('root');
  if (hydrateFirstScreen) {
    // Only temporary server-side locks are removed. Truly disabled stock/size
    // controls are not marked and remain disabled. No await occurs before the
    // hydration root attaches delegated listeners, including early-click replay.
    for (const control of root.querySelectorAll('[data-glamia-pending-control]')) {
      control.removeAttribute('disabled');
      control.removeAttribute('data-glamia-pending-control');
    }
    hydrateRoot(root, <ErrorBoundary><App /></ErrorBoundary>, {
      onRecoverableError(error) { console.error('storefront_hydration_failed', error); }
    });
  } else createRoot(root).render(<ErrorBoundary><App /></ErrorBoundary>);
}
