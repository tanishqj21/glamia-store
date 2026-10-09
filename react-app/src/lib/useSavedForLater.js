import { useCallback, useEffect, useMemo, useState } from "react";
import { cleanSavedForLater, readSavedForLater, removeCartSelection, saveCartSelection, savedForLaterKey, writeSavedForLater } from "./savedForLater";

export function useSavedForLater(email, enabled) {
  const key = savedForLaterKey(email);
  const initial = useMemo(() => {
    if (!enabled) return { items: [], ready: false, error: "" };
    try { return readSavedForLater(localStorage, key); }
    catch { return { items: [], ready: false, error: "Saved for later is unavailable because browser storage is blocked." }; }
  }, [key, enabled]);
  const [changed, setChanged] = useState(null);
  const current = enabled && changed?.key === key ? changed : initial;
  useEffect(() => {
    if (!enabled) return undefined;
    // A second tab can update the local list without an account API request.
    function refresh(event) {
      if (event.key !== key && event.key !== null) return;
      try { setChanged({ key, ...readSavedForLater(localStorage, key) }); }
      catch { /* The current list remains visible if storage becomes inaccessible. */ }
    }
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [key, enabled]);
  const updateItems = useCallback(update => {
    if (!enabled) return false;
    try {
      const items = writeSavedForLater(localStorage, key, update);
      setChanged({ key, items, ready: true, error: "" });
      return true;
    } catch (error) {
      const message = error.name === "QuotaExceededError" || error.name === "SecurityError"
        ? "Saved for later could not be stored in this browser. Your item has not moved. Check browser storage and try again."
        : error.message || "Saved for later could not be updated. Your item has not moved. Please try again.";
      setChanged(previous => ({ ...(previous?.key === key ? previous : initial), key, error: message }));
      return false;
    }
  }, [enabled, key, initial]);
  const getBaseline = useCallback(() => {
    try { const value = localStorage.getItem(`${key}:baseline`); return value ? cleanSavedForLater(JSON.parse(value)) : null; }
    catch { return null; }
  }, [key]);
  const replaceItems = useCallback(items => {
    const next = cleanSavedForLater(items);
    if (!updateItems(() => next)) return false;
    try { localStorage.setItem(`${key}:baseline`, JSON.stringify(next)); }
    catch { /* Account data is retained even when the optional restart baseline cannot be stored. */ }
    return true;
  }, [key, updateItems]);
  return {
    items: enabled ? current.items : [], ready: enabled && current.ready, error: current.error,
    saveItem: item => updateItems(items => saveCartSelection(items, item)),
    removeItem: item => updateItems(items => removeCartSelection(items, item)),
    replaceItems, getBaseline
  };
}
