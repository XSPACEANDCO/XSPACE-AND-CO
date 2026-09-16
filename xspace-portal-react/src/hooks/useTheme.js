import { useCallback, useEffect, useState } from 'react';
import { KEYS, getRaw, setRaw } from '../lib/storage';

/* Mirrors the original theme toggles: the choice lives in localStorage under
   xspace_theme and is published as <html data-theme="light|dark">.

   Each page's stylesheet only overrides the theme it isn't authored in — the
   login page ships light and overrides [data-theme="dark"], the dashboard
   ships dark and overrides [data-theme="light"] — so writing the literal value
   reproduces both behaviours from one hook. `fallback` keeps each page's
   original default for a first-time visitor. */
export function useTheme(fallback = 'dark') {
  const [theme, setTheme] = useState(() => getRaw(KEYS.theme) || fallback);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    setRaw(KEYS.theme, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return [theme, toggle, setTheme];
}
