import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FileText, X } from 'lucide-react';
import type { Alert, InvestigationDetail } from '@/lib/signalzero';
import { SeverityBadge, StatusBadge, formatDate, formatMoney } from './helpers';
import { focusTrap, announce } from '@/lib/a11y';

/**
 * Base accessible dialog behavior shared by both modals:
 * traps focus while mounted, returns focus to the trigger on unmount,
 * and closes on Escape.
 */
function useDialogFocus(onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const cleanup = focusTrap(dialog, returnTo.current);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      cleanup();
    };
  }, [onClose]);

  return dialogRef;
}

export function ReportModal(p: {
  alert: Alert; detail: InvestigationDetail | null;
  source: string; onClose: () => void;
}) {
  const { alert, detail } = p;
  const txn = detail?.transaction;
  const dialogRef = useDialogFocus(p.onClose);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Investigation report">
      <div className="report-modal" ref={dialogRef}>
        <div className="report-toolbar">
          <h2 id="report-title" style={{ margin: 0, fontSize: '1rem' }}>
            Investigation report
          </h2>
          <div>
            <button className="button button-primary" onClick={() => window.print()}>
              <FileText size={16} aria-hidden="true" /> Download PDF
            </button>
            <button className="icon-button" onClick={p.onClose} aria-label="Close report">
              <X size={16} />
            </button>
          </div>
        </div>
        <article className="print-report">
          <div className="report-kicker">SIGNALZERO · INVESTIGATION REPORT</div>
          <h1 id="report-alert">{alert.id}</h1>
          <p className="report-lead">Review record · Generated {formatDate(new Date().toISOString())} · A flagged transaction is not proof of fraud.</p>
          <div className="report-status-row"><SeverityBadge severity={alert.severity} /><StatusBadge status={alert.status} /><span>Source: {p.source}</span></div>
          <div className="report-rule"><span>Detection rule</span><strong>{alert.rule ?? alert.type}</strong><p>{alert.reason}</p></div>
          <div className="report-two-col">
            <div><span className="section-label">Transaction details</span>
              <dl>
                <dt>Transaction ID</dt><dd>{txn?.id ?? alert.transactionId}</dd>
                <dt>Merchant</dt><dd>{txn?.merchant ?? 'Not provided'}</dd>
                <dt>Amount</dt><dd>{txn ? formatMoney(txn.amount) : 'Not provided'}</dd>
                <dt>Date</dt><dd>{txn ? formatDate(txn.date) : 'Not provided'}</dd>
              </dl>
            </div>
            <div><span className="section-label">Supporting evidence</span>
              <ul className="report-evidence">{alert.evidence.map((item) => <li key={item.id}><strong>{item.label}</strong><span>{item.description}</span></li>)}</ul>
            </div>
          </div>
          {alert.feedback && (
            <div className="report-next"><span className="section-label">User feedback</span>
              <p>{alert.feedback.response}{alert.feedback.note ? ` — ${alert.feedback.note}` : ''}</p>
            </div>
          )}
          <div className="report-next"><span className="section-label">Recommended next steps</span>
            <p>Review the supplied evidence and record the next status only when the review outcome is known.</p>
          </div>
        </article>
      </div>
    </div>
  );
}

export function AddDataModal(p: {
  saving: boolean; onClose: () => void;
  onSave: (v: { amount: number; date: string; merchant: string; description: string; accountId: string }) => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [merchant, setMerchant] = useState('');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; date?: string; merchant?: string }>({});
  const dialogRef = useDialogFocus(p.onClose);

  const validate = useCallback(() => {
    const next: { amount?: string; date?: string; merchant?: string } = {};
    const amt = Number(amount);
    if (!amount.trim()) next.amount = 'Enter an amount.';
    else if (!Number.isFinite(amt) || amt < 0) next.amount = 'Enter a valid amount of zero or more.';
    if (!date.trim()) next.date = 'Enter a date and time.';
    if (!merchant.trim()) next.merchant = 'Enter a merchant name.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [amount, date, merchant]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const amt = Number(amount);
    p.onSave({ amount: amt, date: new Date(date).toISOString(), merchant, description, accountId });
  };

  const firstErrorId = useCallback(() => {
    if (errors.amount) return 'add-data-amount';
    if (errors.date) return 'add-data-date';
    if (errors.merchant) return 'add-data-merchant';
    return null;
  }, [errors]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add test transaction">
      <div className="data-modal" ref={dialogRef}>
        <div className="report-toolbar">
          <h2 id="add-data-title" style={{ margin: 0, fontSize: '1rem' }}>
            Add test transaction (runs real detection)
          </h2>
          <button className="icon-button" onClick={p.onClose} aria-label="Close form">
            <X size={18} />
          </button>
        </div>
        <form className="data-form" onSubmit={submit}>
          <div className="form-section">
            <div className="section-label">Transaction details</div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="add-data-amount">
                  Amount <span className="req" aria-hidden="true">(required)</span>
                </label>
                <input
                  id="add-data-amount"
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  aria-invalid={!!errors.amount}
                  aria-errormessage={errors.amount ? 'add-data-amount-error' : undefined}
                />
                {errors.amount && (
                  <div id="add-data-amount-error" className="form-error" role="alert">
                    {errors.amount}
                  </div>
                )}
              </div>
              <div className="form-field">
                <label htmlFor="add-data-date">
                  Date and time <span className="req" aria-hidden="true">(required)</span>
                </label>
                <input
                  id="add-data-date"
                  required
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-invalid={!!errors.date}
                  aria-errormessage={errors.date ? 'add-data-date-error' : undefined}
                />
                {errors.date && (
                  <div id="add-data-date-error" className="form-error" role="alert">
                    {errors.date}
                  </div>
                )}
              </div>
              <div className="form-field">
                <label htmlFor="add-data-merchant">
                  Merchant <span className="req" aria-hidden="true">(required)</span>
                </label>
                <input
                  id="add-data-merchant"
                  required
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="Merchant name"
                  aria-invalid={!!errors.merchant}
                  aria-errormessage={errors.merchant ? 'add-data-merchant-error' : undefined}
                />
                {errors.merchant && (
                  <div id="add-data-merchant-error" className="form-error" role="alert">
                    {errors.merchant}
                  </div>
                )}
              </div>
              <div className="form-field">
                <label htmlFor="add-data-account">Account key</label>
                <input
                  id="add-data-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="e.g. manual-test"
                />
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="add-data-description">Description</label>
              <textarea
                id="add-data-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What was this for?"
                rows={2}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="button button-secondary" onClick={p.onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={p.saving} aria-busy={p.saving}>
              {p.saving ? 'Saving...' : 'Save and analyze'}
            </button>
            {Object.keys(errors).length > 0 && (
              <button type="button" className="button button-secondary" onClick={() => {
                const id = firstErrorId();
                if (id) document.getElementById(id)?.focus();
                announce(`Please fix ${Object.keys(errors).length} error(s) before saving.`);
              }}>
                Go to first error
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
