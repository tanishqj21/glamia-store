import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { money, formatIST } from "../lib/commerce";

async function request(path, method = "GET", body) {
  const response = await apiFetch(path, { method, cache: "no-store", ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Store credits could not be updated");
  return data;
}
const label = value => String(value || "").replaceAll("_", " ");

export function AdminCreditsView() {
  const [data, setData] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [tab, setTab] = useState("give");
  const [search, setSearch] = useState(""), [matches, setMatches] = useState([]), [searching, setSearching] = useState(false);
  const [recipient, setRecipient] = useState(null), [amount, setAmount] = useState(""), [reason, setReason] = useState("");
  const [reward, setReward] = useState("50"), [referredReward, setReferredReward] = useState("100"), [ledgerFilter, setLedgerFilter] = useState("all");
  const grantToken = useRef(null);
  const load = useCallback(async () => {
    try { const next = await request("/api/admin/credits"); setData(next); setReward(String(next.settings?.referral_reward ?? 50)); setReferredReward(String(next.settings?.referred_reward ?? 100)); }
    catch (reason) { setError(reason.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true;
    if (search.trim().length < 2 || recipient) { setMatches([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => request(`/api/admin/credits?q=${encodeURIComponent(search.trim())}`)
      .then(result => { if (active) setMatches(result.customers || []); })
      .catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setSearching(false); }), 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, recipient]);
  async function run(action, message) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(message); await load(); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  function pick(customer, award = false) { setRecipient(customer); setSearch(customer.email); setMatches([]); if (award) { setReason("Top referrer award"); setTab("give"); } }
  async function grant(event) {
    event.preventDefault();
    if (!recipient) { setError("Choose a registered customer from the suggestions."); return; }
    const fingerprint = JSON.stringify([recipient.email, amount, reason.trim()]);
    if (grantToken.current?.fingerprint !== fingerprint) grantToken.current = { fingerprint, key: crypto.randomUUID() };
    await run(async () => {
      await request("/api/admin/credits/grants", "POST", { email: recipient.email, amount: Number(amount), reason: reason.trim(), idempotency_key: grantToken.current.key });
      grantToken.current = null; setAmount(""); setReason(""); setRecipient(null); setSearch("");
    }, "Store credits added. The transaction is recorded in History.");
  }
  const authority = data?.authority;
  const ledger = (data?.ledger || []).filter(item => ledgerFilter === "all" || (ledgerFilter === "referral" ? item.kind.startsWith("referral") : item.kind === ledgerFilter));
  return <section className="admin-panel admin-wide-panel admin-credits credits-console">
    <header className="admin-panel-heading"><div><p className="eyebrow">Customer wallet</p><h2>Store credits</h2><p className="muted">Give credits, approve refunds, and see exactly where each credit went.</p></div><button className="secondary-action" type="button" disabled={busy} onClick={() => { setError(""); load(); }}>Refresh</button></header>
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="inline-note" role="status">{notice}</p>}
    {!data ? <div className="loading-card">{error ? "Use Refresh to try again." : "Loading credits workspace…"}</div> : <>
      <div className="credits-summary-strip"><div><span>Available to give today</span><strong>{authority.remaining === null ? "Unlimited" : money(authority.remaining)}</strong><small>{authority.daily_limit === null ? "Whitelisted admin" : `${money(authority.daily_limit)} daily allowance`}</small></div><div><span>Given today</span><strong>{money(authority.granted)}</strong><small>Manual grants · resets at midnight IST</small></div><div><span>Refunds awaiting action</span><strong>{authority.whitelisted ? data.approvals.filter(item => item.credit_approval_status === "pending").length : "Owner approval"}</strong><small>{authority.whitelisted ? "Open Refund approvals to review" : "Whitelisted admins approve refunds"}</small></div></div>
      <nav className="credits-workspace-tabs" aria-label="Store credits sections">{[["give", "Give credits"], ...(authority.whitelisted ? [["refunds", "Refund approvals"]] : []), ["referrals", "Referrals"], ["history", "History"]].map(([id, text]) => <button type="button" key={id} aria-pressed={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>{text}</button>)}</nav>
      {tab === "give" && <div className="credits-grant-layout"><form className="admin-listing-form credits-grant-form" onSubmit={grant}><p className="eyebrow">Manual grant</p><h3>Give a customer credits</h3><p className="muted">1 credit = ₹1. Every grant needs a customer, an amount, and a reason.</p><label>1. Choose a customer<input value={search} onChange={event => { setSearch(event.target.value); setRecipient(null); }} placeholder="Type a name or email" autoComplete="off" required /></label>
        {!recipient && search.trim().length >= 2 && <div className="credits-customer-results" aria-live="polite">{searching ? <p>Searching customers…</p> : matches.length ? matches.map(customer => <button key={customer.email} type="button" onClick={() => pick(customer)}><strong>{customer.name || customer.email}</strong><span>{customer.email}</span><small>Current balance {money(customer.balance)}</small></button>) : <p>No registered customer found.</p>}</div>}
        {recipient && <div className="credits-selected-customer"><strong>{recipient.name || recipient.email}</strong><span>{recipient.email}</span><small>Current balance {money(recipient.balance)}</small><button className="secondary-action" type="button" onClick={() => { setRecipient(null); setSearch(""); }}>Change customer</button></div>}
        <label>2. Credits to add<input type="number" min="1" step="1" max={authority.remaining ?? undefined} value={amount} onChange={event => setAmount(event.target.value)} required placeholder="e.g. 200" /></label><label>3. Why are you giving credits?<textarea rows="3" value={reason} maxLength="300" onChange={event => setReason(event.target.value)} required placeholder="A clear reason appears in the customer’s credit activity" /></label>
        <div className="credits-grant-total"><span>Customer will receive</span><strong>{money(Number(amount) || 0)}</strong></div><button className="primary-action" disabled={busy || !recipient || authority.remaining === 0}>{busy ? "Adding credits…" : "Add store credits"}</button>
      </form><aside className="credits-guidance"><h3>How credits work</h3><ol><li><strong>Manual grants</strong><p>Added immediately to a registered customer’s wallet. Your daily allowance applies.</p></li><li><strong>Referral rewards</strong><p>After the first successful payment: {money(data.settings.referred_reward)} for the new customer and {money(data.settings.referral_reward)} for their inviter.</p></li><li><strong>Returned orders</strong><p>Credit refunds need the return to be received and a whitelisted admin’s approval.</p></li></ol><button className="secondary-action" type="button" onClick={() => setTab("history")}>View transaction history</button></aside></div>}
      {tab === "refunds" && authority.whitelisted && <section><h3>Refund approvals</h3><p className="muted">Credits release once approval and return receipt are both recorded.</p><div className="credits-activity">{data.approvals.map(refund => <article key={refund.id}><div><span className="credits-entry-tag">{refund.credit_approval_status === "approved" ? "Approved · awaiting receipt" : refund.returned_at ? "Returned · ready to approve" : "Awaiting return"}</span><strong>{refund.order_number}</strong><span>{refund.customer_email}</span><p>{refund.reason}</p><small>{formatIST(refund.created_at)}</small></div><div className="credits-entry-actions"><b>{money(refund.refund_amount)}</b><button className="primary-action" type="button" disabled={busy || refund.credit_approval_status === "approved"} onClick={() => run(() => request(`/api/admin/credits/refunds/${encodeURIComponent(refund.id)}`, "POST", { decision: "approved" }), refund.returned_at ? "Refund credited. See History for the transaction." : "Approved. Credits release when the return is received.")}>{refund.credit_approval_status === "approved" ? "Approved" : "Approve refund"}</button><button className="secondary-action" type="button" disabled={busy} onClick={() => run(() => request(`/api/admin/credits/refunds/${encodeURIComponent(refund.id)}`, "POST", { decision: "rejected" }), "Credit refund rejected.")}>Reject</button></div></article>)}{!data.approvals.length && <p className="empty-state">You’re up to date. No credit refunds need approval.</p>}</div></section>}
      {tab === "referrals" && <section><div className="credits-referral-rule"><div><p className="eyebrow">Automatic rewards</p><h3>Two wallets. One successful order.</h3><p>A new customer enters a code at signup. Their first successfully paid order rewards both customers once.</p></div><div className="credits-reward-pair"><div><span>New customer gets</span><strong>{money(data.settings.referred_reward)}</strong></div><div><span>Customer who invited them gets</span><strong>{money(data.settings.referral_reward)}</strong></div></div></div>
        {authority.whitelisted && <details className="credits-records"><summary>Adjust future referral rewards</summary><form className="credits-reward-form" onSubmit={event => { event.preventDefault(); run(() => request("/api/admin/credits/settings", "PATCH", { referral_reward: Number(reward), referred_reward: Number(referredReward) }), "Future referral rewards saved."); }}><label>New customer’s credits<input type="number" min="0" step="1" value={referredReward} disabled={busy} onChange={event => setReferredReward(event.target.value)} required /></label><label>Inviter’s credits<input type="number" min="0" step="1" value={reward} disabled={busy} onChange={event => setReward(event.target.value)} required /></label><p className="form-hint">Applies to future successful referrals. Set both to zero to pause payouts.</p><button className="primary-action" disabled={busy}>Save rewards</button></form></details>}
        <h3>Top referrers</h3><p className="muted">A manual bonus follows your daily allowance.</p><div className="credits-activity">{data.leaderboard.map((member, index) => <article key={member.referrer_email}><div><strong>{index + 1}. {member.name || member.referrer_email}</strong><span>{member.referrer_email}</span><small>{member.successful} successful · {member.referrals} total · {money(member.rewarded)} earned</small></div><button className="secondary-action" type="button" onClick={() => pick({ email: member.referrer_email, name: member.name }, true)}>Give a bonus</button></article>)}{!data.leaderboard.length && <p className="empty-state">Your first referrer will appear here when someone joins with their code.</p>}</div>
        <h3>Referral records</h3><div className="credits-activity">{data.referrals.map(referral => <article key={referral.referred_email}><div><span className="credits-entry-tag">{label(referral.status)}</span><strong>New customer: {referral.referred_email}</strong><span>Invited by {referral.referrer_email} · {referral.referral_code}</span><small>{formatIST(referral.qualified_at || referral.created_at)}{referral.qualifying_order_id && ` · Order ${referral.qualifying_order_id}`}</small></div><div className="credits-reward-record"><span>New customer <b>{money(referral.referred_reward_amount)}</b></span><span>Inviter <b>{money(referral.reward_amount)}</b></span></div></article>)}{!data.referrals.length && <p className="empty-state">No referral records yet.</p>}</div>
      </section>}
      {tab === "history" && <section><div className="credits-section-heading"><div><h3>Transaction history</h3><p className="muted">Latest {data.ledger.length} entries. Each reward, grant, spend, and refund has its own record.</p></div><label>Transaction type<select value={ledgerFilter} onChange={event => setLedgerFilter(event.target.value)}><option value="all">All transactions</option><option value="manual">Manual grants</option><option value="referral">Referral rewards</option><option value="refund">Refunds</option><option value="checkout">Checkout spending</option><option value="checkout_release">Restored credits</option></select></label></div><div className="credits-activity">{ledger.map(entry => <article key={entry.id}><div><span className="credits-entry-tag">{label(entry.kind)}</span><strong>{entry.customer_name || entry.user_email}</strong><span>{entry.user_email}</span><p>{entry.description}</p><small>{formatIST(entry.created_at)} · {entry.actor_email ? `By ${entry.actor_email}` : "Automatic"}{entry.order_id && ` · Order ${entry.order_id}`}</small></div><b className={entry.amount > 0 ? "credit-positive" : "credit-negative"}>{entry.amount > 0 ? "+" : "−"}{money(Math.abs(entry.amount))}</b></article>)}{!ledger.length && <p className="empty-state">No transactions match this view.</p>}</div></section>}
    </>}
  </section>;
}
