import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { HeroSlideQueue } from './HeroSlideQueue';
import { WibrawlReels } from './WibrawlReels';

export function WibrawlReelStudio({ products }) {
  const [reels, setReels] = useState(null);
  const [selected, setSelected] = useState('filmstrip');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [previewTheme, setPreviewTheme] = useState('gaming');
  const eligible = useMemo(() => products.filter(product => product.status === 'live' && ['wibrawl', 'both'].includes(product.storefront_visibility || 'glamia')), [products]);
  const endpoint = '/api/admin/cinematic-reel?storefront=wibrawl';
  useEffect(() => {
    let active = true;
    apiFetch(endpoint).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Reels could not be loaded'); if (!Array.isArray(data.cinematic_reels)) throw new Error('Reel settings are unavailable. Reload to try again.'); if (active) { setReels(data.cinematic_reels); setDraft(data.cinematic_reels[0]); setSelected(data.cinematic_reels[0].id); } }).catch(error => active && setError(error.message));
    return () => { active = false; };
  }, []);
  async function persist(next) {
    const previous = reels;
    setReels(next);
    setBusy(true); setError(''); setStatus('');
    try {
      const response = await apiFetch(endpoint, { method: 'PUT', body: JSON.stringify({ cinematic_reels: next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Reels could not be saved');
      setReels(data.cinematic_reels); setDraft(data.cinematic_reels.find(reel => reel.id === selected) || data.cinematic_reels[0]);
      setStatus('Wibrawl reels saved.');
    } catch (error) { setReels(previous); setError(error.message); } finally { setBusy(false); }
  }
  function choose(reel) { if (busy) return; setSelected(reel.id); setDraft(reel); setError(''); setStatus(''); }
  if (!reels || !draft) return <section className="admin-panel admin-wide-panel"><h2>Cinematic Reel Studio</h2><p role="status" className={error ? 'inline-error' : 'muted'}>{error || 'Loading Wibrawl reels…'}</p></section>;
  const queue = reels.map(reel => ({ ...reel, active: reel.visible, storefront: 'wibrawl', title: reel.layout.charAt(0).toUpperCase() + reel.layout.slice(1) }));
  return <section className="admin-panel admin-wide-panel merch-workspace cinematic-reel-studio wibrawl-reel-studio" aria-busy={busy}>
    <div className="admin-panel-heading"><div><p className="eyebrow">Domain specific · Wibrawl</p><h2>Cinematic Reel Studio</h2><p className="muted">Show any one, two, or all three reels. Drag to choose their order. Glamia has its own reel settings.</p></div></div>
    {(error || status) && <p role="status" className={`reel-studio-feedback ${error ? 'inline-error' : 'inline-note'}`}>{error || status}</p>}
    <div className="merch-preview-dock wibrawl-admin-preview" data-preview-theme={previewTheme}><div className="merch-preview-heading"><strong>{draft.layout} preview</strong><label>Reel preview theme <select value={previewTheme} onChange={event => setPreviewTheme(event.target.value)}><option value="gaming">Gaming</option><option value="sports">Sports</option></select></label><span>{draft.visible ? 'Shown on homepage' : 'Hidden on homepage · preview only'}</span></div><WibrawlReels reels={[draft]} products={eligible} preview /><p className="form-hint">Product links in this preview open their product page.</p>{!eligible.length && <p className="muted">Add a live Wibrawl product with an image to preview this reel.</p>}</div>
    <HeroSlideQueue kind="reel" slides={queue} busy={busy} previewIndex={reels.findIndex(reel => reel.id === selected)} onPreview={index => choose(reels[index])} onEdit={item => choose(reels.find(reel => reel.id === item.id))} onReorder={items => persist(items.map(item => reels.find(reel => reel.id === item.id)))} onVisibility={(item, visible) => persist(reels.map(reel => reel.id === item.id ? { ...reel, visible } : reel))} />
    <form className="merch-form" onSubmit={event => { event.preventDefault(); persist(reels.map(reel => reel.id === selected ? draft : reel)); }}>
      <fieldset className="settings-react-block" disabled={busy}><legend>Edit {draft.layout}</legend><label className="merch-checkbox"><input type="checkbox" checked={draft.visible} onChange={event => setDraft({ ...draft, visible: event.target.checked })} />Show this reel on Wibrawl</label><div className="merch-form-grid">{[['eyebrow', 'Eyebrow', 70], ['title', 'Reel headline', 100], ['emphasis', 'Reel emphasis', 100], ['description', 'Reel description', 180]].map(([field, label, max]) => <label className="field" key={field}><span>{label}</span><input value={draft[field]} maxLength={max} required={field === 'title'} onChange={event => setDraft({ ...draft, [field]: event.target.value })} /></label>)}</div>
      <div className="merch-section-heading"><h3>Reel products · up to 8</h3><button type="button" className="secondary-action" disabled={!draft.product_ids.length} onClick={() => setDraft({ ...draft, product_ids: [] })}>Use automatic selection</button></div><p className="form-hint">Empty selection automatically uses live Wibrawl and shared products. Manual selection follows the order you check them.</p><div className="merch-product-options">{eligible.map(product => <label className="merch-product-option" key={product.id}><input type="checkbox" checked={draft.product_ids.includes(product.id)} disabled={!draft.product_ids.includes(product.id) && draft.product_ids.length >= 8} onChange={() => setDraft({ ...draft, product_ids: draft.product_ids.includes(product.id) ? draft.product_ids.filter(id => id !== product.id) : [...draft.product_ids, product.id] })} /><span><img src={product.thumbnail_url || product.image_url} alt="" loading="lazy" /><strong>{product.name}</strong></span></label>)}</div>
      <div className="form-actions"><button className="primary-action" type="submit">{busy ? 'Saving…' : 'Save reel'}</button></div></fieldset>
    </form>
  </section>;
}
