// Forwarded Arguments/Date objects lose their non-enumerable methods. Restore
// the Google tag's native command shape inside the worker before it loads.
window.dataLayer = document.currentScript?.type?.startsWith('text/partytown') ? [] : window.dataLayer || [];
window.gtag = function (...commands) {
  if (commands[0] === 'js' && typeof commands[1]?.getTime !== 'function') commands[1] = new Date();
  const args = (function () { return arguments; }).apply(null, commands);
  window.dataLayer.push(args);
};
