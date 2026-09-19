import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Notifications from "expo-notifications";
import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes
} from "react-native-nitro-google-signin";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";
import {
  API_BASE_URL,
  appleLogin,
  cancelOrder,
  createAddress,
  createPayment,
  deleteAccount,
  getAddresses,
  getNotifications,
  getOrders,
  getProduct,
  getProductReviews,
  getProfile,
  getReturns,
  getSession,
  getStorefront,
  googleLogin,
  listAvailableCoupons,
  markNotificationsRead,
  phonePeStatus,
  registerPushToken,
  requestReturn,
  searchProducts,
  signOut,
  updateProfile,
  validateCoupon,
  verifyRazorpay
} from "./src/api";

Notifications.setNotificationHandler?.({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: true })
});

// Keep the Glamia website tokens in one place. The light theme mirrors the
// storefront; the dark theme is an accessibility/display preference, not a
// replacement brand palette.
const LIGHT_COLORS = {
  canvas: "#f1f1f1",
  surface: "#fcfcfc",
  surfaceStrong: "#e1e1e1",
  ink: "#151515",
  muted: "#5f5f5f",
  line: "#c5c5c5",
  accent: "#696969",
  accentSoft: "#e9e9e9",
  gold: "#8f8f8f",
  warning: "#a95e35",
  warningSoft: "#fff0e7",
  contrastSurface: "#151515",
  contrastInk: "#ffffff",
  white: "#ffffff"
};

const DARK_COLORS = {
  canvas: "#111111",
  surface: "#1b1b1b",
  surfaceStrong: "#2a2a2a",
  ink: "#f5f5f5",
  muted: "#b7b7b7",
  line: "#3a3a3a",
  accent: "#d1d1d1",
  accentSoft: "#2c2c2c",
  gold: "#dedede",
  warning: "#ffad82",
  warningSoft: "#3a241c",
  contrastSurface: "#f5f5f5",
  contrastInk: "#151515",
  white: "#ffffff"
};

let COLORS = { ...LIGHT_COLORS };
const ThemeContext = React.createContext({ theme: "light", toggleTheme: () => {} });
const THEME_KEY = "glamia_store_theme";

function useTheme() {
  return React.useContext(ThemeContext);
}

function applyTheme(theme) {
  COLORS = { ...(theme === "dark" ? DARK_COLORS : LIGHT_COLORS) };
  styles = buildStyles();
}

const CART_KEY = "glamia_store_cart";
const SETTINGS_KEY = "glamia_store_notification_settings";
const CANCELLATION_WINDOW_DAYS = 2;

function cartLine(item) {
  return {
    id: String(item?.id || ""),
    size: String(item?.size || ""),
    variant: String(item?.variant || ""),
    quantity: Math.max(1, Math.min(10, Math.floor(Number(item?.quantity) || 1)))
  };
}

function cleanCart(value) {
  return Array.isArray(value)
    ? value.map(cartLine).filter((item) => item.id)
    : [];
}

function money(value) {
  return `₹${Math.max(0, Number(value || 0)).toLocaleString("en-IN")}`;
}

function effectivePrice(product, now = Date.now()) {
  const deal = Number(product?.deal_price);
  const starts = product?.deal_starts_at ? Date.parse(product.deal_starts_at) : 0;
  const ends = product?.deal_ends_at ? Date.parse(product.deal_ends_at) : 0;
  const dealIsActive = Number.isFinite(deal) && deal > 0 && starts <= now && ends > now;
  return dealIsActive ? deal : Number(product?.price || 0);
}

function dateLabel(value) {
  if (!value) return "Recently";
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function dateTimeLabel(value) {
  if (!value) return "Recently";
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function assetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|file:)/i.test(raw)) return raw;
  return `${API_BASE_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function imageFor(product) {
  const value = product?.thumbnail_url || product?.thumbnail || product?.image_url || product?.image || product?.images?.[0];
  return assetUrl(value) || "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=900&q=82";
}

function labelStatus(value) {
  return String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function addressText(address) {
  return [address?.line1, address?.line2, address?.city, address?.state, address?.pin, address?.country || "India"].filter(Boolean).join(", ");
}

function trackingEventsFor(order) {
  const events = order?.shipping?.tracking_events || order?.shipping?.events || order?.shipping?.tracking?.events;
  return Array.isArray(events) ? events : [];
}

function token() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 40);
}

function errorText(error) {
  return error?.message || "Something went wrong. Please try again.";
}

function PrimaryButton({ label, onPress, disabled = false, compact = false }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.primaryButton, compact && styles.compactButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressedButton]}><Text style={styles.primaryButtonText}>{label}</Text></Pressable>;
}

function SecondaryButton({ label, onPress, disabled = false }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.secondaryButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressedSecondary]}><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>;
}

function TextButton({ label, onPress }) {
  return <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}><Text style={styles.textButton}>{label}</Text></Pressable>;
}

function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType = "default", secureTextEntry = false, autoCapitalize = "sentences" }) {
  return <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={[styles.input, multiline && styles.multilineInput]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={COLORS.muted} multiline={multiline} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize} /></View>;
}

function Brand({ compact = false }) {
  return <View style={[styles.brandRow, compact && styles.brandRowCompact]}><View style={styles.brandMark}><Text style={styles.brandMarkText}>G</Text></View><View><Text style={styles.brandWord}>GLAMIA</Text><Text style={styles.brandSub}>STORE</Text></View></View>;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  return <Pressable style={styles.themeToggle} onPress={toggleTheme} accessibilityRole="button" accessibilityLabel={`Switch to ${nextTheme} mode`}><Text style={styles.themeToggleText}>{theme === "dark" ? "☀︎" : "☾"}</Text></Pressable>;
}

function ScreenHeader({ title, eyebrow, onBack, right }) {
  return <View style={styles.screenHeader}>{onBack ? <Pressable onPress={onBack} style={styles.backButton} accessibilityLabel="Go back"><Text style={styles.backButtonText}>‹</Text></Pressable> : <View style={styles.headerSpacer} />}<View style={styles.screenHeaderCopy}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.screenTitle}>{title}</Text></View><View style={styles.headerRight}>{right || null}<ThemeToggle /></View></View>;
}

function ProductCard({ product, onPress, onAdd }) {
  const price = effectivePrice(product);
  const discount = Number(product?.mrp) > price ? Math.round((1 - price / Number(product.mrp)) * 100) : 0;
  const pressScale = useRef(new Animated.Value(1)).current;
  function animatePress(toValue) { Animated.spring(pressScale, { toValue, useNativeDriver: true, speed: 24, bounciness: 4 }).start(); }
  return <Pressable accessibilityRole="button" onPress={() => onPress(product)} onPressIn={() => animatePress(0.985)} onPressOut={() => animatePress(1)}><Animated.View style={[styles.productCard, { transform: [{ scale: pressScale }] }]}><Image source={{ uri: imageFor(product) }} resizeMode="contain" style={styles.productImage} /><View style={styles.productCardBody}><Text style={styles.productBrand} numberOfLines={1}>{product.brand || "Glamia"}</Text><Text style={styles.productName} numberOfLines={2}>{product.name}</Text><View style={styles.productPriceRow}><Text style={styles.productPrice}>{money(price)}</Text>{discount > 0 && <Text style={styles.discountLabel}>{discount}% off</Text>}</View><View style={styles.productMetaRow}><Text style={styles.rating}>{Number(product.rating || 0) > 0 ? `★ ${Number(product.rating).toFixed(1)}` : "New"}</Text><Text style={styles.stockText}>{product.stock > 0 || product.preorder_enabled ? (product.preorder_enabled ? "Pre-order" : "Available") : "Sold out"}</Text></View><Pressable style={styles.addMiniButton} onPress={(event) => { event?.stopPropagation?.(); onAdd(product); }}><Text style={styles.addMiniText}>Add to bag</Text></Pressable></View></Animated.View></Pressable>;
}

function HomeScreen({ hero, products, settings, onProduct, onAdd, onBrowse }) {
  const [slideIndex, setSlideIndex] = useState(0);
  const homeAnimation = useRef(new Animated.Value(0)).current;
  const heroAnimation = useRef(new Animated.Value(0.94)).current;
  const activeSlide = hero[slideIndex] || null;
  useEffect(() => {
    Animated.timing(homeAnimation, { toValue: 1, duration: 650, useNativeDriver: true }).start();
  }, [homeAnimation]);
  useEffect(() => {
    heroAnimation.setValue(0.94);
    Animated.spring(heroAnimation, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
  }, [heroAnimation, slideIndex]);
  useEffect(() => {
    if (hero.length < 2) return undefined;
    const interval = setInterval(() => setSlideIndex((current) => (current + 1) % hero.length), 5500);
    return () => clearInterval(interval);
  }, [hero.length]);
  return <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <Animated.View style={{ opacity: homeAnimation, transform: [{ translateY: homeAnimation.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      <View style={styles.homeTop}><Brand compact /><View style={styles.homeActions}><ThemeToggle /><Pressable style={styles.notificationBell} onPress={onBrowse} accessibilityLabel="Browse products"><Text style={styles.bellText}>⌕</Text></Pressable></View></View>
      {settings?.announcement?.visible && <Pressable style={styles.announcement} onPress={onBrowse}><Text style={styles.announcementText}>{settings.announcement.text}</Text><Text style={styles.announcementArrow}>↗</Text></Pressable>}
      {activeSlide ? <Animated.View style={[styles.heroCard, { transform: [{ scale: heroAnimation }] }]}><Image source={{ uri: imageFor(activeSlide.frames?.[0]) }} resizeMode="cover" style={styles.heroImage} /><View style={styles.heroShade} /><View style={styles.heroCopy}><Text style={styles.heroEyebrow}>{activeSlide.eyebrow || "THE GLAMIA EDIT"}</Text><Text style={styles.heroTitle}>{activeSlide.title}</Text><Text style={styles.heroTagline}>{activeSlide.tagline}</Text><PrimaryButton label={activeSlide.cta_label || "Browse edit"} onPress={onBrowse} compact /></View><View style={styles.heroDots}>{hero.map((slide, index) => <Pressable key={slide.id || index} onPress={() => setSlideIndex(index)} style={[styles.heroDot, index === slideIndex && styles.heroDotActive]} />)}</View></Animated.View> : <Animated.View style={[styles.heroEmpty, { transform: [{ scale: heroAnimation }] }]}><Text style={styles.eyebrow}>GLAMIA STORE</Text><Text style={styles.heroEmptyTitle}>Thoughtful pieces, made to be lived in.</Text><PrimaryButton label="Browse products" onPress={onBrowse} /></Animated.View>}
      <View style={styles.trustRow}><View><Text style={styles.trustTitle}>Fairly considered</Text><Text style={styles.trustCopy}>Quality that earns its price.</Text></View><View><Text style={styles.trustTitle}>India-first</Text><Text style={styles.trustCopy}>Clear delivery and returns.</Text></View></View>
      <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>SHOP THE EDIT</Text><Text style={styles.sectionTitle}>Browse what feels right.</Text></View><TextButton label="See all" onPress={onBrowse} /></View>
      <FlatList data={products.slice(0, 6)} horizontal keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <View style={styles.horizontalCard}><ProductCard product={item} onPress={onProduct} onAdd={onAdd} /></View>} />
      <View style={styles.homeFooter}><Text style={styles.homeFooterTitle}>A better way to choose.</Text><Text style={styles.bodyCopy}>Browse the same live catalog as the website, see the details that matter, and buy with a clear view of quality, price, and after-sales care.</Text></View>
    </Animated.View>
  </ScrollView>;
}

function BrowseScreen({ products, categories, onProduct, onAdd }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [visibleProducts, setVisibleProducts] = useState(products);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setVisibleProducts(category ? products.filter((item) => item.category === category) : products), [category, products]);
  async function search() {
    if (!query.trim()) { setVisibleProducts(category ? products.filter((item) => item.category === category) : products); return; }
    setBusy(true); setError("");
    try { const result = await searchProducts(query.trim(), category ? { category } : {}); setVisibleProducts(result); } catch (requestError) { setError(errorText(requestError)); } finally { setBusy(false); }
  }
  const categoryNames = categories.map((item) => typeof item === "string" ? item : item.name).filter(Boolean);
  return <View style={styles.screen}><View style={styles.browseHeader}><Text style={styles.eyebrow}>THE CATALOG</Text><Text style={styles.screenTitle}>Browse.</Text><View style={styles.searchRow}><TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search products" placeholderTextColor={COLORS.muted} returnKeyType="search" onSubmitEditing={search} /><Pressable style={styles.searchButton} onPress={search}><Text style={styles.searchButtonText}>↗</Text></Pressable></View></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}><Pressable onPress={() => setCategory("")} style={[styles.chip, !category && styles.chipActive]}><Text style={[styles.chipText, !category && styles.chipTextActive]}>All</Text></Pressable>{categoryNames.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}><Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</ScrollView>{error ? <Text style={styles.errorText}>{error}</Text> : null}{busy ? <ActivityIndicator color={COLORS.accent} style={styles.loader} /> : <FlatList data={visibleProducts} keyExtractor={(item) => item.id} numColumns={2} columnWrapperStyle={styles.gridRow} contentContainerStyle={styles.gridContent} renderItem={({ item }) => <ProductCard product={item} onPress={onProduct} onAdd={onAdd} />} ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyTitle}>Nothing matched that search.</Text><Text style={styles.bodyCopy}>Try a broader term or return to all products.</Text></View>} />}</View>;
}

function ProductDetail({ id, onBack, onAdd }) {
  const { width } = useWindowDimensions();
  const imageScrollerRef = useRef(null);
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [size, setSize] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    setBusy(true); setError("");
    Promise.all([getProduct(id), getProductReviews(id).catch(() => ({ reviews: [] }))]).then(([data, reviewData]) => { if (!mounted) return; setProduct(data.product); setReviews(reviewData.reviews || []); setSize(data.product?.sizes?.length === 1 ? data.product.sizes[0] : ""); }).catch((requestError) => mounted && setError(errorText(requestError))).finally(() => mounted && setBusy(false));
    return () => { mounted = false; };
  }, [id]);
  if (busy) return <View style={styles.centerState}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  if (error || !product) return <View style={styles.screen}><ScreenHeader title="Product" onBack={onBack} /><View style={styles.emptyState}><Text style={styles.errorText}>{error || "Product not found"}</Text><SecondaryButton label="Go back" onPress={onBack} /></View></View>;
  const images = product.images?.length ? product.images : [imageFor(product)];
  const soldOut = Number(product.stock || 0) <= 0 && !product.preorder_enabled;
  const sizeRequired = Array.isArray(product.sizes) && product.sizes.length > 0;
  const cannotAdd = soldOut || (sizeRequired && !size);
  function goToImage(nextIndex) {
    const target = Math.max(0, Math.min(images.length - 1, nextIndex));
    setImageIndex(target);
    imageScrollerRef.current?.scrollToOffset({ offset: target * width, animated: true });
  }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}><ScreenHeader title="Product" eyebrow={product.category || "The edit"} onBack={onBack} /><View style={styles.detailGallery}><FlatList ref={imageScrollerRef} data={images} keyExtractor={(image, index) => `${image}-${index}`} horizontal pagingEnabled nestedScrollEnabled directionalLockEnabled snapToInterval={width} decelerationRate="fast" showsHorizontalScrollIndicator={false} style={{ width }} getItemLayout={(_, index) => ({ length: width, offset: width * index, index })} renderItem={({ item }) => <Image source={{ uri: assetUrl(item) }} resizeMode="contain" style={[styles.detailImage, { width }]} />} onMomentumScrollEnd={(event) => setImageIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))} />{images.length > 1 ? <><Pressable style={[styles.galleryArrow, styles.galleryArrowLeft, imageIndex === 0 && styles.galleryArrowDisabled]} onPress={() => goToImage(imageIndex - 1)} disabled={imageIndex === 0} accessibilityLabel="Previous product image"><Text style={styles.galleryArrowText}>‹</Text></Pressable><Pressable style={[styles.galleryArrow, styles.galleryArrowRight, imageIndex === images.length - 1 && styles.galleryArrowDisabled]} onPress={() => goToImage(imageIndex + 1)} disabled={imageIndex === images.length - 1} accessibilityLabel="Next product image"><Text style={styles.galleryArrowText}>›</Text></Pressable></> : null}</View><View style={styles.imageCounter}><Text style={styles.mutedText}>{imageIndex + 1} / {images.length}</Text></View><View style={styles.detailPanel}><Text style={styles.productBrand}>{product.brand || "Glamia"}</Text><Text style={styles.detailTitle}>{product.name}</Text><View style={styles.detailPriceRow}><Text style={styles.detailPrice}>{money(effectivePrice(product))}</Text>{Number(product.mrp) > effectivePrice(product) && <Text style={styles.mrp}>{money(product.mrp)}</Text>}</View><Text style={styles.detailRating}>{Number(product.rating || 0) > 0 ? `★ ${Number(product.rating).toFixed(1)} · ${product.review_count || 0} reviews` : "New to Glamia"}</Text><Text style={styles.detailDescription}>{product.description}</Text>{product.material ? <View style={styles.detailFact}><Text style={styles.factLabel}>MATERIAL</Text><Text style={styles.factValue}>{product.material}</Text></View> : null}{product.sizes?.length ? <View style={styles.sizeSection}><View style={styles.sizeHeading}><Text style={styles.factLabel}>CHOOSE SIZE</Text>{product.size_chart_url ? <TextButton label="Size chart" onPress={() => Linking.openURL(product.size_chart_url)} /> : null}</View><View style={styles.sizeRow}>{product.sizes.map((item) => <Pressable key={item} onPress={() => setSize(item)} style={[styles.sizeButton, size === item && styles.sizeButtonActive]}><Text style={[styles.sizeText, size === item && styles.sizeTextActive]}>{item}</Text></Pressable>)}</View></View> : null}<View style={styles.buyRow}><PrimaryButton label={soldOut ? (product.preorder_enabled ? "Reserve pre-order" : "Sold out") : sizeRequired && !size ? "Choose a size" : "Add to bag"} onPress={() => { if (!cannotAdd) onAdd({ id: product.id, size, variant: "", quantity: 1, product }); }} disabled={cannotAdd} /></View></View>{reviews.length ? <View style={styles.reviewSection}><Text style={styles.sectionTitle}>What customers say.</Text>{reviews.slice(0, 4).map((review) => <View key={review.id} style={styles.reviewCard}><Text style={styles.reviewRating}>★ {review.rating}/5</Text><Text style={styles.reviewComment}>{review.comment}</Text><Text style={styles.reviewBy}>{review.user_name || "Verified customer"}</Text></View>)}</View> : null}</ScrollView>;
}

function BagScreen({ cart, products, onChangeQuantity, onRemove, onCheckout, onBrowse }) {
  const lines = cart.map((item) => ({ item, product: products.find((product) => product.id === item.id) })).filter((line) => line.product);
  const subtotal = lines.reduce((sum, line) => sum + effectivePrice(line.product) * line.item.quantity, 0);
  return <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}><ScreenHeader title="Your bag" eyebrow={`${lines.length} ${lines.length === 1 ? "item" : "items"}`} />{!lines.length ? <View style={styles.emptyState}><Text style={styles.emptyTitle}>Your bag is waiting.</Text><Text style={styles.bodyCopy}>Save something you like from the live catalog and it will appear here.</Text><PrimaryButton label="Browse products" onPress={onBrowse} /></View> : <><View style={styles.bagList}>{lines.map(({ item, product }) => <View style={styles.bagLine} key={`${item.id}-${item.size}`}><Image source={{ uri: imageFor(product) }} resizeMode="contain" style={styles.bagImage} /><View style={styles.bagLineCopy}><Text style={styles.productName}>{product.name}</Text><Text style={styles.mutedText}>{item.size ? `Size ${item.size} · ` : ""}{money(effectivePrice(product))}</Text><View style={styles.quantityRow}><Pressable onPress={() => onChangeQuantity(item, item.quantity - 1)} style={styles.quantityButton}><Text style={styles.quantityText}>−</Text></Pressable><Text style={styles.quantityValue}>{item.quantity}</Text><Pressable onPress={() => onChangeQuantity(item, item.quantity + 1)} style={styles.quantityButton}><Text style={styles.quantityText}>+</Text></Pressable><TextButton label="Remove" onPress={() => onRemove(item)} /></View></View></View>)}</View><View style={styles.summaryCard}><View style={styles.summaryRow}><Text style={styles.mutedText}>Subtotal</Text><Text style={styles.summaryValue}>{money(subtotal)}</Text></View><Text style={styles.paymentNote}>Final payment and delivery details are confirmed securely at checkout.</Text><PrimaryButton label={`Continue to payment · ${money(subtotal)}`} onPress={onCheckout} /></View></>}</ScrollView>;
}

function Timeline({ order }) {
  const statuses = ["pending", "confirmed", "shipped", "delivered"];
  const current = order.status === "cancelled" ? -1 : statuses.indexOf(order.status);
  return <View style={styles.timeline}>{statuses.map((status, index) => <View key={status} style={styles.timelineItem}><View style={[styles.timelineDot, index <= current && styles.timelineDotDone]} /><View><Text style={[styles.timelineStatus, index <= current && styles.timelineStatusDone]}>{labelStatus(status)}</Text>{index === 0 ? <Text style={styles.timelineDate}>{dateLabel(order.created_at)}</Text> : index === current ? <Text style={styles.timelineDate}>{dateLabel(order.updated_at)}</Text> : null}</View></View>)}</View>;
}

function OrderCard({ order, onCancel, onReturn, onBuyAgain, onInvoice }) {
  const canCancel = ["pending", "confirmed"].includes(order.status) && (!order.created_at || Date.now() - Date.parse(String(order.created_at).replace(" ", "T") + "Z") <= CANCELLATION_WINDOW_DAYS * 86400000);
  const canReturn = order.status === "delivered";
  return <View style={styles.orderCard}><View style={styles.orderHeader}><View><Text style={styles.eyebrow}>ORDER</Text><Text style={styles.orderNumber}>{order.order_number}</Text></View><View style={styles.orderBadge}><Text style={styles.orderBadgeText}>{labelStatus(order.status)}</Text></View></View><Text style={styles.orderDate}>{dateTimeLabel(order.created_at)} · {money(order.total)}</Text><Text style={styles.orderItems}>{(order.items || []).map((item) => `${item.name || item.product_name} × ${item.quantity}${item.size ? ` · ${item.size}` : ""}`).join("\n")}</Text><Timeline order={order} />{order.tracking_number ? <View style={styles.trackingBox}><Text style={styles.factLabel}>TRACKING</Text><Text style={styles.trackingNumber}>{order.tracking_number}</Text></View> : null}{trackingEventsFor(order).length ? <View style={styles.trackingEvents}><Text style={styles.factLabel}>SHIPMENT UPDATES</Text>{trackingEventsFor(order).map((event, index) => <View key={`${event.id || event.timestamp || event.created_at || index}`} style={styles.trackingEvent}><View style={styles.trackingEventDot} /><View style={styles.trackingEventCopy}><Text style={styles.trackingEventTitle}>{event.status || event.description || event.message || "Shipment update"}</Text><Text style={styles.mutedText}>{[event.location, dateTimeLabel(event.timestamp || event.created_at || event.time)].filter(Boolean).join(" · ")}</Text></View></View>)}</View> : null}<View style={styles.orderActions}>{onInvoice ? <TextButton label="Invoice" onPress={() => onInvoice(order)} /> : null}{canCancel ? <TextButton label="Cancel" onPress={() => onCancel(order)} /> : null}{canReturn ? <TextButton label="Return / exchange" onPress={() => onReturn(order)} /> : null}<TextButton label="Buy again" onPress={() => onBuyAgain(order)} /></View></View>;
}

function ReturnRequestModal({ order, busy, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (order) setReason(""); }, [order]);
  if (!order) return null;
  return <Modal visible transparent animationType="slide" onRequestClose={busy ? undefined : onClose}><KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.returnModalCard}><Text style={styles.eyebrow}>AFTER-SALES</Text><Text style={styles.sectionTitle}>Return or exchange</Text><Text style={styles.bodyCopy}>Tell us why you need help with order {order.order_number}. Our team will review the request against the website return policy.</Text><TextInput style={styles.returnModalInput} value={reason} onChangeText={setReason} placeholder="Reason for your request" placeholderTextColor={COLORS.muted} multiline textAlignVertical="top" autoCapitalize="sentences" /><SecondaryButton label="Not now" onPress={onClose} disabled={busy} /><PrimaryButton label={busy ? "Sending request…" : "Submit request"} onPress={() => onSubmit(reason)} disabled={busy || !reason.trim()} /></View></KeyboardAvoidingView></Modal>;
}

function OrdersScreen({ onBuyAgain, onOpenInvoice }) {
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [returnOrder, setReturnOrder] = useState(null);
  const [returnBusy, setReturnBusy] = useState(false);
  async function load() { setBusy(true); setError(""); try { const [orderData, returnData] = await Promise.all([getOrders(), getReturns().catch(() => ({ requests: [] }))]); setOrders(orderData.orders || []); setReturns(returnData.requests || []); } catch (requestError) { setError(errorText(requestError)); } finally { setBusy(false); } }
  useEffect(() => { load(); }, []);
  async function cancel(order) { Alert.alert("Cancel this order?", `Cancellation is available within ${CANCELLATION_WINDOW_DAYS} days while the order is still being prepared.`, [{ text: "Keep order", style: "cancel" }, { text: "Cancel order", style: "destructive", onPress: async () => { try { await cancelOrder(order.id); await load(); } catch (requestError) { Alert.alert("Could not cancel", errorText(requestError)); } } }]); }
  async function submitReturn(reason) { if (!returnOrder || !reason.trim()) return; setReturnBusy(true); try { await requestReturn(returnOrder.id, { type: "return_refund", reason: reason.trim(), refund_destination: "store_credit" }); setReturnOrder(null); Alert.alert("Request received", "Our team will review your request and update this order."); await load(); } catch (requestError) { Alert.alert("Could not create request", errorText(requestError)); } finally { setReturnBusy(false); } }
  return <><View style={styles.screen}><ScreenHeader title="Your orders" eyebrow="AFTER PURCHASE" right={<TextButton label="Refresh" onPress={load} />} />{busy ? <ActivityIndicator color={COLORS.accent} style={styles.loader} /> : error ? <View style={styles.emptyState}><Text style={styles.errorText}>{error}</Text><SecondaryButton label="Try again" onPress={load} /></View> : <FlatList data={orders} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} renderItem={({ item }) => <OrderCard order={item} onCancel={cancel} onReturn={setReturnOrder} onBuyAgain={onBuyAgain} onInvoice={onOpenInvoice} />} ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyTitle}>No orders yet.</Text><Text style={styles.bodyCopy}>Your order updates and delivery timeline will live here.</Text></View>} ListFooterComponent={returns.length ? <View style={styles.returnSummary}><Text style={styles.eyebrow}>AFTER-SALES</Text><Text style={styles.sectionTitle}>{returns.length} open request{returns.length === 1 ? "" : "s"}</Text><Text style={styles.bodyCopy}>We’ll keep the status of returns and exchanges connected to your orders.</Text></View> : null} />}</View><ReturnRequestModal order={returnOrder} busy={returnBusy} onClose={() => setReturnOrder(null)} onSubmit={submitReturn} /></>;
}

function ProfileScreen({ initialProfile, onSaved, onCancel }) {
  const [profile, setProfile] = useState(initialProfile || null);
  const [form, setForm] = useState({ first_name: "", middle_name: "", last_name: "", dob: "", gender: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(Boolean(initialProfile));
  useEffect(() => { let mounted = true; getProfile().then((data) => { if (!mounted) return; setProfile(data); setForm({ first_name: data.first_name || "", middle_name: data.middle_name || "", last_name: data.last_name || "", dob: data.dob || "", gender: data.gender || "", phone: data.phone || data.phones?.[0]?.phone_number || "" }); }).catch((requestError) => mounted && setError(errorText(requestError))).finally(() => mounted && setLoaded(true)); return () => { mounted = false; }; }, []);
  function setField(name, value) { setForm((current) => ({ ...current, [name]: value })); }
  async function save() { setBusy(true); setError(""); try { const rawPhone = form.phone.trim(); const data = await updateProfile({ first_name: form.first_name.trim(), middle_name: form.middle_name.trim(), last_name: form.last_name.trim(), dob: form.dob, gender: form.gender, phones: [{ id: "primary", label: "", country_code: "+91", phone_number: rawPhone.replace(/\D/g, ""), is_primary: true }] }); setProfile(data); onSaved(data); } catch (requestError) { setError(errorText(requestError)); } finally { setBusy(false); } }
  if (!loaded) return <View style={styles.centerState}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled"><ScreenHeader title="Your details" eyebrow="PROFILE" onBack={onCancel} /><Text style={styles.profileIntro}>A few details help us deliver the right experience and keep your orders, delivery, and after-sales care connected to you.</Text><View style={styles.formCard}><View style={styles.formRow}><Field label="First name" value={form.first_name} onChangeText={(value) => setField("first_name", value)} placeholder="First name" /><Field label="Last name" value={form.last_name} onChangeText={(value) => setField("last_name", value)} placeholder="Last name" /></View><Field label="Middle name (optional)" value={form.middle_name} onChangeText={(value) => setField("middle_name", value)} placeholder="Middle name" /><Field label="Mobile number" value={form.phone} onChangeText={(value) => setField("phone", value)} placeholder="10-digit mobile number" keyboardType="phone-pad" /><View style={styles.formRow}><Field label="Date of birth" value={form.dob} onChangeText={(value) => setField("dob", value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /><View style={styles.fieldWrap}><Text style={styles.fieldLabel}>Gender / sex</Text><View style={styles.selectWrap}><TextInput style={styles.selectInput} value={form.gender} onChangeText={(value) => setField("gender", value)} placeholder="female / male" placeholderTextColor={COLORS.muted} autoCapitalize="none" /></View></View></View>{error ? <Text style={styles.errorText}>{error}</Text> : null}<PrimaryButton label={busy ? "Saving details…" : "Save and continue"} onPress={save} disabled={busy} /></View>{profile?.dob ? <Text style={styles.formHint}>Birthday changes are limited by the website account policy.</Text> : null}</ScrollView></KeyboardAvoidingView>;
}

function AddressBook({ onClose }) {
  const [addresses, setAddresses] = useState([]);
  const [draft, setDraft] = useState({ name: "", phone: "", line1: "", line2: "", city: "", state: "", pin: "", country: "India", isDefault: false });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  async function load() { setBusy(true); try { const data = await getAddresses(); setAddresses(data.addresses || []); } catch (requestError) { setError(errorText(requestError)); } finally { setBusy(false); } }
  useEffect(() => { load(); }, []);
  async function save() { setBusy(true); setError(""); try { const data = await createAddress(draft); setAddresses(data.addresses || []); setDraft({ name: "", phone: "", line1: "", line2: "", city: "", state: "", pin: "", country: "India", isDefault: false }); } catch (requestError) { setError(errorText(requestError)); } finally { setBusy(false); } }
  function setField(name, value) { setDraft((current) => ({ ...current, [name]: value })); }
  return <View style={styles.screen}><ScreenHeader title="Address book" eyebrow="ACCOUNT" onBack={onClose} />{busy && !addresses.length ? <ActivityIndicator color={COLORS.accent} style={styles.loader} /> : <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">{addresses.map((address) => <View style={styles.addressCard} key={address.id}><View style={styles.addressHeading}><Text style={styles.productName}>{address.name}</Text>{address.isDefault && <Text style={styles.defaultLabel}>DEFAULT</Text>}</View><Text style={styles.mutedText}>{address.phone}</Text><Text style={styles.bodyCopy}>{addressText(address)}</Text></View>)}<View style={styles.formCard}><Text style={styles.sectionTitle}>Add an address.</Text><Field label="Name" value={draft.name} onChangeText={(value) => setField("name", value)} placeholder="Recipient name" /><Field label="Phone" value={draft.phone} onChangeText={(value) => setField("phone", value)} placeholder="Mobile number" keyboardType="phone-pad" /><Field label="Address line" value={draft.line1} onChangeText={(value) => setField("line1", value)} placeholder="House, street, area" /><Field label="Apartment / landmark (optional)" value={draft.line2} onChangeText={(value) => setField("line2", value)} placeholder="Apartment, floor, landmark" /><View style={styles.formRow}><Field label="City" value={draft.city} onChangeText={(value) => setField("city", value)} placeholder="City" /><Field label="State" value={draft.state} onChangeText={(value) => setField("state", value)} placeholder="State" /></View><View style={styles.formRow}><Field label="PIN code" value={draft.pin} onChangeText={(value) => setField("pin", value)} placeholder="PIN" keyboardType="number-pad" /><Field label="Country" value={draft.country} onChangeText={(value) => setField("country", value)} placeholder="India" /></View>{error ? <Text style={styles.errorText}>{error}</Text> : null}<PrimaryButton label={busy ? "Saving…" : "Save address"} onPress={save} disabled={busy} /></View></ScrollView>}</View>;
}

function AccountScreen({ user, onEditProfile, onAddresses, onNotifications, onSignOut, onDeleteAccount, onOpenPolicy }) {
  return <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}><ScreenHeader title="Account" eyebrow="GLAMIA STORE" /><View style={styles.accountHero}><View style={styles.avatar}><Text style={styles.avatarText}>{String(user?.name || user?.email || "G").charAt(0).toUpperCase()}</Text></View><Text style={styles.accountName}>{user?.name || "Glamia member"}</Text><Text style={styles.mutedText}>{user?.email}</Text></View><View style={styles.accountMenu}><Pressable style={styles.menuRow} onPress={onEditProfile}><View><Text style={styles.menuTitle}>Profile details</Text><Text style={styles.menuCopy}>Keep your delivery and account details current.</Text></View><Text style={styles.menuArrow}>›</Text></Pressable><Pressable style={styles.menuRow} onPress={onAddresses}><View><Text style={styles.menuTitle}>Address book</Text><Text style={styles.menuCopy}>Save the places you shop to.</Text></View><Text style={styles.menuArrow}>›</Text></Pressable><Pressable style={styles.menuRow} onPress={onNotifications}><View><Text style={styles.menuTitle}>Notifications</Text><Text style={styles.menuCopy}>Deals, new arrivals, and order updates.</Text></View><Text style={styles.menuArrow}>›</Text></Pressable></View><View style={styles.policyBox}><Text style={styles.eyebrow}>HELP & POLICIES</Text>{[["Terms and conditions", "/terms-and-conditions"], ["Privacy policy", "/privacy-policy"], ["Returns and refunds", "/return-policy"], ["Shipping policy", "/shipping-policy"], ["Contact Glamia", "/contact"]].map(([label, path]) => <TextButton key={path} label={label} onPress={() => onOpenPolicy(path)} />)}</View><SecondaryButton label="Sign out" onPress={onSignOut} /><View style={styles.deleteAccountBox}><Text style={styles.eyebrow}>ACCOUNT DATA</Text><Text style={styles.menuTitle}>Delete your account</Text><Text style={styles.menuCopy}>This removes your profile, saved addresses, notification tokens, and other account data. Completed order records are retained in anonymised form where required.</Text><TextButton label="Delete account" onPress={onDeleteAccount} /></View></ScrollView>;
}

function NotificationScreen({ settings, onClose }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  useEffect(() => { let mounted = true; getNotifications().then((data) => mounted && setItems(data.notifications || [])).catch(() => {}).finally(() => mounted && setBusy(false)); markNotificationsRead().catch(() => {}); return () => { mounted = false; }; }, []);
  return <View style={styles.screen}><ScreenHeader title="Notifications" eyebrow="KEEP IN THE KNOW" onBack={onClose} />{busy ? <ActivityIndicator color={COLORS.accent} style={styles.loader} /> : <FlatList data={items} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} ListHeaderComponent={settings?.announcement?.visible ? <View style={styles.notificationCard}><Text style={styles.eyebrow}>FROM GLAMIA</Text><Text style={styles.menuTitle}>{settings.announcement.text}</Text><Text style={styles.mutedText}>New deals and store updates will appear here.</Text></View> : null} renderItem={({ item }) => <View style={styles.notificationCard}><View style={styles.notificationTop}><Text style={styles.eyebrow}>{labelStatus(item.type || "update")}</Text><Text style={styles.mutedText}>{dateLabel(item.created_at)}</Text></View><Text style={styles.menuTitle}>{item.title}</Text><Text style={styles.bodyCopy}>{item.message}</Text></View>} ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyTitle}>You’re all caught up.</Text><Text style={styles.bodyCopy}>Order updates and new Glamia announcements will appear here.</Text></View>} />}</View>;
}

function PaymentWebView({ order, payment, onResult, onClose }) {
  const html = useMemo(() => {
    const safe = (value) => JSON.stringify(String(value || "")).replace(/</g, "\\u003c");
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{margin:0;background:#f6f4ef;color:#17211d;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}main{max-width:360px}button{border:0;background:#17211d;color:#fff;padding:15px 24px;border-radius:8px;font-size:16px}p{line-height:1.5;color:#6c786f}</style></head><body><main><h2>Secure payment</h2><p>Continue in Razorpay’s secure payment window. Glamia will confirm your order after payment.</p><button id="pay">Open payment</button></main><script src="${payment.checkout_script || "https://checkout.razorpay.com/v1/checkout.js"}"></script><script>const options={key:${safe(payment.key_id)},amount:${Number(payment.amount || 0)},currency:${safe(payment.currency || "INR")},name:"Glamia Store",description:${safe(order.order_number || "Glamia order")},order_id:${safe(payment.order_id)},handler:function(response){window.ReactNativeWebView.postMessage(JSON.stringify({type:"success",payload:response}))},modal:{ondismiss:function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:"dismissed"}))}}};document.getElementById("pay").onclick=function(){try{new Razorpay(options).open()}catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({type:"error",message:error.message}))}};</script></body></html>`;
  }, [order, payment]);
  if (Platform.OS === "web") return <View style={styles.paymentOverlay}><Text style={styles.sectionTitle}>Payment preview is available on Android and iOS builds.</Text><SecondaryButton label="Close" onPress={onClose} /></View>;
  return <View style={styles.paymentOverlay}><View style={styles.paymentHeader}><Text style={styles.sectionTitle}>Secure payment</Text><TextButton label="Close" onPress={onClose} /></View><WebView originWhitelist={["*"]} source={{ html }} onMessage={(event) => { try { onResult(JSON.parse(event.nativeEvent.data)); } catch { onResult({ type: "error", message: "Payment response could not be read" }); } }} /></View>;
}

function CheckoutScreen({ cart, products, settings, onComplete, onBack }) {
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [draft, setDraft] = useState({ name: "", phone: "", line1: "", line2: "", city: "", state: "", pin: "", country: "India" });
  const [liveProducts, setLiveProducts] = useState(products);
  const [coupon, setCoupon] = useState("");
  const [coupons, setCoupons] = useState([]);
  const [couponApplied, setCouponApplied] = useState(null);
  const [couponBusy, setCouponBusy] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("razorpay");
  const [gateway, setGateway] = useState(null);
  const [pendingPhonePe, setPendingPhonePe] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const methods = settings?.payments?.methods?.length ? settings.payments.methods : [{ id: "razorpay", label: "Razorpay" }, { id: "phonepe", label: "PhonePe" }];
  const lines = cart.map((item) => ({ item, product: liveProducts.find((product) => product.id === item.id) })).filter((line) => line.product);
  const subtotal = lines.reduce((sum, line) => sum + effectivePrice(line.product) * line.item.quantity, 0);
  const estimatedTotal = Math.max(0, subtotal - Number(couponApplied?.discount || 0));
  useEffect(() => { getAddresses().then((data) => { const saved = data.addresses || []; setAddresses(saved); const primary = saved.find((item) => item.isDefault) || saved[0]; if (primary) { setSelectedAddress(primary.id); setDraft(primary); } }).catch(() => {}).finally(() => setBusy(false)); }, []);
  useEffect(() => {
    let mounted = true;
    const ids = [...new Set(cart.map((item) => item.id).filter(Boolean))];
    Promise.all(ids.map((id) => getProduct(id).then((data) => data.product).catch(() => null))).then((freshProducts) => {
      if (!mounted) return;
      const freshById = new Map(freshProducts.filter(Boolean).map((product) => [product.id, product]));
      setLiveProducts(products.map((product) => freshById.get(product.id) || product));
    });
    return () => { mounted = false; };
  }, [cart, products]);
  useEffect(() => {
    let mounted = true;
    setCouponBusy(true);
    listAvailableCoupons(cart.map(({ id, quantity, size = "", variant = "" }) => ({ id, quantity, size, variant })))
      .then((data) => mounted && setCoupons(data.coupons || []))
      .catch(() => mounted && setCoupons([]))
      .finally(() => mounted && setCouponBusy(false));
    return () => { mounted = false; };
  }, [cart]);
  function setField(name, value) { setSelectedAddress(null); setDraft((current) => ({ ...current, [name]: value })); }
  function chooseAddress(address) { setSelectedAddress(address.id); setDraft(address); }
  async function applyCoupon(value = coupon) { const code = String(value || "").trim().toUpperCase(); if (!code) { setCouponApplied(null); setMessage("Add a coupon code first."); return; } setCoupon(code); setBusy(true); setError(""); setMessage(""); try { const result = await validateCoupon(code, cart.map(({ id, quantity, size = "", variant = "" }) => ({ id, quantity, size, variant }))); setCouponApplied(result); setMessage(`${code} applied. You save ${money(result.discount)}.`); } catch (requestError) { setCouponApplied(null); setMessage(errorText(requestError)); } finally { setBusy(false); } }
  async function pay() { setBusy(true); setError(""); setMessage(""); try { const payload = { items: cart.map(({ id, quantity, size = "", variant = "" }) => ({ id, quantity, size, variant })), address: draft, coupon: coupon.trim().toUpperCase(), payment_method: paymentMethod, checkout_token: token() }; const data = await createPayment(payload); if (paymentMethod === "phonepe") { setPendingPhonePe({ order: data.order, payment: data.payment }); if (data.payment?.checkout_url) await Linking.openURL(data.payment.checkout_url); setMessage("PhonePe opened securely. Return here and tap Check payment status when you finish."); } else setGateway({ order: data.order, payment: data.payment }); } catch (requestError) { setError(errorText(requestError)); } finally { setBusy(false); } }
  async function checkPhonePe() { if (!pendingPhonePe) return; setBusy(true); setError(""); try { const data = await phonePeStatus(pendingPhonePe.order.id, pendingPhonePe.order.checkout_token); if (data.payment_status === "paid") onComplete(data.order); else setMessage("Payment is still pending. If you completed it, wait a moment and check again."); } catch (requestError) { setError(errorText(requestError)); } finally { setBusy(false); } }
  async function razorpayResult(result) { if (result.type === "dismissed") { setGateway(null); return; } if (result.type !== "success") { setError(result.message || "Payment could not be started"); setGateway(null); return; } setBusy(true); setError(""); try { const data = await verifyRazorpay({ order_id: gateway.order.id, checkout_token: gateway.order.checkout_token, razorpay_payment_id: result.payload.razorpay_payment_id, razorpay_order_id: result.payload.razorpay_order_id, razorpay_signature: result.payload.razorpay_signature }); if (data.order) onComplete(data.order); } catch (requestError) { setError(errorText(requestError)); } finally { setBusy(false); setGateway(null); } }
  return <View style={styles.screen}><ScreenHeader title="Checkout" eyebrow="SECURE PAYMENT" onBack={onBack} />{busy && !addresses.length ? <ActivityIndicator color={COLORS.accent} style={styles.loader} /> : <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled"><View style={styles.checkoutSection}><Text style={styles.sectionTitle}>Where should we deliver?</Text>{addresses.map((address) => <Pressable key={address.id} onPress={() => chooseAddress(address)} style={[styles.addressCard, selectedAddress === address.id && styles.addressSelected]}><Text style={styles.productName}>{address.name} {address.isDefault ? "· Default" : ""}</Text><Text style={styles.bodyCopy}>{addressText(address)}</Text></Pressable>)}<View style={styles.formCard}><Field label="Full name" value={draft.name} onChangeText={(value) => setField("name", value)} placeholder="Full name" /><Field label="Phone" value={draft.phone} onChangeText={(value) => setField("phone", value)} placeholder="Mobile number" keyboardType="phone-pad" /><Field label="Address line" value={draft.line1} onChangeText={(value) => setField("line1", value)} placeholder="House, street, area" /><Field label="Apartment / landmark" value={draft.line2} onChangeText={(value) => setField("line2", value)} placeholder="Optional" /><View style={styles.formRow}><Field label="City" value={draft.city} onChangeText={(value) => setField("city", value)} placeholder="City" /><Field label="State" value={draft.state} onChangeText={(value) => setField("state", value)} placeholder="State" /></View><View style={styles.formRow}><Field label="PIN" value={draft.pin} onChangeText={(value) => setField("pin", value)} placeholder="PIN" keyboardType="number-pad" /><Field label="Country" value={draft.country} onChangeText={(value) => setField("country", value)} placeholder="India" /></View></View></View><View style={styles.checkoutSection}><Text style={styles.sectionTitle}>Payment method.</Text>{methods.map((method) => <Pressable key={method.id} onPress={() => setPaymentMethod(method.id)} style={[styles.paymentMethod, paymentMethod === method.id && styles.paymentMethodActive]}><View style={styles.radioOuter}>{paymentMethod === method.id && <View style={styles.radioInner} />}</View><View><Text style={styles.menuTitle}>{method.label || labelStatus(method.id)}</Text><Text style={styles.mutedText}>Secure checkout in INR</Text></View></Pressable>)}</View><View style={styles.checkoutSection}><View style={styles.couponHeading}><Text style={styles.sectionTitle}>Available coupons.</Text>{couponBusy ? <Text style={styles.mutedText}>Checking…</Text> : null}</View>{coupons.length ? <View style={styles.couponList}>{coupons.map((item) => <Pressable key={item.code} style={[styles.couponCard, coupon === item.code && styles.couponCardActive]} onPress={() => applyCoupon(item.code)}><View><Text style={styles.couponCode}>{item.code}</Text><Text style={styles.mutedText}>{item.type === "percent" ? `${item.value}% off` : `${money(item.value)} off`}{item.min_cart_value ? ` · Min ${money(item.min_cart_value)}` : ""}</Text></View><Text style={styles.couponUse}>{coupon === item.code ? "Selected" : "Use"}</Text></Pressable>)}</View> : !couponBusy ? <Text style={styles.mutedText}>No coupons are available for these items right now.</Text> : null}<View style={styles.couponRow}><TextInput style={styles.couponInput} value={coupon} onChangeText={(value) => { setCoupon(value); setCouponApplied(null); }} placeholder="Enter code" placeholderTextColor={COLORS.muted} autoCapitalize="characters" /><TextButton label="Apply" onPress={() => applyCoupon()} /></View></View><View style={styles.summaryCard}><View style={styles.summaryRow}><Text style={styles.mutedText}>Items</Text><Text style={styles.summaryValue}>{money(subtotal)}</Text></View>{couponApplied ? <><View style={styles.summaryRow}><Text style={styles.mutedText}>Discount</Text><Text style={styles.summaryValue}>−{money(couponApplied.discount)}</Text></View><View style={styles.summaryRow}><Text style={styles.menuTitle}>Estimated total</Text><Text style={styles.summaryValue}>{money(estimatedTotal)}</Text></View></> : null}<Text style={styles.paymentNote}>Prices and coupon eligibility are checked again by Glamia’s server before payment. Glamia does not store your card details.</Text>{error ? <Text style={styles.errorText}>{error}</Text> : null}{message ? <Text style={styles.inlineNote}>{message}</Text> : null}<PrimaryButton label={busy ? "Opening secure payment…" : `Pay securely · ${money(estimatedTotal)}`} onPress={pay} disabled={busy || !lines.length} />{pendingPhonePe ? <SecondaryButton label="Check PhonePe payment status" onPress={checkPhonePe} disabled={busy} /> : null}</View></ScrollView>}{gateway ? <Modal visible transparent animationType="slide" onRequestClose={() => setGateway(null)}><PaymentWebView order={gateway.order} payment={gateway.payment} onResult={razorpayResult} onClose={() => setGateway(null)} /></Modal> : null}</View>;
}

function BottomNav({ active, onChange, bagCount }) {
  const tabs = [["home", "Home", "⌂"], ["browse", "Browse", "⌕"], ["bag", "Bag", "□"], ["orders", "Orders", "≡"], ["account", "Account", ""]];
  return <View style={styles.bottomNav}>{tabs.map(([key, label, icon]) => <Pressable key={key} onPress={() => onChange(key)} style={[styles.navItem, active === key && styles.navItemActive]}>{key === "account" ? <View style={styles.accountNavIcon}><View style={[styles.accountHead, active === key && styles.accountIconActive]} /><View style={[styles.accountBody, active === key && styles.accountIconActive]} /></View> : <View><Text style={[styles.navIcon, active === key && styles.navIconActive]}>{icon}</Text>{key === "bag" && bagCount > 0 ? <View style={styles.bagBadge}><Text style={styles.bagBadgeText}>{bagCount}</Text></View> : null}</View>}<Text style={[styles.navLabel, active === key && styles.navLabelActive]}>{label}</Text></Pressable>)}</View>;
}

function AppShell({ user, needsProfile, onProfileComplete, onSignedOut }) {
  const [tab, setTab] = useState("home");
  const [storefront, setStorefront] = useState({ hero: [], products: [], categories: [], settings: null });
  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [checkout, setCheckout] = useState(false);
  const [profileEdit, setProfileEdit] = useState(false);
  const [addresses, setAddresses] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { AsyncStorage.getItem(CART_KEY).then((value) => { try { setCart(cleanCart(value ? JSON.parse(value) : [])); } catch { setCart([]); } }).catch(() => {}); getStorefront().then(setStorefront).catch((requestError) => setError(errorText(requestError))).finally(() => setLoading(false)); registerForPush().catch(() => {}); }, []);
  useEffect(() => { AsyncStorage.setItem(CART_KEY, JSON.stringify(cleanCart(cart))).catch(() => {}); }, [cart]);
  async function registerForPush() { if (Platform.OS === "web") return; const permission = await Notifications.getPermissionsAsync(); const finalPermission = permission.status === "granted" ? permission : await Notifications.requestPermissionsAsync(); if (finalPermission.status !== "granted") return; const projectId = String(process.env.EXPO_PUBLIC_EXPO_PROJECT_ID || "").trim() || undefined; const pushToken = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined); if (pushToken?.data) await registerPushToken(pushToken.data, Platform.OS); }
  function addToBag(next) { setCart((current) => { const safeNext = cartLine(next); const key = `${safeNext.id}-${safeNext.size}-${safeNext.variant}`; const existing = current.find((item) => `${item.id}-${item.size || ""}-${item.variant || ""}` === key); if (existing) return current.map((item) => item === existing ? { ...item, quantity: Math.min(10, item.quantity + safeNext.quantity) } : item); return [...current, safeNext]; }); setSelectedProduct(null); setTab("bag"); }
  function changeQuantity(item, quantity) { if (quantity < 1) return removeItem(item); setCart((current) => current.map((line) => line.id === item.id && line.size === item.size && line.variant === item.variant ? { ...line, quantity: Math.min(10, quantity) } : line)); }
  function removeItem(item) { setCart((current) => current.filter((line) => !(line.id === item.id && line.size === item.size && line.variant === item.variant))); }
  function buyAgain(order) { const available = (order.items || []).filter((item) => storefront.products.some((product) => product.id === item.id && (product.stock > 0 || product.preorder_enabled))).map((item) => ({ id: item.id, size: item.size || "", variant: item.variant || "", quantity: item.quantity || 1 })); setCart((current) => [...current, ...available]); setTab("bag"); if (!available.length) Alert.alert("Products unavailable", "The items from this order are not currently available to buy again."); }
  function openInvoice(order) { const url = `${API_BASE_URL}/api/orders/${encodeURIComponent(order.id)}/invoice?token=${encodeURIComponent(order.tracking_token || "")}`; Linking.openURL(url); }
  if (needsProfile || profileEdit) return <ProfileScreen onSaved={(data) => { setProfileEdit(false); onProfileComplete(data); }} onCancel={needsProfile ? undefined : () => setProfileEdit(false)} />;
  if (addresses) return <AddressBook onClose={() => setAddresses(false)} />;
  if (notifications) return <NotificationScreen settings={storefront.settings} onClose={() => setNotifications(false)} />;
  if (selectedProduct) return <ProductDetail id={selectedProduct} onBack={() => setSelectedProduct(null)} onAdd={addToBag} />;
  if (checkout) return <CheckoutScreen cart={cart} products={storefront.products} settings={storefront.settings} onBack={() => setCheckout(false)} onComplete={(order) => { setCart([]); setCheckout(false); setTab("orders"); Alert.alert("Order confirmed", `${order.order_number} is now in Your orders.`); }} />;
  if (loading) return <View style={styles.centerState}><ActivityIndicator color={COLORS.accent} size="large" /><Text style={styles.loadingText}>Opening Glamia Store…</Text></View>;
  return <View style={styles.appRoot}>{error ? <Pressable style={styles.errorBanner} onPress={() => setError("")}><Text style={styles.errorText}>{error}</Text><TextButton label="Dismiss" onPress={() => setError("")} /></Pressable> : null}{tab === "home" && <HomeScreen hero={storefront.hero} products={storefront.products} settings={storefront.settings} onProduct={(product) => setSelectedProduct(product.id)} onAdd={(product) => addToBag({ id: product.id, size: product.sizes?.length === 1 ? product.sizes[0] : "", quantity: 1 })} onBrowse={() => setTab("browse")} />}{tab === "browse" && <BrowseScreen products={storefront.products} categories={storefront.categories} onProduct={(product) => setSelectedProduct(product.id)} onAdd={(product) => addToBag({ id: product.id, size: product.sizes?.length === 1 ? product.sizes[0] : "", quantity: 1 })} />}{tab === "bag" && <BagScreen cart={cart} products={storefront.products} onChangeQuantity={changeQuantity} onRemove={removeItem} onCheckout={() => setCheckout(true)} onBrowse={() => setTab("browse")} />}{tab === "orders" && <OrdersScreen onBuyAgain={buyAgain} onOpenInvoice={openInvoice} />}{tab === "account" && <AccountScreen user={user} onEditProfile={() => setProfileEdit(true)} onAddresses={() => setAddresses(true)} onNotifications={() => setNotifications(true)} onSignOut={() => Alert.alert("Sign out?", "You can sign in again with Google whenever you return.", [{ text: "Stay", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: async () => { await onSignedOut(); } }])} onDeleteAccount={() => Alert.alert("Delete your Glamia account?", "This cannot be undone. Completed order records may be retained in anonymised form where required.", [{ text: "Keep account", style: "cancel" }, { text: "Delete account", style: "destructive", onPress: async () => { try { await deleteAccount(); await onSignedOut(); } catch (requestError) { Alert.alert("Could not delete account", errorText(requestError)); } } }])} onOpenPolicy={(path) => Linking.openURL(`${API_BASE_URL}${path}`)} />}}<BottomNav active={tab} onChange={(next) => { setSelectedProduct(null); setCheckout(false); setTab(next); }} bagCount={cart.reduce((sum, item) => sum + item.quantity, 0)} /></View>;
}

function AuthScreen({ onSignedIn }) {
  const { theme } = useTheme();
  const googleWebClientId = String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "").trim();
  const googleAndroidClientId = String(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "").trim();
  const googleIosClientId = String(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "").trim();
  const googleConfigured = Platform.OS === "android"
    ? Boolean(googleWebClientId && googleAndroidClientId)
    : Platform.OS === "ios"
      ? Boolean(googleWebClientId && googleIosClientId)
      : false;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => { if (Platform.OS !== "ios") return undefined; AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false)); return undefined; }, []);
  useEffect(() => {
    if (!googleConfigured) return;
    GoogleOneTapSignIn.configure({
      webClientId: googleWebClientId,
      iosClientId: Platform.OS === "ios" ? googleIosClientId : undefined,
      autoSelectOnSignIn: false
    });
  }, [googleAndroidClientId, googleConfigured, googleIosClientId, googleWebClientId]);
  async function signIn() {
    if (!googleConfigured) { setError("Google sign-in is not configured for this build yet."); return; }
    setBusy(true); setError("");
    try {
      GoogleOneTapSignIn.configure({
        webClientId: googleWebClientId,
        iosClientId: Platform.OS === "ios" ? googleIosClientId : undefined,
        autoSelectOnSignIn: false
      });
      await GoogleOneTapSignIn.checkPlayServices(true);
      let result = await GoogleOneTapSignIn.signIn();
      if (isNoSavedCredentialFoundResponse(result)) result = await GoogleOneTapSignIn.createAccount();
      if (isNoSavedCredentialFoundResponse(result)) result = await GoogleOneTapSignIn.presentExplicitSignIn();
      if (isCancelledResponse(result)) return;
      if (!isSuccessResponse(result) || !result.data.idToken) throw new Error("Google did not return a secure sign-in token.");
      onSignedIn(await googleLogin(result.data.idToken));
    } catch (requestError) {
      if (isErrorWithCode(requestError) && requestError.code === statusCodes.SIGN_IN_CANCELLED) return;
      const diagnostic = isErrorWithCode(requestError) ? ` (${requestError.code})` : "";
      setError(`${errorText(requestError)}${diagnostic}`);
    } finally { setBusy(false); }
  }
  async function signInWithApple() { setBusy(true); setError(""); try { const credential = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] }); if (!credential.identityToken) throw new Error("Apple did not return a secure identity token."); const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" "); onSignedIn(await appleLogin(credential.identityToken, credential.email || "", name)); } catch (requestError) { if (requestError?.code !== "ERR_REQUEST_CANCELED") setError(errorText(requestError)); } finally { setBusy(false); } }
  return <SafeAreaView style={styles.authSafe}><StatusBar style={theme === "dark" ? "light" : "dark"} /><ScrollView contentContainerStyle={styles.authContent}><View style={styles.authTopRow}><Brand /><ThemeToggle /></View><Text style={styles.authEyebrow}>WELCOME TO GLAMIA STORE</Text><Text style={styles.authTitle}>Choose well. Wear often.</Text><View style={styles.authCard}><Text style={styles.authCardTitle}>Sign in to begin.</Text><Text style={styles.authCardCopy}>Your account keeps your profile, orders, returns, and notifications together.</Text>{error ? <Text style={styles.errorText}>{error}</Text> : null}{!googleConfigured ? <Text style={styles.authConfigNote}>Google sign-in will be enabled when this preview is configured.</Text> : null}<PrimaryButton label={busy ? "Signing in…" : "Continue with Google"} onPress={signIn} disabled={!googleConfigured || busy} />{appleAvailable ? <Pressable style={styles.appleButton} onPress={signInWithApple} disabled={busy}><Text style={styles.appleButtonText}>{busy ? "Signing in…" : "  Continue with Apple"}</Text></Pressable> : null}<Text style={styles.authLegal}>By continuing, you agree to Glamia’s website terms and privacy policy.</Text></View></ScrollView></SafeAreaView>;
}

export default function App() {
  const [theme, setTheme] = useState("light");
  const [state, setState] = useState({ loading: true, user: null, needsProfile: false });
  const onSignedIn = React.useCallback((data) => setState({ loading: false, user: data.user, needsProfile: Boolean(data.needs_profile_completion) }), []);
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      const next = saved === "dark" ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    }).catch(() => {});
  }, []);
  const toggleTheme = React.useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
      return next;
    });
  }, []);
  const themeValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  useEffect(() => { let mounted = true; getSession().then((data) => mounted && setState({ loading: false, user: data.user, needsProfile: Boolean(data.needs_profile_completion) })).catch(() => mounted && setState({ loading: false, user: null, needsProfile: false })); return () => { mounted = false; }; }, []);
  let content;
  if (state.loading) content = <View style={styles.centerState}><StatusBar style={theme === "dark" ? "light" : "dark"} /><ActivityIndicator color={COLORS.accent} size="large" /><Text style={styles.loadingText}>Preparing your store…</Text></View>;
  else if (!state.user) content = <AuthScreen onSignedIn={onSignedIn} />;
  else content = <AppShell user={state.user} needsProfile={state.needsProfile} onProfileComplete={() => setState((current) => ({ ...current, needsProfile: false }))} onSignedOut={async () => { await signOut(); if (Platform.OS !== "web") await GoogleOneTapSignIn.signOut().catch(() => {}); setState({ loading: false, user: null, needsProfile: false }); }} />;
  return <ThemeContext.Provider value={themeValue}>{content}</ThemeContext.Provider>;
}

function buildStyles() { return StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: COLORS.canvas },
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  scrollContent: { padding: 20, paddingBottom: 36 },
  listContent: { padding: 20, paddingBottom: 40 },
  centerState: { flex: 1, backgroundColor: COLORS.canvas, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { color: COLORS.muted, marginTop: 14, fontSize: 14 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandRowCompact: { marginBottom: 0 },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#151515", alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#ffffff", fontSize: 22, fontWeight: "700", letterSpacing: 1 },
  brandWord: { color: COLORS.ink, fontSize: 21, letterSpacing: 5, fontWeight: "700" },
  brandSub: { color: COLORS.accent, fontSize: 9, letterSpacing: 3, fontWeight: "800", marginTop: 2 },
  homeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  homeActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  themeToggle: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  themeToggleText: { color: COLORS.ink, fontSize: 20, lineHeight: 22 },
  notificationBell: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  bellText: { color: COLORS.ink, fontSize: 26, lineHeight: 28 },
  eyebrow: { color: COLORS.accent, fontSize: 10, letterSpacing: 1.8, fontWeight: "800" },
  screenHeader: { minHeight: 76, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.line, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.canvas },
  screenHeaderCopy: { flex: 1, alignItems: "center" },
  screenTitle: { color: COLORS.ink, fontSize: 28, fontWeight: "700", letterSpacing: -0.6, marginTop: 3 },
  headerRight: { minWidth: 48, alignItems: "center", justifyContent: "flex-end", flexDirection: "row", gap: 8 },
  headerSpacer: { width: 48 },
  backButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center" },
  backButtonText: { color: COLORS.ink, fontSize: 31, lineHeight: 32, fontWeight: "300", marginTop: -3 },
  heroCard: { height: 430, borderRadius: 24, overflow: "hidden", backgroundColor: COLORS.contrastSurface, position: "relative" },
  heroImage: { width: "100%", height: "100%", position: "absolute" },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(16,31,23,.56)" },
  heroCopy: { position: "absolute", left: 24, right: 24, bottom: 28 },
  heroEyebrow: { color: COLORS.white, fontSize: 10, letterSpacing: 2.2, fontWeight: "800", marginBottom: 12 },
  heroTitle: { color: COLORS.white, fontSize: 37, lineHeight: 41, fontWeight: "700", letterSpacing: -1 },
  heroTagline: { color: "#edf3ee", fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom: 20 },
  heroDots: { position: "absolute", top: 20, right: 20, flexDirection: "row", gap: 6 },
  heroDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: "rgba(255,255,255,.5)" },
  heroDotActive: { width: 22, backgroundColor: COLORS.white },
  heroEmpty: { padding: 25, minHeight: 260, borderRadius: 24, backgroundColor: COLORS.surfaceStrong, justifyContent: "center" },
  heroEmptyTitle: { color: COLORS.ink, fontSize: 35, lineHeight: 40, fontWeight: "700", marginVertical: 16 },
  announcement: { padding: 14, borderRadius: 12, backgroundColor: COLORS.contrastSurface, flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  announcementText: { color: COLORS.contrastInk, fontSize: 13, lineHeight: 18, flex: 1 },
  announcementArrow: { color: COLORS.contrastInk, fontSize: 20, marginLeft: 12 },
  trustRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 22, marginBottom: 26 },
  trustTitle: { color: COLORS.ink, fontSize: 13, fontWeight: "800" },
  trustCopy: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 },
  sectionTitle: { color: COLORS.ink, fontSize: 23, lineHeight: 28, fontWeight: "700", marginTop: 4 },
  horizontalCard: { width: 220, marginRight: 12 },
  homeFooter: { paddingTop: 34, marginTop: 28, borderTopWidth: 1, borderTopColor: COLORS.line },
  homeFooterTitle: { color: COLORS.ink, fontSize: 27, fontWeight: "700", marginBottom: 8 },
  bodyCopy: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  productCard: { backgroundColor: COLORS.surface, borderRadius: 15, overflow: "hidden", borderWidth: 1, borderColor: COLORS.line, marginBottom: 14 },
  cardPressed: { opacity: 0.82 },
  productImage: { width: "100%", height: 210, backgroundColor: COLORS.surfaceStrong },
  productCardBody: { padding: 12 },
  productBrand: { color: COLORS.accent, fontSize: 10, letterSpacing: 1.2, fontWeight: "800", textTransform: "uppercase" },
  productName: { color: COLORS.ink, fontSize: 15, lineHeight: 20, fontWeight: "700", marginTop: 5 },
  productPriceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  productPrice: { color: COLORS.ink, fontSize: 16, fontWeight: "800" },
  discountLabel: { color: COLORS.warning, fontSize: 11, fontWeight: "800" },
  productMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  rating: { color: COLORS.gold, fontSize: 11, fontWeight: "800" },
  stockText: { color: COLORS.muted, fontSize: 11 },
  addMiniButton: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 10 },
  addMiniText: { color: COLORS.accent, fontSize: 12, fontWeight: "800" },
  browseHeader: { padding: 20, paddingBottom: 10 },
  searchRow: { flexDirection: "row", marginTop: 15, gap: 8 },
  searchInput: { flex: 1, height: 50, borderRadius: 11, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, paddingHorizontal: 14, color: COLORS.ink, fontSize: 15 },
  searchButton: { width: 50, borderRadius: 11, backgroundColor: COLORS.contrastSurface, alignItems: "center", justifyContent: "center" },
  searchButtonText: { color: COLORS.contrastInk, fontSize: 22 },
  chipRow: { paddingHorizontal: 20, paddingVertical: 7, gap: 8 },
  chip: { borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: COLORS.surface },
  chipActive: { backgroundColor: COLORS.contrastSurface, borderColor: COLORS.contrastSurface },
  chipText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: COLORS.contrastInk },
  gridContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 42 },
  gridRow: { gap: 12 },
  loader: { marginTop: 45 },
  errorText: { color: COLORS.warning, fontSize: 13, lineHeight: 19, marginVertical: 8 },
  emptyState: { alignItems: "center", justifyContent: "center", padding: 35, gap: 12 },
  emptyTitle: { color: COLORS.ink, fontSize: 20, fontWeight: "800", textAlign: "center" },
  detailContent: { paddingBottom: 40 },
  detailGallery: { position: "relative", backgroundColor: COLORS.surfaceStrong },
  galleryArrow: { position: "absolute", top: "50%", marginTop: -21, width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center" },
  galleryArrowLeft: { left: 14 },
  galleryArrowRight: { right: 14 },
  galleryArrowDisabled: { opacity: 0.35 },
  galleryArrowText: { color: COLORS.ink, fontSize: 30, lineHeight: 31, fontWeight: "300" },
  detailImageWrap: { width: 360, height: 430, flexDirection: "row" },
  detailImage: { width: 360, height: 430, backgroundColor: COLORS.surfaceStrong },
  imageCounter: { alignItems: "center", marginVertical: 9 },
  mutedText: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  detailPanel: { paddingHorizontal: 20 },
  detailTitle: { color: COLORS.ink, fontSize: 31, lineHeight: 36, fontWeight: "700", marginTop: 5 },
  detailPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 14 },
  detailPrice: { color: COLORS.ink, fontSize: 23, fontWeight: "800" },
  mrp: { color: COLORS.muted, fontSize: 15, textDecorationLine: "line-through" },
  detailRating: { color: COLORS.gold, fontSize: 13, fontWeight: "800", marginTop: 7 },
  detailDescription: { color: COLORS.muted, fontSize: 15, lineHeight: 23, marginTop: 18 },
  detailFact: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.line, paddingVertical: 15, marginTop: 22 },
  factLabel: { color: COLORS.accent, fontSize: 10, letterSpacing: 1.4, fontWeight: "800" },
  factValue: { color: COLORS.ink, fontSize: 14, fontWeight: "700", marginTop: 5 },
  sizeSection: { marginTop: 22 },
  sizeHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sizeRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 11 },
  sizeButton: { minWidth: 48, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", backgroundColor: COLORS.surface },
  sizeButtonActive: { backgroundColor: COLORS.contrastSurface, borderColor: COLORS.contrastSurface },
  sizeText: { color: COLORS.ink, fontWeight: "800", fontSize: 13 },
  sizeTextActive: { color: COLORS.contrastInk },
  buyRow: { marginTop: 24 },
  reviewSection: { padding: 20, marginTop: 18, borderTopWidth: 1, borderTopColor: COLORS.line },
  reviewCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, padding: 14, marginTop: 10 },
  reviewRating: { color: COLORS.gold, fontWeight: "800", fontSize: 12 },
  reviewComment: { color: COLORS.ink, fontSize: 14, lineHeight: 21, marginTop: 6 },
  reviewBy: { color: COLORS.muted, fontSize: 11, marginTop: 9 },
  bagList: { padding: 20, paddingBottom: 5 },
  bagLine: { flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  bagImage: { width: 86, height: 105, borderRadius: 10, backgroundColor: COLORS.surfaceStrong },
  bagLineCopy: { flex: 1, paddingLeft: 12 },
  quantityRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 14 },
  quantityButton: { width: 29, height: 29, borderRadius: 7, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center" },
  quantityText: { color: COLORS.ink, fontSize: 18 },
  quantityValue: { color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  summaryCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, margin: 20, padding: 17 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 13 },
  summaryValue: { color: COLORS.ink, fontSize: 20, fontWeight: "800" },
  paymentNote: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  primaryButton: { minHeight: 50, borderRadius: 10, backgroundColor: COLORS.contrastSurface, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 7 },
  compactButton: { alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 16 },
  primaryButtonText: { color: COLORS.contrastInk, fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  disabledButton: { opacity: 0.45 },
  pressedButton: { opacity: 0.8 },
  secondaryButton: { minHeight: 50, borderRadius: 10, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 10 },
  secondaryButtonText: { color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  pressedSecondary: { backgroundColor: COLORS.surfaceStrong },
  textButton: { color: COLORS.accent, fontSize: 12, fontWeight: "800", marginTop: 5 },
  bottomNav: { flexDirection: "row", alignItems: "stretch", borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.surface, paddingTop: 7, paddingBottom: Platform.OS === "ios" ? 18 : 8 },
  navItem: { flex: 1, minHeight: 53, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  navItemActive: { backgroundColor: COLORS.accentSoft, borderRadius: 12, marginHorizontal: 3 },
  navIcon: { color: COLORS.muted, fontSize: 20, lineHeight: 22, textAlign: "center" },
  navIconActive: { color: COLORS.ink },
  accountNavIcon: { width: 22, height: 22, alignItems: "center", justifyContent: "flex-start" },
  accountHead: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.muted, marginTop: 1 },
  accountBody: { width: 17, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 1.5, borderBottomWidth: 0, borderColor: COLORS.muted, marginTop: 3 },
  accountIconActive: { borderColor: COLORS.ink },
  navLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "700", marginTop: 3, textAlign: "center" },
  navLabelActive: { color: COLORS.ink },
  bagBadge: { position: "absolute", top: -3, right: -10, minWidth: 17, height: 17, paddingHorizontal: 3, borderRadius: 9, backgroundColor: COLORS.contrastSurface, alignItems: "center", justifyContent: "center" },
  bagBadgeText: { color: COLORS.contrastInk, fontSize: 9, fontWeight: "800" },
  orderCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, padding: 16, marginBottom: 14 },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  orderNumber: { color: COLORS.ink, fontSize: 17, fontWeight: "800", marginTop: 3 },
  orderBadge: { borderRadius: 20, backgroundColor: COLORS.accentSoft, paddingHorizontal: 10, paddingVertical: 6 },
  orderBadgeText: { color: COLORS.accent, fontSize: 10, fontWeight: "800" },
  orderDate: { color: COLORS.muted, fontSize: 12, marginTop: 10 },
  orderItems: { color: COLORS.ink, fontSize: 14, lineHeight: 21, marginTop: 15 },
  timeline: { borderLeftWidth: 1, borderLeftColor: COLORS.line, marginLeft: 5, marginTop: 18, paddingLeft: 18, gap: 14 },
  timelineItem: { position: "relative", minHeight: 25 },
  timelineDot: { position: "absolute", left: -24, top: 2, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: COLORS.line, backgroundColor: COLORS.surface },
  timelineDotDone: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  timelineStatus: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  timelineStatusDone: { color: COLORS.ink },
  timelineDate: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  trackingBox: { padding: 12, backgroundColor: COLORS.surfaceStrong, borderRadius: 10, marginTop: 15 },
  trackingNumber: { color: COLORS.ink, fontSize: 13, fontWeight: "800", marginTop: 5 },
  trackingEvents: { marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.line },
  trackingEvent: { flexDirection: "row", alignItems: "flex-start", marginTop: 12 },
  trackingEventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent, marginTop: 5, marginRight: 10 },
  trackingEventCopy: { flex: 1 },
  trackingEventTitle: { color: COLORS.ink, fontSize: 13, fontWeight: "800" },
  orderActions: { flexDirection: "row", flexWrap: "wrap", gap: 14, borderTopWidth: 1, borderTopColor: COLORS.line, marginTop: 15, paddingTop: 10 },
  returnSummary: { paddingTop: 18, paddingBottom: 25 },
  profileIntro: { color: COLORS.muted, fontSize: 15, lineHeight: 22, padding: 20, paddingBottom: 4 },
  formCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, padding: 17, margin: 20 },
  formRow: { flexDirection: "row", gap: 10 },
  fieldWrap: { flex: 1, marginTop: 12 },
  fieldLabel: { color: COLORS.ink, fontSize: 12, fontWeight: "800", marginBottom: 7 },
  input: { height: 48, borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, backgroundColor: COLORS.white, paddingHorizontal: 12, color: COLORS.ink, fontSize: 14 },
  multilineInput: { height: 90, paddingTop: 12, textAlignVertical: "top" },
  selectWrap: { height: 48, borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, backgroundColor: COLORS.white },
  selectInput: { flex: 1, paddingHorizontal: 12, color: COLORS.ink, fontSize: 14 },
  formHint: { color: COLORS.muted, fontSize: 12, lineHeight: 18, paddingHorizontal: 20 },
  accountHero: { alignItems: "center", padding: 28, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.contrastSurface, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarText: { color: COLORS.contrastInk, fontSize: 30, fontWeight: "700" },
  accountName: { color: COLORS.ink, fontSize: 21, fontWeight: "800" },
  accountMenu: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, margin: 20, overflow: "hidden" },
  menuRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.line, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  menuTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "800" },
  menuCopy: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 4, paddingRight: 15 },
  menuArrow: { color: COLORS.accent, fontSize: 28, fontWeight: "300" },
  policyBox: { padding: 20, paddingTop: 0, gap: 4 },
  addressCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, padding: 14, marginBottom: 10 },
  addressSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  addressHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  defaultLabel: { color: COLORS.accent, fontSize: 9, letterSpacing: 1, fontWeight: "800" },
  checkoutSection: { padding: 20, paddingBottom: 4 },
  couponHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  couponList: { gap: 8, marginTop: 10 },
  couponCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  couponCardActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  couponCode: { color: COLORS.ink, fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  couponUse: { color: COLORS.ink, fontSize: 12, fontWeight: "800" },
  couponRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  couponInput: { flex: 1, height: 46, borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, backgroundColor: COLORS.surface, paddingHorizontal: 12, color: COLORS.ink, fontSize: 14 },
  paymentMethod: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  paymentMethodActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.accent, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
  inlineNote: { color: COLORS.accent, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  notificationCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 15, marginBottom: 11 },
  notificationTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  errorBanner: { backgroundColor: COLORS.warningSoft, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  paymentOverlay: { flex: 1, backgroundColor: COLORS.canvas, marginTop: Platform.OS === "ios" ? 45 : 0 },
  paymentHeader: { minHeight: 62, paddingHorizontal: 17, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.line },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", justifyContent: "flex-end" },
  returnModalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: Platform.OS === "ios" ? 34 : 20 },
  returnModalInput: { minHeight: 110, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: COLORS.white, padding: 12, color: COLORS.ink, fontSize: 14, marginTop: 16, marginBottom: 5 },
  authSafe: { flex: 1, backgroundColor: COLORS.canvas },
  authContent: { padding: 25, paddingTop: 55, paddingBottom: 40, flexGrow: 1 },
  authTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  authEyebrow: { color: COLORS.accent, fontSize: 11, letterSpacing: 1.7, fontWeight: "800", marginTop: 70 },
  authTitle: { color: COLORS.ink, fontSize: 43, lineHeight: 46, fontWeight: "700", letterSpacing: -1.5, marginTop: 12 },
  authCopy: { color: COLORS.muted, fontSize: 16, lineHeight: 24, marginTop: 14 },
  authCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 17, padding: 18, marginTop: 30 },
  authCardTitle: { color: COLORS.ink, fontSize: 21, fontWeight: "800" },
  authCardCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 12 },
  authConfigNote: { color: COLORS.warning, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  authLegal: { color: COLORS.muted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 15 },
  appleButton: { minHeight: 50, borderRadius: 10, backgroundColor: "#000", paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 10 },
  appleButtonText: { color: COLORS.white, fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  authFoot: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: "auto", paddingTop: 30 },
  deleteAccountBox: { borderTopWidth: 1, borderColor: COLORS.line, paddingTop: 18, marginTop: 28 }
}); }

let styles = buildStyles();
