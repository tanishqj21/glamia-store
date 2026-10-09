import '../return-lifecycle.css';
/** @param {{order: import('../types/orders').Order}} props */
export function ReplacementOrderBadge({order}) {
  if(!order.isReplacement&&!order.is_replacement&&order.order_type!=='replacement')return null;
  return <span className="status-pill replacement-order-badge">Replacement Order (₹0)</span>;
}

export function OrderDetails({order,onNavigate,admin=false}) {
  if(!order.isReplacement&&!order.is_replacement&&order.order_type!=='replacement')return null;
  const original=order.originalOrderId||order.original_order_id||order.replacement_for_order_id;
  return <section className="replacement-order-details" aria-label="Replacement order details">
    <ReplacementOrderBadge order={order}/>
    <dl><div><dt>Subtotal</dt><dd>₹0.00</dd></div><div><dt>Tax</dt><dd>₹0.00</dd></div><div><dt>Shipping</dt><dd>₹0.00</dd></div><div><dt>Grand total</dt><dd>₹0.00</dd></div></dl>
    {original&&<button type="button" className="secondary-action" onClick={()=>onNavigate(`${admin?'/admin/orders':'/orders'}?order=${encodeURIComponent(original)}#order-${encodeURIComponent(original)}`)}>View original order</button>}
    <p className="form-hint">No payment is required. {order.replacement_fulfilment_mode==='immediate'?'Your replacement follows normal packing and delivery. Care arranges the original item’s return pickup separately.':'This earlier replacement remains held until the original return is received.'}</p>
  </section>;
}
