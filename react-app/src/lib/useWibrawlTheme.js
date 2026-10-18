import { useEffect, useRef, useState } from 'react';

function savedTheme() {
  try { const value = localStorage.getItem('wibrawl_mode') || localStorage.getItem('wibrawl-theme'); return value === 'dark' ? 'gaming' : value === 'light' ? 'sports' : value; } catch { return null; }
}

export function useWibrawlTheme(hydrating = false, enabled = true) {
  const explicitChoice = useRef(savedTheme());
  // Match the public HTML before restoring the visitor's private preference.
  const [theme, setTheme] = useState(() => hydrating ? 'gaming' : savedTheme() === 'sports' ? 'sports' : 'gaming');
  useEffect(() => {
    if (!enabled) return;
    const sync = () => setTheme(explicitChoice.current === 'sports' ? 'sports' : 'gaming');
    sync();
    try { localStorage.setItem('wibrawl_mode', explicitChoice.current === 'sports' ? 'sports' : 'gaming'); } catch { /* The default still works for this visit. */ }
    const syncStorage = event => { if (event.key === 'wibrawl_mode' || event.key === 'wibrawl-theme' || event.key === null) { explicitChoice.current = savedTheme(); sync(); } };
    window.addEventListener('storage', syncStorage);
    return () => window.removeEventListener('storage', syncStorage);
  }, [enabled]);
  function chooseTheme(value) {
    if (value !== 'gaming' && value !== 'sports') return;
    explicitChoice.current = value;
    try { localStorage.setItem('wibrawl_mode', value); localStorage.setItem('wibrawl-theme', value === 'gaming' ? 'dark' : 'light'); } catch { /* The choice still works for this visit. */ }
    setTheme(value);
  }
  return [theme, chooseTheme];
}
