import React from "react";

export class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Glamia React surface failed to render", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="page-main error-page">
        <section className="error-panel" role="alert" aria-labelledby="error-title">
          <p className="eyebrow">A brief interruption</p>
          <h1 id="error-title" className="page-title">This edit needs<br /><em>another moment.</em></h1>
          <p className="muted">The page could not finish loading. Your account, cart, and saved preferences are still safe.</p>
          <button className="primary-action" type="button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </section>
      </main>
    );
  }
}
