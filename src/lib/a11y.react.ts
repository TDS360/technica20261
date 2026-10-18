import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PREFS, loadDisplayPrefs, saveDisplayPrefs, applyDocumentPrefs } from './a11y';
import type { DisplayPrefs } from './a11y';

/**
 * Synchronized display preferences.
 *
 * Reads persisted preferences on mount, initializes unset values from OS
 * media queries, applies <html> data attributes so CSS can react, and
 * persists changes to localStorage (UI preferences only — no financial
 * data or credentials).
 */
export function useDisplayPrefs() {
  const [prefs, setPrefs] = useState<DisplayPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    const next = loadDisplayPrefs();
    setPrefs(next);
    applyDocumentPrefs(next);
  }, []);

  const update = useCallback(
    (patch: Partial<DisplayPrefs>) => {
      const next = { ...prefs, ...patch };
      setPrefs(next);
      saveDisplayPrefs(next);
      applyDocumentPrefs(next);
    },
    [prefs],
  );

  return { prefs, update };
}
