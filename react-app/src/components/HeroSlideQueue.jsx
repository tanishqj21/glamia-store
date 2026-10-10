import React, { useRef, useState } from 'react';

// Pointer capture makes the same drag handle work with a mouse, pen, or touch.
// The keyboard handle moves one place at a time without a separate ordering UI.
export function HeroSlideQueue({ slides, busy, previewIndex, onPreview, onReorder, onVisibility, onEdit, onDelete, kind = "hero" }) {
  const isReel = kind === 'reel';
  const instructionsId = `${kind}-order-instructions`;
  const gesture = useRef(null);
  const [dragging, setDragging] = useState('');
  const [target, setTarget] = useState('');
  const instructions = 'Drag a handle to another slide. Top is first, bottom is last. On a focused handle, use the Up and Down keys. Changes save automatically.';
  function move(id, targetId) {
    const from = slides.findIndex(slide => slide.id === id);
    const to = slides.findIndex(slide => slide.id === targetId);
    if (busy || from < 0 || to < 0 || from === to) return;
    const ordered = [...slides];
    const [slide] = ordered.splice(from, 1);
    ordered.splice(to, 0, slide);
    onReorder(ordered);
  }
  function finish(event, cancelled = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null; setDragging(''); setTarget('');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled) move(current.id, current.target);
  }
  return <section className="hero-slide-queue" aria-label={isReel ? "Reel display order" : "Hero slide display order"} aria-busy={busy}>
    <div className="merch-section-heading"><div><p className="eyebrow">Display order</p><h3>{isReel ? "Arrange your reels" : "Arrange your carousel"}</h3></div><span>{slides.filter(slide => slide.active).length} shown</span></div>
    <p id={instructionsId} className="muted">{instructions}</p>
    {slides.length ? <ol className="merch-slide-list">{slides.map((slide, index) => <li key={slide.id} data-hero-slide-id={slide.id} className={`${isReel ? 'wb-reel-queue-row' : 'merch-slide-row hero-queue-row'} ${slide.active ? '' : 'is-draft'} ${previewIndex === index ? 'is-previewing' : ''} ${dragging === slide.id ? 'is-dragging' : ''} ${dragging && target === slide.id ? 'is-drop-target' : ''}`}>
      <button className="hero-drag-handle" type="button" disabled={busy} aria-label={`Reorder ${slide.title}`} aria-describedby={instructionsId}
        onKeyDown={event => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); move(slide.id, slides[index + (event.key === 'ArrowUp' ? -1 : 1)]?.id); } }}
        onPointerDown={event => { if (busy || event.button !== 0) return; event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); gesture.current = {id:slide.id,target:slide.id,pointerId:event.pointerId}; setDragging(slide.id); setTarget(slide.id); }}
        onPointerMove={event => { const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return; const row = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-hero-slide-id]'); if (row && event.currentTarget.closest('.hero-slide-queue').contains(row)) { current.target = row.dataset.heroSlideId; setTarget(current.target); } }}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}><span aria-hidden="true">⠿</span></button>
      <button type="button" className="hero-queue-preview" onClick={() => onPreview(index)} aria-label={`Preview ${slide.title}`}>
        {slide.frames?.[0]?.image && <img src={slide.frames[0].image} alt="" width="48" height="64" loading="lazy" />}
        <span className="merch-slide-copy"><strong>{index + 1}. {slide.title}</strong><small>{slide.storefront === 'wibrawl' ? slide.layout || 'poster' : 'Editorial'} · {slide.active ? 'Shown' : 'Hidden'}</small></span>
      </button>
      <label className="hero-queue-visibility"><input type="checkbox" checked={slide.active} disabled={busy} aria-label={`Show ${slide.title}`} onChange={event => onVisibility(slide, event.target.checked)} />Show</label>
      <div className="merch-slide-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => onEdit(slide)}>Edit</button>{onDelete && <button type="button" className="danger-action" disabled={busy} onClick={() => onDelete(slide)}>Delete</button>}</div>
    </li>)}</ol> : <p className="empty-state">Create a slide to start your carousel.</p>}
  </section>;
}
