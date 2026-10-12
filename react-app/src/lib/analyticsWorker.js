const library = '/analytics/partytown-1.0.0/';

// Tracking commands keep their existing queue and ordering. Only the provider's
// execution moves to a worker; unsupported/failed workers retain native tags.
export function appendAnalyticsTag(tag) {
  if (!window.isSecureContext || !navigator.serviceWorker) {
    document.head.appendChild(tag);
    return;
  }
  let queue = window.dataLayer || [];
  const nativeGtag = window.gtag;
  window.partytown = {
    ...window.partytown,
    lib: library,
    forward: [['gtag', { preserveBehavior: true }]],
  };
  tag.type = 'text/partytown';
  if (!document.querySelector('script[data-glamia-analytics-queue]')) {
    const initializeQueue = document.createElement('script');
    initializeQueue.type = 'text/partytown';
    initializeQueue.src = '/analytics/ga-queue.js';
    initializeQueue.dataset.glamiaAnalyticsQueue = 'true';
    document.head.appendChild(initializeQueue);
  }
  // Partytown deletes forwarded globals when it falls back to native scripts.
  // Restore queued commands before the async native provider executes, so
  // page views and consent/config commands survive a worker startup failure.
  const fallbackQueue = new MutationObserver(() => {
    if (!window.dataLayer) window.dataLayer = Array.from(queue);
    if (!window.gtag) window.gtag = nativeGtag;
    if (tag.type !== 'text/partytown') fallbackQueue.disconnect();
  });
  fallbackQueue.observe(tag, { attributes: true, attributeFilter: ['type'] });
  document.head.appendChild(tag);
  if (document.querySelector('script[data-glamia-analytics-worker]')) {
    document.dispatchEvent(new CustomEvent('ptupdate'));
    return;
  }
  const bootstrap = document.createElement('script');
  bootstrap.src = library + 'partytown.js';
  bootstrap.dataset.glamiaAnalyticsWorker = 'true';
  bootstrap.async = true;
  bootstrap.addEventListener('load', () => {
    // Commands issued before the forwarding shim loaded need one replay.
    // Later commands already entered Partytown's forwarding queue. Keep the
    // original main-thread queue intact for a possible native fallback.
    const snapshot = Array.from(window.dataLayer || []);
    const forwarded = (window._ptf || []).filter((value, index) => index % 2 === 0 && Array.isArray(value) && value[0] === 'gtag').length;
    for (const command of snapshot.slice(0, Math.max(0, snapshot.length - forwarded))) window.gtag(...Array.from(command));
    queue = snapshot;
    window.dataLayer = snapshot;
  }, { once: true });
  bootstrap.addEventListener('error', () => {
    fallbackQueue.disconnect();
    const nativeTag = document.createElement('script');
    nativeTag.src = tag.src;
    nativeTag.async = true;
    nativeTag.dataset.glamiaGoogleTag = 'true';
    tag.remove();
    document.querySelector('script[data-glamia-analytics-queue]')?.remove();
    document.head.appendChild(nativeTag);
  }, { once: true });
  document.head.appendChild(bootstrap);
}
