import React from 'react';
import { money, sellingPrice } from "../lib/commerce";

// Label the real selling price during a live event without inventing a discount.
export function SpecialPrice({ product, eventLive = false, className = "" }) {
  const price = sellingPrice(product);
  const hasDiscount = Number(product?.mrp) > price;
  return <div className={`product-price-display ${eventLive ? "is-event" : ""} ${className}`}>
    {eventLive && <span className="special-price-label"><span aria-hidden="true">✳</span> SPECIAL PRICE</span>}
    <span className="product-price-amount">{money(price)}{hasDiscount && <del>{money(product.mrp)}</del>}</span>
  </div>;
}
