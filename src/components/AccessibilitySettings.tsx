import { useCallback } from 'react';
import { X } from 'lucide-react';
import type { Contrast, DisplayPrefs, ReducedMotion, TextSize } from '@/lib/a11y';

interface AccessibilitySettingsProps {
  prefs: DisplayPrefs;
  onPrefsChange: (patch: Partial<DisplayPrefs>) => void;
  onClose: () => void;
}

const TEXT_SIZE_OPTIONS: { id: TextSize; label: string; description: string }[] = [
  {
    id: 'default',
    label: 'Default text size',
    description: 'Standard SignalZero text sizing.',
  },
  {
    id: 'larger',
    label: 'Larger text',
    description: 'Increases body text and key controls for easier reading.',
  },
];

const CONTRAST_OPTIONS: { id: Contrast; label: string; description: string }[] = [
  {
    id: 'standard',
    label: 'Standard SignalZero theme',
    description: 'The default deep-navy theme with cyan accents.',
  },
  {
    id: 'high',
    label: 'High contrast',
    description: 'Clearer text, borders, and interactive controls.',
  },
];

export function AccessibilitySettings(p: AccessibilitySettingsProps) {
  const { prefs, onPrefsChange, onClose } = p;

  const setTextSize = useCallback(
    (id: TextSize) => void onPrefsChange({ textSize: id }),
    [onPrefsChange],
  );
  const setContrast = useCallback(
    (id: Contrast) => void onPrefsChange({ contrast: id }),
    [onPrefsChange],
  );
  const toggleMotion = useCallback(() => {
    const next: ReducedMotion = prefs.reducedMotion === 'reduce' ? 'default' : 'reduce';
    void onPrefsChange({ reducedMotion: next });
  }, [prefs.reducedMotion, onPrefsChange]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Display &amp; accessibility settings">
      <div className="data-modal">
        <div className="report-toolbar">
          <h2 id="a11y-settings-title" className="sr-only-focusable" style={{ position: 'static', margin: 0 }}>
            Display &amp; accessibility settings
          </h2>
          <button className="icon-button" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>
        <div className="data-form" style={{ padding: '24px' }}>
          <p className="sr-only">
            Changes apply immediately and are remembered for your next visit. No financial data is stored.
          </p>
          <div className="form-field">
            <label>Text size</label>
            <div role="radiogroup" aria-label="Text size" aria-labelledby="a11y-settings-title">
              {TEXT_SIZE_OPTIONS.map((o) => (
                <label key={o.id} className="check-row" style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="a11y-text-size"
                    value={o.id}
                    checked={prefs.textSize === o.id}
                    onChange={() => setTextSize(o.id)}
                    aria-label={o.label}
                  />
                  <span style={{ flex: 1 }}>
                    <strong>{o.label}</strong>
                    <br />
                    <span style={{ fontSize: '11px', color: '#5f7488' }}>{o.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-field">
            <label>Display contrast</label>
            <div role="radiogroup" aria-label="Display contrast" aria-labelledby="a11y-settings-title">
              {CONTRAST_OPTIONS.map((o) => (
                <label key={o.id} className="check-row" style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="a11y-contrast"
                    value={o.id}
                    checked={prefs.contrast === o.id}
                    onChange={() => setContrast(o.id)}
                    aria-label={o.label}
                  />
                  <span style={{ flex: 1 }}>
                    <strong>{o.label}</strong>
                    <br />
                    <span style={{ fontSize: '11px', color: '#5f7488' }}>{o.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-field">
            <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={prefs.reducedMotion === 'reduce'}
                onChange={toggleMotion}
                aria-label="Reduce animation"
              />
              <span style={{ flex: 1 }}>
                <strong>Reduce animation</strong>
                <br />
                <span style={{ fontSize: '11px', color: '#5f7488' }}>
                  Minimizes nonessential motion. Also respects your operating
                  system's reduced-motion setting.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
