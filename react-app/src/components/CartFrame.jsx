import React from 'react';

// A stable title/layout survives the private cart being restored in the browser.
export function CartFrame({ children }) {
  return <main className="page-main"><section className="account-page cart-page">
    <p className="eyebrow">Your edit</p><h1 className="page-title">Shopping bag</h1>
    {children}
  </section></main>;
}

export function CartLoadingContent() {
  return <div className="empty-state" role="status" aria-busy="true">Loading your bag and saved items…</div>;
}

export function CartPendingPage() {
  return <CartFrame><CartLoadingContent /></CartFrame>;
}
