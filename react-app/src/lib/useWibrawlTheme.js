import { useEffect, useRef, useState } from 'react';
import { preferredWibrawlTheme } from '../../../src/storefront-identity.js';

function savedTheme() {
  try { return localStorage.getItem('wibrawl-theme'); } catch { return null; }
}

export function useWibrawlTheme() {
  const explicitChoice = useRef(savedTheme());
  const [theme, setTheme] = useState(() => preferredWibrawlTheme(savedTheme(), window.matchMedia?.('(prefers-color-scheme: dark)').matches));
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setTheme(preferredWibrawlTheme(explicitChoice.current, media.matches));
    const syncStorage = event => { if (event.key === 'wibrawl-theme' || event.key === null) { explicitChoice.current = savedTheme(); sync(); } };
    media.addEventListener('change', sync);
    window.addEventListener('storage', syncStorage);
    return () => { media.removeEventListener('change', sync); window.removeEventListener('storage', syncStorage); };
  }, []);
  function chooseTheme(value) {
    if (value !== 'gaming' && value !== 'sports') return;
    explicitChoice.current = value;
    // Only an explicit choice is persisted. Until then, follow the device theme.
    try { localStorage.setItem('wibrawl-theme', value); } catch { /* The choice still works for this visit. */ }
    setTheme(value);
  }
  return [theme, chooseTheme];
}
