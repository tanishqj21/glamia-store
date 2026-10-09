import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { savedForLaterKey } from "../glamia-shoppers-app/src/bagItems.js";

const email = "shopper@example.com";
const item = { id: "shirt", size: "M", variant: "Plum", quantity: 2 };
const copy = value => JSON.parse(JSON.stringify(value));
const waitFor = async condition => {
  for (let attempt = 0; attempt < 150; attempt++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.ok(condition(), "Hook state should settle");
};

// A small effect scheduler runs the actual native hooks with deterministic storage/network adapters.
async function harness(entries = {}, remote = { cart: [item], wishlist: [], saved_for_later: [] }, guest = false) {
  const data = new Map(Object.entries(entries)), slots = [], effects = [], calls = [];
  let cursor = 0, queued = false, mounted = true, latest, hook;
  const backend = { value: copy(remote), offline: false, legacy: false };
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  function queue() { if (!queued && mounted) { queued = true; queueMicrotask(() => { queued = false; render(); }); } }
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => { const next = typeof value === "function" ? value(slots[index].value) : value; if (!Object.is(next, slots[index].value)) { slots[index].value = next; queue(); } }];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useCallback(fn, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: fn, deps }; return slots[index].value; },
    useEffect(fn, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); }
  };
  const storage = {
    getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); }, removeItem: async key => { data.delete(key); },
    multiSet: async entries => { for (const [key, value] of entries) data.set(key, value); }, multiRemove: async keys => { for (const key of keys) data.delete(key); }
  };
  function applySelections(before, changes, merge) {
    const map = new Map(before.map(line => [JSON.stringify([line.id, line.size, line.variant]), line]));
    for (const line of changes) {
      const key = JSON.stringify([line.id, line.size, line.variant]);
      if (!line.quantity) map.delete(key); else map.set(key, { ...line, quantity: merge ? Math.max(line.quantity, map.get(key)?.quantity || 0) : line.quantity });
    }
    return [...map.values()];
  }
  async function mutate(cart, wishlist, later, merge) {
    if (backend.offline) throw new Error("Offline");
    calls.push({ cart: copy(cart), wishlist: copy(wishlist), saved_for_later: copy(later), merge });
    const wish = new Set(backend.value.wishlist);
    for (const entry of wishlist) merge ? wish.add(entry) : entry.saved ? wish.add(entry.id) : wish.delete(entry.id);
    backend.value = { cart: applySelections(backend.value.cart, cart, merge), wishlist: [...wish], saved_for_later: applySelections(backend.value.saved_for_later, later, merge) };
    return copy(backend.value);
  }
  const api = {
    getSavedItems: async () => { if (backend.offline) throw new Error("Offline"); return backend.legacy ? { cart: [], wishlist: [] } : copy(backend.value); },
    mergeSavedItems: (cart, wishlist, later) => mutate(cart, wishlist, later, true),
    patchSavedItems: (cart, wishlist, later) => mutate(cart, wishlist, later, false)
  };
  const context = createContext({ console, Map, Set, Date, Promise, JSON, Object, String, Number, Error, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 25)), clearTimeout });
  const modules = new Map();
  async function moduleAt(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const mod = new SourceTextModule(await readFile(url, "utf8"), { context, identifier: url.href }); modules.set(url.href, mod);
    await mod.link(async specifier => {
      const exports = specifier === "react" ? react : specifier === "@react-native-async-storage/async-storage" ? { default: storage } : specifier === "./api" ? api : null;
      if (exports) return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
      return moduleAt(new URL(specifier.endsWith(".js") ? specifier : `${specifier}.js`, url));
    });
    return mod;
  }
  const module = await moduleAt(new URL("../glamia-shoppers-app/src/useSavedItems.js", import.meta.url));
  await module.evaluate(); hook = module.namespace.useSavedItems;
  function render() { if (!mounted) return; cursor = 0; latest = hook(guest ? "" : email, guest); for (const effect of effects.splice(0)) effect(); }
  render();
  return { data, calls, backend, get current() { return latest; }, close() { mounted = false; for (const slot of slots) slot?.cleanup?.(); } };
}

test("the native hooks sync bag-to-later and later-to-bag in one small delta", async () => {
  const app = await harness();
  try {
    await waitFor(() => app.current.cart.length === 1 && app.current.savedForLaterState.ready);
    await app.current.savedForLaterState.saveItem(item);
    app.current.setCart([]);
    await waitFor(() => app.backend.value.saved_for_later.length === 1 && !app.backend.value.cart.length);
    assert.deepEqual(app.calls.at(-1).cart, [{ ...item, quantity: 0 }]);
    assert.deepEqual(app.calls.at(-1).saved_for_later, [item]);
    await app.current.savedForLaterState.removeItem(item);
    app.current.setCart([item]);
    await waitFor(() => !app.backend.value.saved_for_later.length && app.backend.value.cart.length === 1);
    assert.deepEqual(app.calls.at(-1).saved_for_later, [{ ...item, quantity: 0 }]);
    assert.deepEqual(app.calls.at(-1).cart, [item]);
  } finally { app.close(); }
});
test("native resume refresh adopts remote saved items without writing a stale snapshot back", async () => {
  const app = await harness();
  try {
    await waitFor(() => app.current.cart.length === 1);
    await new Promise(resolve => setTimeout(resolve, 80));
    const writes = app.calls.length;
    app.backend.value = { cart: [], wishlist: [], saved_for_later: [item] };
    await app.current.refresh();
    await waitFor(() => app.current.savedForLaterState.items.length === 1 && !app.current.cart.length);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(app.calls.length, writes);
  } finally { app.close(); }
});
test("native offline movement persists and flushes both collections on resume", async () => {
  const app = await harness();
  try {
    await waitFor(() => app.current.cart.length === 1);
    app.backend.offline = true;
    await app.current.savedForLaterState.saveItem(item); app.current.setCart([]);
    await waitFor(() => Boolean(app.current.savedForLaterState.error));
    assert.deepEqual(JSON.parse(app.data.get(savedForLaterKey(email))), [item]);
    assert.equal(app.backend.value.cart.length, 1);
    app.backend.offline = false;
    await app.current.refresh();
    await waitFor(() => app.backend.value.saved_for_later.length === 1 && !app.backend.value.cart.length);
  } finally { app.close(); }
});
test("a signed-out native cache cannot resurrect items removed on the website", async () => {
  const key = savedForLaterKey(email);
  const app = await harness({ [key]: JSON.stringify([item]), [`${key}:baseline`]: JSON.stringify([item]) }, { cart: [], wishlist: [], saved_for_later: [] });
  try {
    await waitFor(() => app.data.get(key) === "[]");
    assert.equal(app.backend.value.saved_for_later.length, 0);
    assert.equal(app.calls.some(call => call.saved_for_later.length), false);
  } finally { app.close(); }
});
test("pre-sync native caches migrate once, but old backends cannot erase local saved items", async () => {
  const key = savedForLaterKey(email);
  const app = await harness({ [key]: JSON.stringify([item]), glamia_store_saved_sync_user: email, glamia_store_saved_baseline: JSON.stringify({ cart: [], wishlist: [] }) }, { cart: [], wishlist: [], saved_for_later: [] });
  try { await waitFor(() => app.backend.value.saved_for_later.length === 1); assert.equal(app.calls.filter(call => call.saved_for_later.length).length, 1); }
  finally { app.close(); }
  const old = await harness({ [key]: JSON.stringify([item]) }, { cart: [], wishlist: [], saved_for_later: [] });
  old.backend.legacy = true;
  try { await waitFor(() => Boolean(old.current.savedForLaterState.error)); assert.equal(old.current.savedForLaterState.items.length, 1); assert.equal(old.calls.length, 0); }
  finally { old.close(); }
});
test("guest saved selections migrate into the account on sign-in", async () => {
  const guestKey = savedForLaterKey();
  const app = await harness({ [guestKey]: JSON.stringify([item]) }, { cart: [], wishlist: [], saved_for_later: [] });
  try {
    await waitFor(() => app.backend.value.saved_for_later.length === 1);
    assert.equal(app.data.has(guestKey), false);
    assert.deepEqual(copy(app.current.savedForLaterState.items), [item]);
  } finally { app.close(); }
});
