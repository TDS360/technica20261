import { useState } from 'react';
import { BarChart3, Check, FileText, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { Alert, InvestigationDetail, InvestigationStatus } from '@/lib/signalzero';
import type { FeedbackResponse } from '@/lib/signalzero';
import { EmptyState, PageIntro, SeverityBadge, StatusBadge, formatDate, formatMoney } from './helpers';

export function InvestigationView(p: {
  detail: InvestigationDetail | null; loading: boolean; alerts: Alert[];
  selectedId: string | null; onSelect: (id: string) => void;
  onStatus: (s: InvestigationStatus) => void; savingStatus: boolean;
  onReport: (a: Alert) => void;
  onFeedback: (r: FeedbackResponse, note: string) => void;
  demoMode: boolean;
}) {
  const { detail, loading, alerts, selectedId } = p;
  const [fbNote, setFbNote] = useState('');
  if (loading) {
    return <div className="detail-loading"><div className="spinner" /><span>Loading evidence...</span></div>;
  }
  return <>
    <PageIntro eyebrow="Evidence workspace" title="Investigations" body="Inspect why a pattern was flagged, then record the next review state." />
    <div className="investigation-layout">
      <section className="panel investigation-list"><div className="panel-header"><div><h2>Cases</h2><p>{alerts.length} engine signals</p></div><SlidersHorizontal size={17} /></div>
        {alerts.length === 0 ? <EmptyState title="No cases" body="Sync a sandbox account to create investigations." /> : <div role="list" aria-label="Investigation cases">{alerts.map((a) => <button className={`case-row ${selectedId === a.id ? 'selected' : ''}`} key={a.id} role="listitem" aria-pressed={selectedId === a.id} onClick={() => p.onSelect(a.id)}><div><strong>{a.id}</strong><span>{a.type}</span></div><div><SeverityBadge severity={a.severity} /><StatusBadge status={a.status} /></div></button>)}</div>}
      </section>
      <section className="panel detail-panel">{!detail ? <EmptyState title="Select an investigation" body="Choose a case to inspect its evidence." /> : <DetailBody detail={detail} fbNote={fbNote} setFbNote={setFbNote} demoMode={p.demoMode} savingStatus={p.savingStatus} onStatus={p.onStatus} onReport={p.onReport} onFeedback={p.onFeedback} />}</section>
    </div>
  </>;
}

function DetailBody(p: {
  detail: InvestigationDetail; fbNote: string; setFbNote: (v: string) => void;
  demoMode: boolean; savingStatus: boolean;
  onStatus: (s: InvestigationStatus) => void;
  onReport: (a: Alert) => void;
  onFeedback: (r: FeedbackResponse, note: string) => void;
}) {
  const { detail } = p;
  return <>
    <div className="detail-header"><div><div className="eyebrow">Investigation {detail.alert.id}</div><h2>{detail.alert.type}</h2><p>{detail.alert.reason}</p></div><div className="detail-actions"><StatusBadge status={detail.alert.status} /><button className="button button-secondary" onClick={() => p.onReport(detail.alert)}><FileText size={16} />Generate report</button></div></div>
    <div className="detail-section"><div className="section-label">Transaction</div><div className="transaction-card"><dl><dt>Merchant</dt><dd>{detail.transaction.merchant ?? 'Merchant unavailable'}</dd><dt>Amount</dt><dd>{formatMoney(detail.transaction.amount)}</dd></dl></div>
      <div className="facts-grid"><dl><dt>ID</dt><dd>{detail.transaction.id}</dd><dt>Date</dt><dd>{formatDate(detail.transaction.date)}</dd><dt>Account</dt><dd>{detail.transaction.accountId ?? '-'}</dd><dt>Rule</dt><dd>{detail.alert.rule ?? detail.alert.type}</dd></dl></div></div>
    <div className="detail-section"><div className="section-label">Supporting evidence</div><div className="evidence-list">{detail.alert.evidence.map((item) => <div className="evidence-card" key={item.id}><div className="evidence-icon"><ShieldCheck size={15} aria-hidden="true" /></div><div><strong>{item.label}</strong><span>{item.description}</span></div></div>)}</div></div>
    {detail.baseline && <div className="detail-section"><div className="section-label">Personal spending baseline</div><div className="evidence-card"><div className="evidence-icon"><BarChart3 size={15} /></div><div><strong>{detail.baseline.insufficient ? 'Insufficient history' : `Median ${formatMoney(detail.baseline.median ?? 0)} across ${detail.baseline.sampleSize} prior`}</strong><span>{detail.baseline.explanation}</span></div></div></div>}
    <div className="detail-section"><div className="section-label">Fraud storyline · Related activity</div>
      {detail.relatedActivity.length === 0 ? <EmptyState title="No related activity" body="No same-merchant or same-account events found." /> : <div className="timeline">{detail.relatedActivity.map((ev) => <div className="timeline-item" key={`${ev.kind}-${ev.id}`}><span className="timeline-dot" aria-hidden="true" /><div><strong>{ev.kind === 'alert' ? ev.alertType ?? ev.id : ev.merchant ?? ev.id}</strong><span>{formatDate(ev.date)}{ev.amount !== undefined ? ` · ${formatMoney(ev.amount)}` : ''}</span><span className="table-sub">{ev.relation}</span></div></div>)}</div>}
      <p className="table-sub">Related activity is context, not proof of fraud.</p></div>
    <div className="detail-section"><div className="section-label">Guided response</div><GuidedResponse detail={detail} fbNote={p.fbNote} setFbNote={p.setFbNote} demoMode={p.demoMode} onFeedback={p.onFeedback} /></div>
    <div className="detail-section"><div className="section-label">Investigation status</div>
      <div className="status-controls">{(['open', 'reviewing', 'resolved'] as InvestigationStatus[]).map((s) => <label key={s} className="status-radio"><input type="radio" name={`status-${detail.alert.id}`} checked={detail.alert.status === s} onChange={() => p.onStatus(s)} disabled={p.savingStatus || p.demoMode} /><span className={`radio-${s}`} aria-hidden="true" />{s}</label>)}</div>
      <p className="table-sub">Feedback alone never auto-resolves.</p></div>
  </>;
}

function GuidedResponse(p: {
  detail: InvestigationDetail; fbNote: string; setFbNote: (v: string) => void;
  demoMode: boolean; onFeedback: (r: FeedbackResponse, note: string) => void;
}) {
  const current = p.detail.alert.feedback?.response ?? null;
  const options: { id: FeedbackResponse; label: string }[] = [
    { id: 'recognize', label: 'I recognize this transaction' },
    { id: 'unrecognized', label: "I don't recognize this transaction" },
    { id: 'unsure', label: "I'm not sure yet" },
  ];
  return <div>
    {options.map((o) => <button key={o.id} className={`case-row ${current === o.id ? 'selected' : ''}`} aria-pressed={current === o.id} onClick={() => p.onFeedback(o.id, p.fbNote)} disabled={p.demoMode}><div><strong>{o.label}</strong></div>{current === o.id && <Check size={16} aria-hidden="true" />}</button>)}
    {!p.demoMode && <div className="form-field"><label htmlFor="feedback-note">Feedback note (optional)</label><input id="feedback-note" aria-label="Feedback note" value={p.fbNote} onChange={(e) => p.setFbNote(e.target.value)} placeholder="Add a note (optional)" /></div>}
    {current === 'unrecognized' && <p className="table-sub">Nessie is a simulator. Use your issuer's official channel for lock or dispute steps.</p>}
    {current && <p className="table-sub">Saved: {current}</p>}
  </div>;
}
