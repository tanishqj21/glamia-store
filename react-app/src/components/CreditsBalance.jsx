import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { money } from "../lib/commerce";

export function CreditsBalance({ user, onNavigate, showWhenSignedOut = false }) {
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.email) return;
      const response = await apiFetch("/api/loyalty?summary=1", { cache: "no-store" });
      if (response.ok) { const wallet = await response.json(); if (active) setBalance(Number(wallet.balance || 0)); }
    };
    setBalance(null);
    load().catch(() => {});
    const visible = () => { if (document.visibilityState === "visible") load().catch(() => {}); };
    window.addEventListener("glamia-credits-changed", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; window.removeEventListener("glamia-credits-changed", visible); document.removeEventListener("visibilitychange", visible); };
  }, [user?.email]);
  if (!user && !showWhenSignedOut) return null;
  const label = !user ? "Sign in to view store credits" : `Store credits${balance === null ? "" : `, ${money(balance)}`}`;
  return <button className="header-credits" type="button" onClick={() => onNavigate("/credits")} aria-label={label}><span aria-hidden="true">₹</span><strong>{!user ? "—" : balance === null ? "…" : balance.toLocaleString("en-IN")}</strong><small>Credits</small></button>;
}
