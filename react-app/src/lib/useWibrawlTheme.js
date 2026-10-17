import { useEffect, useRef, useState } from 'react';
import { preferredWibrawlTheme } from '../../../src/storefront-identity.js';

function savedTheme() {
  try { const value = localStorage.getItem('wibrawl-theme'); return value === 'dark' ? 'gaming' : value === 'light' ? 'sports' : value; } catch { return null; }
}

export function useWibrawlTheme(hydrating = false) {
  const explicitChoice = useRef(savedTheme());
  // Match the public HTML before restoring the visitor's private preference.
  const [theme, setTheme] = useState(() => hydrating ? 'sports' : preferredWibrawlTheme(savedTheme(), window.matchMedia?.('(prefers-color-scheme: dark)').matches));
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setTheme(preferredWibrawlTheme(explicitChoice.current, media.matches));
    sync();
    const syncStorage = event => { if (event.key === 'wibrawl-theme' || event.key === null) { explicitChoice.current = savedTheme(); sync(); } };
    media.addEventListener('change', sync);
    window.addEventListener('storage', syncStorage);
    return () => { media.removeEventListener('change', sync); window.removeEventListener('storage', syncStorage); };
  }, []);
  function chooseTheme(value) {
    if (value !== 'gaming' && value !== 'sports') return;
    explicitChoice.current = value;
    // Only an explicit choice is persisted. Until then, follow the device theme.
    try { localStorage.setItem('wibrawl-theme', value === 'gaming' ? 'dark' : 'light'); } catch { /* The choice still works for this visit. */ }
    setTheme(value);
  }
  return [theme, chooseTheme];
}
