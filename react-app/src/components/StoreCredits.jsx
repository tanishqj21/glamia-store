import React from 'react';
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { money, formatIST } from "../lib/commerce";
import { AccountLayout } from './AccountLayout';

export const refreshCredits = () => window.dispatchEvent(new Event("glamia-credits-changed"));

export { CreditsBalance } from "./CreditsBalance";

export function StoreCreditsPage({ user, onNavigate }) {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const response = await apiFetch("/api/loyalty", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Store credits could not be loaded");
      setWallet(data);
      refreshCredits();
    } catch (requestError) { setError(requestError.message); }
  }, [user]);
  useEffect(() => { load(); }, [load]);
  async function copy() { try { await navigator.clipboard.writeText(wallet.referral_code); setCopied(true); } catch { setError("Copy is unavailable. Select the referral code to copy it."); } }
  return <AccountLayout route="/credits" onNavigate={onNavigate} title="Store credits" className="credits-page credits-wallet">
    {!user ? <section className="account-panel"><p>Sign in to view your balance, rewards, and referral code.</p><button className="primary-action" type="button" onClick={() => onNavigate("/login")}>Sign in</button></section> : <>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="credits-wallet-grid"><section className="credits-balance-panel"><span>Available balance</span><strong>{wallet ? money(wallet.balance) : "Loading…"}</strong><p>1 credit = ₹1 towards your next purchase.</p><button className="primary-action" type="button" onClick={() => onNavigate("/best-sellers")}>Shop with your credits</button><small>Select store credits at checkout. Some coupons can be combined with credits.</small></section>
        <section className="credits-referral-panel"><p className="eyebrow">A little thank you for sharing</p><h2>Invite a friend</h2><div className="credits-reward-pair"><div><span>Your friend gets</span><strong>{money(wallet?.referred_reward ?? 100)}</strong></div><div><span>You get</span><strong>{money(wallet?.referral_reward ?? 50)}</strong></div></div><p>After your friend’s first successful payment, both rewards land in your wallets automatically.</p><label className="credits-code-label">Your referral code</label><div className="credits-referral-code"><strong>{wallet?.referral_code || "•••••••"}</strong><button className="secondary-action" type="button" disabled={!wallet?.referral_code} onClick={copy}>{copied ? "Copied" : "Copy code"}</button></div><small>They enter this code once while creating their account.</small><div className="credits-referral-counts"><span><b>{wallet?.referral_count || 0}</b> friends invited</span><span><b>{wallet?.successful_referrals || 0}</b> successful referrals</span></div></section></div>
      <section className="account-panel credits-activity-panel" aria-labelledby="credits-activity-title">
      <div className="account-panel-heading credits-section-heading"><div><p className="eyebrow">Wallet history</p><h2 id="credits-activity-title">Your activity</h2><p className="muted">Rewards, refunds, and spending, all in one place.</p></div><button className="secondary-action" type="button" onClick={load}>Refresh balance</button></div>
      <div className="credits-activity">{wallet?.ledger?.map(entry => <article key={entry.id}><div><span className="credits-entry-tag">{entry.kind.replaceAll("_", " ")}</span><strong>{entry.description || entry.kind.replaceAll("_", " ")}</strong><small>{formatIST(entry.created_at)}</small></div><b className={entry.amount > 0 ? "credit-positive" : "credit-negative"}>{entry.amount > 0 ? "+" : "−"}{money(Math.abs(entry.amount))}</b></article>)}{wallet && !wallet.ledger?.length && <div className="empty-state"><strong>Your wallet is ready.</strong><p>Share your referral code or use credits at checkout. Your transactions will appear here.</p></div>}</div>
      </section>
    </>}
  </AccountLayout>;
}
