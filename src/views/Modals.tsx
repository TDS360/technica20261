import { useState } from 'react';
import type { FormEvent } from 'react';
import { FileText, X } from 'lucide-react';
import type { Alert, InvestigationDetail } from '@/lib/signalzero';
import { SeverityBadge, StatusBadge, formatDate, formatMoney } from './helpers';

export function ReportModal(p: {
  alert: Alert; detail: InvestigationDetail | null;
  source: string; onClose: () => void;
}) {
  const { alert, detail } = p;
  const txn = detail?.transaction;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Investigation report"><div className="report-modal"><div className="report-toolbar"><span>Report preview</span><div><button className="button button-primary" onClick={() => window.print()}><FileText size={16} />Download PDF</button><button className="icon-button" onClick={p.onClose} aria-label="Close report"><X size={16} /></button></div></div>
    <article className="print-report"><div className="report-kicker">SIGNALZERO · INVESTIGATION REPORT</div><h1>{alert.id}</h1><p className="report-lead">Review record · Generated {formatDate(new Date().toISOString())} · A flagged transaction is not proof of fraud.</p>
      <div className="report-status-row"><SeverityBadge severity={alert.severity} /><StatusBadge status={alert.status} /><span>Source: {p.source}</span></div>
      <div className="report-rule"><span>Detection rule</span><strong>{alert.rule ?? alert.type}</strong><p>{alert.reason}</p></div>
      <div className="report-two-col"><div><span className="section-label">Transaction details</span><dl><dt>Transaction ID</dt><dd>{txn?.id ?? alert.transactionId}</dd><dt>Merchant</dt><dd>{txn?.merchant ?? 'Not provided'}</dd><dt>Amount</dt><dd>{txn ? formatMoney(txn.amount) : 'Not provided'}</dd><dt>Date</dt><dd>{txn ? formatDate(txn.date) : 'Not provided'}</dd></dl></div>
        <div><span className="section-label">Supporting evidence</span><ul className="report-evidence">{alert.evidence.map((item) => <li key={item.id}><strong>{item.label}</strong><span>{item.description}</span></li>)}</ul></div></div>
      {alert.feedback && <div className="report-next"><span className="section-label">User feedback</span><p>{alert.feedback.response}{alert.feedback.note ? ` — ${alert.feedback.note}` : ''}</p></div>}
      <div className="report-next"><span className="section-label">Recommended next steps</span><p>Review the supplied evidence and record the next status only when the review outcome is known.</p></div>
    </article></div></div>;
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
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0 || !date) return;
    p.onSave({ amount: amt, date: new Date(date).toISOString(), merchant, description, accountId });
  };
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add test transaction"><div className="data-modal"><div className="report-toolbar"><span>Add test transaction (runs real detection)</span><button className="icon-button" onClick={p.onClose} aria-label="Close form"><X size={18} /></button></div>
    <form className="data-form" onSubmit={submit}><div className="form-section"><div className="section-label">Transaction details</div><div className="form-grid"><label>Amount<input required min="0" step="0.01" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label><label>Date and time<input required type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Merchant<input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant name" /></label><label>Account key<input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="e.g. manual-test" /></label></div><label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" rows={2} /></label></div>
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={p.onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={p.saving}>{p.saving ? 'Saving...' : 'Save and analyze'}</button></div></form></div></div>;
}
