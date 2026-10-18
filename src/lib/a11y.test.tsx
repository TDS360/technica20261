import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEffect, useState } from 'react';
import * as axe from 'axe-core';
import { Activity } from 'lucide-react';
import { SeverityBadge, StatusBadge, MetricCard, EmptyState } from '@/views/helpers';
import { AccessibilitySettings } from '@/components/AccessibilitySettings';
import { AddDataModal } from '@/views/Modals';
import type { InvestigationStatus, AlertSeverity } from '@/lib/signalzero';
import { DEFAULT_PREFS, applyDocumentPrefs } from '@/lib/a11y';
import type { DisplayPrefs } from '@/lib/a11y';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

function PreferenceHarness() {
  const [prefs, setPrefs] = useState<DisplayPrefs>(DEFAULT_PREFS);
  useEffect(() => applyDocumentPrefs(prefs), [prefs]);
  const updatePrefs = (patch: Partial<DisplayPrefs>) =>
    setPrefs((current) => ({ ...current, ...patch }));
  return <AccessibilitySettings
    prefs={prefs}
    onPrefsChange={updatePrefs}
    onClose={vi.fn()}
  />;
}

describe('Severity badges (no color alone)', () => {
  it('renders text label for every severity', () => {
    const severities: AlertSeverity[] = ['low', 'medium', 'high', 'critical'];
    severities.forEach((s) => {
      const { container } = render(<SeverityBadge severity={s} />);
      const badge = container.querySelector('.badge')!;
      expect(badge.textContent).toContain('severity');
    });
  });
});

describe('Status badges', () => {
  it('renders text label for every status', () => {
    const statuses: InvestigationStatus[] = ['open', 'reviewing', 'resolved'];
    statuses.forEach((s) => {
      const { container } = render(<StatusBadge status={s} />);
      const badge = container.querySelector('.badge')!;
      expect(badge.textContent).toBe(s);
    });
  });
});

describe('Metric cards expose accessible names', () => {
  it('includes value and detail in aria-label', () => {
    const { container } = render(
      <MetricCard label="Suspicious alerts" value={42} detail="Engine findings" icon={Activity} tone="red" />
    );
    const card = container.querySelector('.metric-card')!;
    expect(card.getAttribute('aria-label')).toContain('Suspicious alerts');
    expect(card.getAttribute('aria-label')).toContain('42');
    expect(card.getAttribute('aria-label')).toContain('Engine findings');
  });
});

describe('Empty states', () => {
  it('renders title and body', () => {
    const { container } = render(<EmptyState title="No alerts" body="Try clearing a filter." />);
    expect(container.querySelector('strong')?.textContent).toBe('No alerts');
    expect(container.querySelector('span')?.textContent).toBe('Try clearing a filter.');
  });
});

describe('Accessibility settings apply document preferences', () => {
  beforeEach(() => {
    localStorageMock.clear();
    document.documentElement.removeAttribute('data-sz-text-size');
    document.documentElement.removeAttribute('data-sz-contrast');
    document.documentElement.removeAttribute('data-sz-reduced-motion');
  });

  it('applies larger text size attribute', () => {
    render(<PreferenceHarness />);
    const radio = screen.getByLabelText('Larger text');
    fireEvent.click(radio);
    expect(document.documentElement.dataset.szTextSize).toBe('larger');
  });

  it('applies high contrast attribute', () => {
    render(<PreferenceHarness />);
    const radio = screen.getByLabelText('High contrast');
    fireEvent.click(radio);
    expect(document.documentElement.dataset.szContrast).toBe('high');
  });

  it('toggles reduced motion attribute', () => {
    render(<PreferenceHarness />);
    const checkbox = screen.getByLabelText('Reduce animation');
    fireEvent.click(checkbox);
    expect(document.documentElement.dataset.szReducedMotion).toBe('reduce');
  });
});

describe('AddDataModal validation and focus', () => {
  it('shows specific validation errors and does not save', () => {
    const onSave = vi.fn();
    render(<AddDataModal saving={false} onClose={vi.fn()} onSave={onSave} />);
    const saveBtn = screen.getByRole('button', { name: /Save and analyze/ });
    fireEvent.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter an amount.')).toBeInTheDocument();
    expect(screen.getByText('Enter a date and time.')).toBeInTheDocument();
    expect(screen.getByText('Enter a merchant name.')).toBeInTheDocument();
  });

  it('saves valid data', () => {
    const onSave = vi.fn();
    render(<AddDataModal saving={false} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '42.50' } });
    fireEvent.change(screen.getByLabelText(/Date and time/), { target: { value: '2026-02-08T02:13' } });
    fireEvent.change(screen.getByLabelText(/Merchant/), { target: { value: 'Test Store' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and analyze/ }));
    expect(onSave).toHaveBeenCalledWith({
      amount: 42.5,
      date: expect.any(String),
      merchant: 'Test Store',
      description: '',
      accountId: '',
    });
  });
});

describe('axe-core automated checks on components', () => {
  it('passes axe on a badge', async () => {
    const { container } = render(<SeverityBadge severity="high" />);
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('passes axe on metric card', async () => {
    const { container } = render(<MetricCard label="Test" value={1} detail="x" icon={Activity} tone="cyan" />);
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
