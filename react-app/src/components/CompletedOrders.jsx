import { useCallback, useEffect, useState } from "react";
import { OrderYearSelect } from './OrderYearSelect';
import { groupOrdersByYear } from '../lib/orderYears';
import { apiFetch } from "../lib/api";
import { money, formatIST } from "../lib/commerce";
import { ReplacementOrderBadge } from "./OrderDetails";

function CompletedOrderRecord({ order, onNavigate }) {
  const replacement=order.is_replacement || order.order_type==='replacement';
  return <article><div>
    <p className="credits-entry-tag">{replacement?'Replacement delivered':'Payment completed'} · {formatIST(order.bill_issued_at||order.delivered_at||order.created_at)}</p>
    <h3>{order.order_number}</h3><ReplacementOrderBadge order={order}/>
    <p>{order.customer_name || "Customer"}<br/><span className="muted">{order.customer_email}</span></p>
    <p className="muted">{order.items.reduce((sum,item)=>sum+Number(item.quantity||1),0)} items · {replacement?'No payment required':order.payment_method.replaceAll('_',' ')}{!replacement&&order.credits_used>0&&order.payment_method!=='store_credit'?' + store credits':''}</p>
  </div><div className="completed-order-actions">
    <strong>{replacement?'₹0.00':money(order.total)}</strong>
    <span className={`status-pill status-${order.status}`}>{order.status}</span>
    {order.payment_status==='refunded'&&<span className="status-pill">Payment refunded</span>}
    <button type="button" className="secondary-action" onClick={()=>onNavigate(`/admin/orders?order=${encodeURIComponent(order.id)}`)}>View order</button>
    {replacement&&order.original_order_id&&<button type="button" className="secondary-action" onClick={()=>onNavigate(`/admin/orders?order=${encodeURIComponent(order.original_order_id)}`)}>View original order</button>}
    {order.bill_number&&<a className="secondary-action" href={`/api/orders/${encodeURIComponent(order.id)}/bill`} download>Download bill (PDF)</a>}
  </div></article>;
}

export function CompletedOrdersView({ onNavigate }) {
  const [year, setYear] = useState("all");
  const [data, setData] = useState(null), [query, setQuery] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await apiFetch(`/api/orders?scope=admin&completed=1&limit=30&page=${page}&q=${encodeURIComponent(search)}&year=${year}`, { cache: "no-store" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Completed orders could not be loaded");
      setData(next);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }, [page, search, year]);
  useEffect(() => { load(); }, [load]);
  return <section className="admin-panel admin-wide-panel completed-orders-panel"><header className="admin-panel-heading"><div><p className="eyebrow">Purchase history</p><h2>Completed orders</h2><p className="muted">Successful purchases with their original bills, and delivered ₹0 replacements linked to the original order. Fulfilment and refund statuses stay visible.</p></div><button type="button" className="secondary-action" onClick={() => onNavigate("/admin/orders")}>Manage active orders</button></header>
    <form className="completed-order-search" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}><OrderYearSelect value={year} years={data?.years || []} onChange={value => { setYear(value); setPage(1); }} disabled={busy} /><label>Find an order<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Order number, customer name, or email" /></label><button className="primary-action" disabled={busy}>Search</button><button className="secondary-action" type="button" disabled={busy} onClick={load}>Refresh</button></form>
    {error && <p className="inline-error" role="alert">{error}</p>}{busy ? <p role="status">Loading completed orders…</p> : <><p className="muted">{data?.pagination?.total || 0} completed records</p><div className="completed-order-list">{groupOrdersByYear(data?.orders || []).map(group => <section key={group.year} aria-label={`${group.year} completed orders`}><h3 className="orders-year-heading">{group.year}</h3>{group.orders.map(order => <CompletedOrderRecord key={order.id} order={order} onNavigate={onNavigate}/>)}</section>)}{!data?.orders?.length && <div className="empty-state"><strong>{search ? "No matching completed orders." : "Your first completed purchase will appear here."}</strong><p>Once payment succeeds, the order and its bill are saved automatically.</p></div>}</div><div className="completed-order-pagination"><button className="secondary-action" type="button" disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {data?.pagination?.pages || 1}</span><button className="secondary-action" type="button" disabled={!data?.pagination?.has_more || busy} onClick={() => setPage(value => value + 1)}>Next</button></div></>}
  </section>;
}
