import { FileText } from 'lucide-react';
import type { Alert, Transaction } from '@/lib/signalzero';
import { EmptyState, PageIntro } from './helpers';

export function ReportsView(p: {
  alerts: Alert[]; transactions: Transaction[];
  onReport: (a: Alert) => void;
}) {
  void p.transactions;
  return <>
    <PageIntro eyebrow="Reports" title="Reports" body="Printable investigation records from your persisted cases." />
    <section className="panel"><div className="panel-header"><div><h2>Investigation reports</h2><p>{p.alerts.length} cases</p></div></div>
      {p.alerts.length === 0 ? <EmptyState title="No reports" body="Sync a sandbox account to generate cases." /> : p.alerts.map((a) => <div className="case-row" key={a.id}><div><strong>{a.id}</strong><span>{a.type} · {a.status}</span></div><button className="button button-secondary" onClick={() => p.onReport(a)}><FileText size={16} aria-hidden="true" />Report</button></div>)}
    </section>
  </>;
}
