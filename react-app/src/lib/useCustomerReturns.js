import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import { returnNeedsUpdates } from "./refundTracking";

export function useCustomerReturns() {
  const [snapshot, setSnapshot] = useState({ requests: [], loading: navigator.onLine, refreshing: false, error: "", updatedAt: null, expired: false, offline: !navigator.onLine });
  const refreshRef = useRef(null);
  const refresh = useCallback(() => refreshRef.current?.(), []);

  useEffect(() => {
    let disposed = false, pending = false, queued = false, expired = false, loaded = false, timer, controller, failures = 0;
    let requests = [];
    const available = () => document.visibilityState === "visible" && navigator.onLine && !expired;
    function schedule() {
      clearTimeout(timer);
      const interval=requests.some(request=>['requested','approved'].includes(request.status)&&!request.label_available)?15000:60000;
      if (available() && (failures || requests.some(returnNeedsUpdates))) timer = setTimeout(read, Math.min(300000, interval * 2 ** Math.min(failures, 3)));
    }
    async function read(manual = false) {
      clearTimeout(timer);
      if (disposed || !available()) return;
      if (pending) { if (manual) queued = true; return; }
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      setSnapshot(current => ({ ...current, refreshing: loaded, offline: false }));
      try {
        const response = await apiFetch("/api/returns", { signal: controller.signal, cache: "no-store" });
        if (response.status === 401 || response.status === 403) {
          expired = true;
          requests = [];
          if (!disposed) setSnapshot({ requests: [], loading: false, refreshing: false, error: "Your session has expired. Sign in again to view your return updates.", updatedAt: null, expired: true, offline: false });
          return;
        }
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (!Array.isArray(data.requests)) throw new Error("Invalid response");
        if (disposed) return;
        requests = data.requests;
        loaded = true;
        failures = 0;
        setSnapshot({ requests, loading: false, refreshing: false, error: "", expired: false, offline: !navigator.onLine, updatedAt: new Date().toISOString() });
      } catch {
        if (!disposed) {
          failures++;
          setSnapshot(current => ({ ...current, loading: false, refreshing: false, offline: !navigator.onLine, error: "We couldn't refresh your return updates. Any status shown is the last known update, not a new confirmation." }));
        }
      } finally {
        clearTimeout(timeout);
        pending = false;
        if (!disposed) {
          if (queued && available()) { queued = false; read(); }
          else schedule();
        }
      }
    }
    function resume() {
      clearTimeout(timer);
      setSnapshot(current => ({ ...current, offline: !navigator.onLine }));
      if (available()) read();
    }
    refreshRef.current = () => read(true);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    read();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      refreshRef.current = null;
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, []);
  return { ...snapshot, refresh };
}
