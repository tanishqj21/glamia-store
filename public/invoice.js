// External script keeps invoice printing compatible with the site's strict CSP.
document.getElementById('invoice-print')?.addEventListener('click', () => window.print());
