import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

function statusLabel(offer) {
  const destinations = offer.status?.destinationStatuses || [];
  const free = destinations.find(item => item.reportingContext === 'FREE_LISTINGS');
  if (!free) return 'Submitted · Google processing';
  if (free.approvedCountries?.includes('IN')) return 'Approved in India';
  if (free.disapprovedCountries?.includes('IN')) return 'Needs attention';
  return 'Pending Google review';
}

export default function MerchantSyncView() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState('');
  const [metadata, setMetadata] = useState('{}');
  async function load() {
    try {
      const response = await apiFetch('/api/admin/google-merchant');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load Google product sync');
      setData(result);
    } catch (error) { setMessage(error.message); }
  }
  useEffect(() => { const start = setTimeout(() => { void load(); }, 0); const timer = setInterval(() => { void load(); }, 30000); return () => { clearTimeout(start); clearInterval(timer); }; }, []);
  async function action(path, body = '{}', method = 'POST') {
    setBusy(true); setMessage('');
    try {
      const response = await apiFetch(`/api/admin/google-merchant${path}`, { method, body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Google product sync request failed');
      setMessage(result.gcpIds ? 'Google project registered. Allow up to five minutes, then check the connection.' : result.connected ? 'Google connection verified.' : result.saved ? 'Product details saved and queued for Google.' : result.enabled ? 'Live products queued. Sync is running.' : 'Products queued. Finish the Google connection to enable sync.');
      await load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <section aria-labelledby="merchant-sync-heading">
    <div className="system-email-heading"><div><p className="eyebrow">Google free listings</p><h3 id="merchant-sync-heading">Merchant Center product sync</h3></div><button className="secondary-action" onClick={load} disabled={busy}>Refresh</button></div>
    <p className="muted">Published products sync automatically, including each size, price and stock changes. Google reviews products before showing them.</p>
    {message && <p className="inline-note" role="status">{message}</p>}
    <div className="system-health-grid">
      <article className="system-health-tile"><span>Connection</span><strong>{!data ? 'Loading…' : data.configured && data.enabled ? 'Enabled' : 'Setup needed'}</strong><small>{data?.missing?.join(', ') || `Merchant account ${data?.account || '—'}`}</small></article>
      <article className="system-health-tile"><span>Pending products</span><strong>{data?.queued ?? '—'}</strong><small>Failed submissions retry automatically</small></article>
      <article className="system-health-tile"><span>Submitted variants</span><strong>{data?.submitted ?? '—'}</strong><small>Submission is followed by Google review</small></article>
    </div>
    {data?.control?.last_error && <p className="inline-error">{data.control.last_error}</p>}
    <div className="system-actions"><button className="secondary-action" disabled={busy || !data?.configured} onClick={() => action('/verify')}>Check Google connection</button><button className="secondary-action" disabled={busy} onClick={() => action('/sync')}>Sync all live products</button><a className="secondary-action" href={`https://merchants.google.com/mc/products?a=${data?.account || '5859812746'}`} target="_blank" rel="noreferrer">Open Merchant Center </a></div>
    <div className="system-list">{data?.failures?.map(row => <article className="system-row" key={row.product_id}><div className="system-row-main"><strong>{row.name || 'Removed product'}</strong><small>{row.product_id}</small><span className="error-text">{row.last_error}</span></div></article>)}</div>
    <div className="system-list">{data?.offers?.map(offer => <article className="system-row" key={offer.offer_id}><div className="system-row-main"><strong>{offer.name || offer.product_id}</strong><span>{statusLabel(offer)}</span>{offer.status?.itemLevelIssues?.map((item, index) => <small key={index}>{item.description || item.code}{item.detail ? ` — ${item.detail}` : ''}</small>)}</div></article>)}</div>
    <details><summary>Product details for Google</summary><p className="muted">Use real manufacturer identifiers. GTINs map sizes to barcodes, for example {`{"gtins":{"M":"actual barcode"}}`}. Mark identifierExists as false only when the manufacturer has assigned no identifiers. Saving replaces these optional details.</p><label>Product ID<input value={productId} onChange={event => setProductId(event.target.value)} /></label><label>Google product details (JSON)<textarea rows={6} value={metadata} onChange={event => setMetadata(event.target.value)} /></label><button className="secondary-action" disabled={busy || !productId.trim()} onClick={() => action(`/details/${encodeURIComponent(productId.trim())}`, metadata, 'PUT')}>Save Google details</button></details>
    {!data?.enabled && <details><summary>One-time Google connection setup</summary><p className="muted">The owner can register the Google Cloud project after enabling Merchant API and giving the service account temporary Admin access in Merchant Center. Once registered, reduce that account to Standard access.</p><button className="secondary-action" disabled={busy || !data?.configured} onClick={() => action('/register')}>Register Google project</button></details>}
  </section>;
}
