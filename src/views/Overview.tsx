import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Check, ChevronRight, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Alert, Connection, DashboardMetrics, Transaction } from '@/lib/signalzero';
import { EmptyState, MetricCard, PageIntro, SeverityBadge, StatusBadge, formatDate, formatMoney } from './helpers';

export function OverviewView(_props: {
  metrics: DashboardMetrics | null; alerts: Alert[];
  transactions: Transaction[]; loading: boolean;
  onOpen: (id: string) => void; onRefresh: () => void;
  demoMode: boolean; connections: Connection[];
}) {
  const { metrics, alerts, transactions, loading, onOpen, onRefresh, demoMode, connections } = _props;
  const maxT = Math.max(...(metrics?.activity.map((i) => i.transactions) ?? [1]), 1);
  const lastSync = connections.filter((c) => c.lastSyncedAt)
    .map((c) => c.lastSyncedAt as string).sort().pop();
  return <>
    <PageIntro eyebrow="Security overview" title="Command center" body="Review flagged financial activity and its supporting evidence." action={<button className="button button-secondary" onClick={onRefresh}><RefreshCw size={16} />Refresh data</button>} />
    <div className="notice"><div className="notice-icon"><Activity size={18} /></div><div><strong>{demoMode ? 'Local demo data' : 'Nessie sandbox'}</strong><span>{demoMode ? 'Read-only sample.' : 'Sandbox test data from your records.'}{lastSync ? ` Last sync: ${formatDate(lastSync)}.` : ''} A flagged transaction is not proof of fraud.</span></div></div>
    <div className="metrics-grid">{loading ? <><div className="skeleton metric-skeleton" /><div className="skeleton metric-skeleton" /></> : <><MetricCard label="Transactions analyzed" value={metrics?.totalTransactions ?? 0} detail="Your persisted records" icon={BarChart3} tone="cyan" /><MetricCard label="Suspicious alerts" value={metrics?.suspiciousAlerts ?? 0} detail="Engine findings" icon={AlertTriangle} tone="red" /><MetricCard label="Open investigations" value={metrics?.openInvestigations ?? 0} detail="Require review" icon={Clock3} tone="amber" /><MetricCard label="Resolved investigations" value={metrics?.resolvedInvestigations ?? 0} detail="Closed with status" icon={Check} tone="green" /></>}</div>
    <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-header"><div><h2>Transaction activity</h2><p>Last 7 days</p></div></div><div className="chart" role="img" aria-label="Activity chart">{(metrics?.activity ?? []).map((item) => <div className="chart-column" key={item.label}><div className="chart-bars"><div className="chart-alert" style={{ height: `${Math.max(item.alerts * 16, 4)}%` }} /><div className="chart-bar" style={{ height: `${(item.transactions / maxT) * 100}%` }} /></div><span>{item.label}</span></div>)}</div></section><section className="panel"><div className="panel-header"><div><h2>Recent alerts</h2><p>Priority items</p></div><button className="text-button" onClick={() => onOpen(alerts[0]?.id ?? '')}>View all <ArrowUpRight size={14} /></button></div><div className="alert-list">{alerts.length === 0 ? <EmptyState title="No alerts yet" body="Connect a sandbox account and sync purchases." /> : alerts.slice(0, 3).map((alert) => <button className="alert-row" key={alert.id} onClick={() => onOpen(alert.id)}><div className={`alert-severity severity-${alert.severity}`}><AlertTriangle size={16} /></div><div className="alert-row-copy"><div><strong>{alert.type}</strong><span>{alert.id}</span></div><p>{alert.reason}</p><div className="alert-row-meta"><SeverityBadge severity={alert.severity} /><StatusBadge status={alert.status} /></div></div><ChevronRight size={16} /></button>)}</div></section></div>
  </>;
}
