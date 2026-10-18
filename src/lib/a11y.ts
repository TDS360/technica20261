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

const FOCUSABLE_SELECTOR =
  'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"]),details,summary';

/**
 * Trap Tab focus inside `container` while active. Returns a cleanup
 * function that restores focus to `returnTo` (or the previously focused
 * element) when the trap is released.
 */
export function focusTrap(container: HTMLElement, returnTo?: HTMLElement | null) {
  const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && !el.hidden && el.offsetParent !== null,
  );
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey) {
      if (document.activeElement === first || document.activeElement === container) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  container.addEventListener('keydown', onKeyDown);
  container.setAttribute('tabindex', '-1');
  container.focus();
  first?.focus();

  return () => {
    container.removeEventListener('keydown', onKeyDown);
    container.removeAttribute('tabindex');
    if (returnTo) returnTo.focus();
    else previouslyFocused?.focus();
  };
}

/* ------------------------------------------------------------------ */
/* Polite live region for announcements                               */
/* ------------------------------------------------------------------ */

let liveRegion: HTMLElement | null = null;

function ensureLiveRegion(): HTMLElement {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    liveRegion.style.position = 'absolute';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
  }
  return liveRegion;
}

/**
 * Announce a message to screen readers politely. Reserve for status /
 * sync / save outcomes — not every routine change.
 */
export function announce(message: string): void {
  if (!message || typeof document === 'undefined') return;
  const region = ensureLiveRegion();
  region.textContent = '';
  void region.offsetHeight;
  region.textContent = message;
}

/** Urgent announcement for genuinely urgent, time-critical situations. */
export function announceUrgent(message: string): void {
  if (!message || typeof document === 'undefined') return;
  const region = document.createElement('div');
  region.setAttribute('role', 'alert');
  region.setAttribute('aria-atomic', 'true');
  region.className = 'sr-only';
  document.body.appendChild(region);
  region.textContent = message;
  setTimeout(() => region.remove(), 1000);
}

