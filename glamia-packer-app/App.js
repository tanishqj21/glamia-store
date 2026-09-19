import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  employeeLogin,
  employeeLogout,
  employeeOrder,
  employeeOrders,
  employeeSession,
  markOrderPacked,
  storedEmployee
} from "./src/api";

const palette = {
  ink: "#17211d",
  muted: "#6c786f",
  canvas: "#f6f4ef",
  card: "#fffdf8",
  line: "#dedbd2",
  accent: "#1e7759",
  accentSoft: "#dff0e8",
  warning: "#a95e35",
  warningSoft: "#fff0e7"
};

function formatDate(value) {
  if (!value) return "Recent";
  const date = new Date(String(value).includes("T") ? value : `${String(value).replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function LoginScreen({ onLoggedIn }) {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!employeeId.trim() || !password) { setError("Enter your employee ID and password."); return; }
    setBusy(true); setError("");
    try {
      const data = await employeeLogin(employeeId.trim(), password);
      onLoggedIn(data.employee);
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" />
    <KeyboardAvoidingView style={styles.loginWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.brandMark}><Image source={require("./assets/icon.png")} style={styles.brandLogo} resizeMode="contain" /></View>
      <Text style={styles.kicker}>GLAMIA OPERATIONS</Text>
      <Text style={styles.loginTitle}>Ready the next order.</Text>
      <Text style={styles.loginCopy}>Sign in with the employee ID given to you by an admin. This app is only for packing operations.</Text>
      <View style={styles.formCard}>
        <Text style={styles.fieldLabel}>Employee ID</Text>
        <TextInput style={styles.input} value={employeeId} onChangeText={setEmployeeId} autoCapitalize="characters" autoCorrect={false} placeholder="EMP-001" placeholderTextColor="#a6aaa5" returnKeyType="next" />
        <Text style={styles.fieldLabel}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Your password" placeholderTextColor="#a6aaa5" onSubmitEditing={submit} />
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <PrimaryButton label={busy ? "Signing in…" : "Open packing queue"} onPress={submit} disabled={busy} />
      </View>
      <Text style={styles.loginFoot}>Need access or a password reset? Contact your Glamia admin.</Text>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function PrimaryButton({ label, onPress, disabled }) {
  return <Pressable style={({ pressed }) => [styles.primaryButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressed]} onPress={onPress} disabled={disabled} accessibilityRole="button"><Text style={styles.primaryButtonText}>{label}</Text></Pressable>;
}

function SecondaryButton({ label, onPress, disabled }) {
  return <Pressable style={({ pressed }) => [styles.secondaryButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressed]} onPress={onPress} disabled={disabled} accessibilityRole="button"><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>;
}

function statusCopy(order) {
  return order.packing_status === "packed" ? `Packed ${order.packed_at ? `· ${formatDate(order.packed_at)}` : ""}` : "Awaiting packing";
}

function OrderCard({ order, onOpen, onPack, busy }) {
  const itemSummary = (order.items || []).map((item) => `${item.name}${item.size ? ` · ${item.size}` : ""} ×${item.quantity}`).join("  ·  ");
  const isPacked = order.packing_status === "packed";
  return <View style={styles.orderCard}>
    <Pressable onPress={() => onOpen(order)} accessibilityRole="button" accessibilityLabel={`Open order ${order.order_number}`}>
      <View style={styles.orderCardTop}><Text style={styles.orderNumber}>{order.order_number}</Text><Text style={[styles.packBadge, isPacked ? styles.packBadgeDone : styles.packBadgeWaiting]}>{isPacked ? "PACKED" : "TO PACK"}</Text></View>
      <Text style={styles.orderCustomer}>{order.customer_name || "Customer"}</Text>
      <Text style={styles.orderMeta}>{formatDate(order.created_at)} · {order.order_type === "preorder" ? "Pre-order" : "Standard"}</Text>
      <Text style={styles.orderItems} numberOfLines={2}>{itemSummary || "Order items"}</Text>
      <View style={styles.orderFooter}><Text style={styles.orderTotal}>{money(order.total)}</Text><Text style={styles.viewDetails}>View details  ›</Text></View>
    </Pressable>
    {!isPacked && <PrimaryButton label={busy ? "Saving…" : "Mark as packed"} onPress={() => onPack(order)} disabled={busy} />}
    {isPacked && <Text style={styles.packedBy}>{statusCopy(order)}{order.packed_by ? ` · ${order.packed_by}` : ""}</Text>}
  </View>;
}

function OrderDetail({ order, onClose, onPack, busy }) {
  if (!order) return null;
  const shipping = order.shipping || {};
  const address = [shipping.line1, shipping.line2, shipping.city, shipping.state, shipping.pin, shipping.country].filter(Boolean).join(", ");
  return <Modal visible={Boolean(order)} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.detailPage}>
      <View style={styles.detailHeader}><View><Text style={styles.kicker}>ORDER DETAIL</Text><Text style={styles.detailTitle}>{order.order_number}</Text></View><Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close order details"><Text style={styles.closeText}>×</Text></Pressable></View>
      <View style={styles.detailCard}><Text style={styles.detailLabel}>Customer</Text><Text style={styles.detailValue}>{order.customer_name || "Customer"}</Text><Text style={styles.detailMuted}>{order.customer_email}</Text>{shipping.phone ? <Text style={styles.detailMuted}>{shipping.phone}</Text> : null}<Text style={styles.detailLabel}>Ship to</Text><Text style={styles.detailValue}>{address || "Address not supplied"}</Text></View>
      <View style={styles.detailCard}><View style={styles.rowBetween}><Text style={styles.detailLabel}>Items to pack</Text><Text style={styles.detailLabel}>{money(order.total)}</Text></View>{(order.items || []).map((item, index) => <View style={styles.itemRow} key={`${item.id || item.name}-${index}`}><View style={styles.itemCopy}><Text style={styles.detailValue}>{item.name}</Text><Text style={styles.detailMuted}>{[item.color, item.size, item.variant, item.preorder ? "Pre-order" : ""].filter(Boolean).join(" · ") || "No options"}</Text></View><Text style={styles.quantity}>× {item.quantity}</Text></View>)}</View>
      {order.packing_status === "packed" ? <View style={styles.successPanel}><Text style={styles.successTitle}>Already marked packed</Text><Text style={styles.successCopy}>{statusCopy(order)}{order.packed_by ? ` by ${order.packed_by}` : ""}</Text></View> : <PrimaryButton label={busy ? "Saving…" : "Mark as packed"} onPress={() => onPack(order)} disabled={busy} />}
      <SecondaryButton label="Close" onPress={onClose} disabled={busy} />
    </ScrollView></SafeAreaView>
  </Modal>;
}

function PackingScreen({ employee, onSignedOut }) {
  const [filter, setFilter] = useState("unpacked");
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try { const data = await employeeOrders(filter); setOrders(data.orders || []); setError(""); }
    catch (requestError) { if (requestError.status === 401) onSignedOut(); else setError(requestError.message); }
    finally { if (showSpinner) setRefreshing(false); }
  }, [filter, onSignedOut]);

  useEffect(() => { loadOrders(true); const timer = setInterval(() => loadOrders(false), 30000); return () => clearInterval(timer); }, [loadOrders]);

  async function openOrder(order) {
    try { const data = await employeeOrder(order.id); setSelectedOrder(data.order); }
    catch (requestError) { if (requestError.status === 401) onSignedOut(); else Alert.alert("Could not open order", requestError.message); }
  }

  async function pack(order) {
    setBusyId(order.id); setError("");
    try {
      const data = await markOrderPacked(order.id);
      setSelectedOrder((current) => current?.id === order.id ? data.order : current);
      if (filter === "unpacked") setOrders((current) => current.filter((item) => item.id !== order.id));
      else setOrders((current) => current.map((item) => item.id === order.id ? data.order : item));
      if (!data.already_packed) Alert.alert("Packed", `${data.order.order_number} was marked packed. Admin has been notified.`);
    } catch (requestError) { if (requestError.status === 401) onSignedOut(); else setError(requestError.message); }
    finally { setBusyId(""); }
  }

  async function signOut() { await employeeLogout(); onSignedOut(); }

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" />
    <View style={styles.appHeader}><View style={styles.headerBrand}><Image source={require("./assets/icon.png")} style={styles.headerLogo} resizeMode="contain" /><View><Text style={styles.brandWord}>GLAMIA</Text><Text style={styles.headerSub}>PACKING DESK</Text></View></View><View style={styles.headerActions}><Text style={styles.employeeName}>{employee?.name || "Employee"}</Text><Pressable onPress={signOut} accessibilityRole="button"><Text style={styles.signOut}>Sign out</Text></Pressable></View></View>
    <View style={styles.queueIntro}><View><Text style={styles.kicker}>FULFILMENT</Text><Text style={styles.queueTitle}>{filter === "unpacked" ? "Orders to pack" : "Packed orders"}</Text></View><Pressable onPress={() => loadOrders(true)} disabled={refreshing} style={styles.refreshButton}><Text style={styles.refreshText}>{refreshing ? "Refreshing…" : "Refresh"}</Text></Pressable></View>
    <View style={styles.tabs} accessibilityRole="tablist"><Pressable style={[styles.tab, filter === "unpacked" && styles.activeTab]} onPress={() => setFilter("unpacked")} accessibilityRole="tab" accessibilityState={{ selected: filter === "unpacked" }}><Text style={[styles.tabText, filter === "unpacked" && styles.activeTabText]}>To pack</Text></Pressable><Pressable style={[styles.tab, filter === "packed" && styles.activeTab]} onPress={() => setFilter("packed")} accessibilityRole="tab" accessibilityState={{ selected: filter === "packed" }}><Text style={[styles.tabText, filter === "packed" && styles.activeTabText]}>Packed</Text></Pressable></View>
    {error ? <View style={styles.errorBanner}><Text style={styles.error}>{error}</Text><Pressable onPress={() => loadOrders(true)}><Text style={styles.retry}>Try again</Text></Pressable></View> : null}
    <FlatList data={orders} keyExtractor={(item) => item.id} renderItem={({ item }) => <OrderCard order={item} onOpen={openOrder} onPack={pack} busy={busyId === item.id} />} contentContainerStyle={styles.listContent} refreshing={refreshing} onRefresh={() => loadOrders(true)} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{filter === "unpacked" ? "All clear for now" : "No packed orders yet"}</Text><Text style={styles.emptyCopy}>{filter === "unpacked" ? "New website orders will appear here automatically." : "Orders you confirm as packed will appear here."}</Text></View>} />
    <OrderDetail order={selectedOrder} onClose={() => setSelectedOrder(null)} onPack={pack} busy={Boolean(selectedOrder && busyId === selectedOrder.id)} />
  </SafeAreaView>;
}

export default function App() {
  const [employee, setEmployee] = useState(null);
  const [checking, setChecking] = useState(true);
  const onSignedOut = useCallback(() => setEmployee(null), []);
  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await storedEmployee();
      if (!stored?.token) { if (active) setChecking(false); return; }
      try { const data = await employeeSession(); if (active) setEmployee(data.employee); }
      catch { await employeeLogout(); if (active) setEmployee(null); }
      finally { if (active) setChecking(false); }
    })();
    return () => { active = false; };
  }, []);
  if (checking) return <SafeAreaView style={styles.loading}><StatusBar style="dark" /><ActivityIndicator color={palette.accent} size="large" /></SafeAreaView>;
  return employee ? <PackingScreen employee={employee} onSignedOut={onSignedOut} /> : <LoginScreen onLoggedIn={setEmployee} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.canvas },
  loginWrap: { flex: 1, justifyContent: "center", padding: 24 },
  brandMark: { width: 72, height: 72, borderRadius: 20, backgroundColor: palette.ink, alignItems: "center", justifyContent: "center", marginBottom: 28, overflow: "hidden" },
  brandLogo: { width: 58, height: 58 },
  kicker: { color: palette.accent, fontSize: 11, letterSpacing: 2.2, fontWeight: "700", marginBottom: 10 },
  loginTitle: { color: palette.ink, fontSize: 38, lineHeight: 43, fontWeight: "600", letterSpacing: -1, marginBottom: 12 },
  loginCopy: { color: palette.muted, fontSize: 16, lineHeight: 24, maxWidth: 430, marginBottom: 28 },
  formCard: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, borderRadius: 18, padding: 18 },
  fieldLabel: { color: palette.ink, fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 8 },
  input: { borderWidth: 1, borderColor: palette.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, color: palette.ink, fontSize: 16, backgroundColor: "#fff" },
  error: { color: "#a9382c", fontSize: 13, lineHeight: 19, marginTop: 12 },
  primaryButton: { backgroundColor: palette.ink, borderRadius: 10, minHeight: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 16 },
  primaryButtonText: { color: "#fffdf8", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
  secondaryButton: { borderWidth: 1, borderColor: palette.line, borderRadius: 10, minHeight: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 12 },
  secondaryButtonText: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  disabledButton: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
  loginFoot: { color: palette.muted, textAlign: "center", fontSize: 12, marginTop: 22 },
  appHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 15, backgroundColor: palette.card, borderBottomWidth: 1, borderBottomColor: palette.line, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerBrand: { alignItems: "center", flexDirection: "row", gap: 10 },
  headerLogo: { width: 34, height: 34, borderRadius: 9, backgroundColor: palette.ink },
  brandWord: { color: palette.ink, fontSize: 22, letterSpacing: 5, fontWeight: "600" },
  headerSub: { color: palette.accent, fontSize: 9, letterSpacing: 2, fontWeight: "700", marginTop: 4 },
  headerActions: { alignItems: "flex-end" },
  employeeName: { color: palette.ink, fontSize: 13, fontWeight: "700", marginBottom: 5 },
  signOut: { color: palette.warning, fontSize: 12, fontWeight: "700" },
  queueIntro: { paddingHorizontal: 20, paddingTop: 25, paddingBottom: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  queueTitle: { color: palette.ink, fontSize: 30, fontWeight: "600", letterSpacing: -0.5 },
  refreshButton: { borderWidth: 1, borderColor: palette.line, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  refreshText: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  tabs: { flexDirection: "row", marginHorizontal: 20, borderBottomWidth: 1, borderBottomColor: palette.line },
  tab: { paddingHorizontal: 5, paddingVertical: 12, marginRight: 24, borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeTab: { borderBottomColor: palette.accent },
  tabText: { color: palette.muted, fontSize: 14, fontWeight: "700" },
  activeTabText: { color: palette.accent },
  errorBanner: { marginHorizontal: 20, marginTop: 14, padding: 12, backgroundColor: palette.warningSoft, borderRadius: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  retry: { color: palette.warning, fontWeight: "700", fontSize: 13 },
  listContent: { padding: 20, paddingBottom: 35 },
  orderCard: { backgroundColor: palette.card, borderRadius: 16, borderWidth: 1, borderColor: palette.line, padding: 16, marginBottom: 14 },
  orderCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { color: palette.ink, fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  packBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: "800", overflow: "hidden" },
  packBadgeDone: { color: palette.accent, backgroundColor: palette.accentSoft },
  packBadgeWaiting: { color: palette.warning, backgroundColor: palette.warningSoft },
  orderCustomer: { color: palette.ink, fontSize: 16, fontWeight: "600", marginTop: 17 },
  orderMeta: { color: palette.muted, fontSize: 12, marginTop: 4 },
  orderItems: { color: palette.ink, fontSize: 14, lineHeight: 20, marginTop: 16 },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 17, paddingTop: 13, borderTopWidth: 1, borderTopColor: palette.line },
  orderTotal: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  viewDetails: { color: palette.accent, fontSize: 13, fontWeight: "700" },
  packedBy: { color: palette.accent, fontSize: 12, fontWeight: "700", marginTop: 15 },
  empty: { alignItems: "center", paddingHorizontal: 20, paddingTop: 70 },
  emptyTitle: { color: palette.ink, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  emptyCopy: { color: palette.muted, fontSize: 14, textAlign: "center", lineHeight: 21 },
  detailPage: { padding: 20, paddingBottom: 40 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
  detailTitle: { color: palette.ink, fontSize: 28, fontWeight: "700" },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" },
  closeText: { color: palette.ink, fontSize: 28, lineHeight: 30, fontWeight: "300" },
  detailCard: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, borderRadius: 16, padding: 16, marginBottom: 14 },
  detailLabel: { color: palette.accent, fontSize: 11, letterSpacing: 1.4, fontWeight: "800", textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  detailValue: { color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  detailMuted: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemRow: { borderTopWidth: 1, borderTopColor: palette.line, paddingVertical: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemCopy: { flex: 1, paddingRight: 12 },
  quantity: { color: palette.ink, fontSize: 15, fontWeight: "800" },
  successPanel: { backgroundColor: palette.accentSoft, borderRadius: 12, padding: 15, marginTop: 3 },
  successTitle: { color: palette.accent, fontSize: 15, fontWeight: "800" },
  successCopy: { color: palette.ink, fontSize: 13, marginTop: 5 }
});
