import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../return-lifecycle.css';

export function PrintableReturnLabel({details,onClose}) {
  const dialog=useRef(null);
  useEffect(()=>{const previous=document.activeElement;dialog.current.showModal();return()=>previous?.focus();},[]);
  return createPortal(<div className="return-label-portal"><dialog className="printable-return-label" ref={dialog} onCancel={onClose} aria-labelledby="return-label-title">
    <div className="return-label-controls"><button type="button" className="primary-action" onClick={()=>window.print()}>Print / save PDF</button><button type="button" className="secondary-action" onClick={onClose}>Close</button></div>
    <header><h2 id="return-label-title">Glamia return label</h2><p>Order {details.order_number} · Request {details.request_id}</p></header>
    <section><h3>From customer</h3><p>{details.customer_name}</p><p>{details.customer_address}</p></section>
    <section><h3>Return to warehouse</h3><p>{details.warehouse_address}</p></section>
    <section><h3>Courier</h3><p>{details.courier_name}</p><h3>Tracking number</h3><strong>{details.tracking_number}</strong></section>
    <div className="return-barcode-placeholder">Barcode / QR placeholder — not scannable</div>
    <p>Manual return label. Courier booking must be arranged separately.</p>
  </dialog></div>,document.body);
}
