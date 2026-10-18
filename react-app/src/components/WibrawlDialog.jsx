import { useEffect, useId, useRef } from 'react';

// Native dialogs supply focus containment, inert background and Escape handling.
export function WibrawlDialog({ title, children, onClose, className = '' }) {
  const ref = useRef(null), id = useId();
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    ref.current.showModal(); document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={`wb-dialog ${className}`} aria-labelledby={id} onKeyDown={event => {
    if (event.target.closest('dialog') !== ref.current) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...ref.current.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(element => element.getClientRects().length && !element.closest('[hidden]'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={event => { if (event.target !== ref.current) return; event.preventDefault(); onClose(); }} onClick={event => {
    if (event.target !== ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}><header><h2 id={id}>{title}</h2><button type="button" className="wb-icon-action" onClick={onClose} aria-label={`Close ${title}`}>×</button></header>{children}</dialog>;
}
