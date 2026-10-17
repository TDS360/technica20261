/**
 * SignalZero accessibility utilities.
 *
 * Focus trapping, polite live announcements, and persisted display
 * preferences (text size, contrast, reduced motion). Nothing here stores
 * financial data or credentials — only UI display preferences.
 */
export type TextSize = 'default' | 'larger';
export type Contrast = 'standard' | 'high';
export type ReducedMotion = 'default' | 'reduce';

export interface DisplayPrefs {
  textSize: TextSize;
  contrast: Contrast;
  reducedMotion: ReducedMotion;
}

export const DEFAULT_PREFS: DisplayPrefs = {
  textSize: 'default',
  contrast: 'standard',
  reducedMotion: 'default',
};

const STORAGE_KEY = 'signalzero_display_prefs';

export function loadDisplayPrefs(): DisplayPrefs {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return systemPrefs();
    const parsed = JSON.parse(raw) as Partial<DisplayPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function systemPrefs(): DisplayPrefs {
  if (typeof window === 'undefined' || !window.matchMedia) return DEFAULT_PREFS;
  return {
    textSize: 'default',
    contrast: window.matchMedia('(prefers-contrast: high)').matches ? 'high' : 'standard',
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'default',
  };
}

export function saveDisplayPrefs(prefs: DisplayPrefs): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage disabled; preferences still apply for this session.
  }
}

export function applyDocumentPrefs(prefs: DisplayPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.szTextSize = prefs.textSize;
  root.dataset.szContrast = prefs.contrast;
  root.dataset.szReducedMotion = prefs.reducedMotion;
}
