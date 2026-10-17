import { ChevronRight, Search, X } from 'lucide-react';
import type { Alert, Transaction } from '@/lib/signalzero';
import { EmptyState, PageIntro, SeverityBadge, StatusBadge, formatDate } from './helpers';

export function AlertsView(p: {
  alerts: Alert[]; search: string; setSearch: (v: string) => void;
  severityFilter: string; setSeverityFilter: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  typeFilter: string; setTypeFilter: (v: string) => void;
  onOpen: (id: string) => void; onAdd: () => void; onClear: () => void;
  transactions: Transaction[]; demoMode: boolean;
}) {
  const { alerts, search, setSearch } = p;
  return <>
    <PageIntro eyebrow="Alert queue" title="Alerts" body="Filter engine findings by severity, status, and detection type." action={<button className="button button-primary" onClick={p.onAdd} disabled={p.demoMode}>Add test transaction</button>} />
    <div className="filter-bar"><div className="search-box"><Search size={15} /><input aria-label="Search alerts" placeholder="Search alert ID, merchant, or transaction" value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={15} /></button>}</div>
      <select value={p.severityFilter} onChange={(e) => p.setSeverityFilter(e.target.value)} aria-label="Filter by severity"><option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
      <select value={p.statusFilter} onChange={(e) => p.setStatusFilter(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option></select>
      <select value={p.typeFilter} onChange={(e) => p.setTypeFilter(e.target.value)} aria-label="Filter by detection type"><option value="all">All types</option><option>Unusually large transaction</option><option>Repeated payment</option><option>Rapid transactions</option></select></div>
    <div className="results-meta"><span>{alerts.length} alerts found</span>{(search || p.severityFilter !== 'all' || p.statusFilter !== 'all' || p.typeFilter !== 'all') && <button className="text-button" onClick={p.onClear}>Clear filters <X size={14} /></button>}</div>
    {alerts.length === 0 ? <EmptyState title="No matching alerts" body="Try clearing a filter, or sync a sandbox account." /> : <div className="table-wrap"><table><thead><tr><th>Alert</th><th>Type</th><th>Severity</th><th>Status</th><th>Merchant</th><th></th></tr></thead><tbody>{alerts.map((alert) => { const txn = p.transactions.find((t) => t.id === alert.transactionId); return <tr key={alert.id}><td><strong>{alert.id}</strong><div className="table-sub">{alert.createdAt ? formatDate(alert.createdAt) : ''}</div></td><td>{alert.type}</td><td><SeverityBadge severity={alert.severity} /></td><td><StatusBadge status={alert.status} /></td><td>{txn?.merchant ?? '-'}</td><td><button className="text-button" onClick={() => p.onOpen(alert.id)}>Open <ChevronRight size={14} /></button></td></tr>; })}</tbody></table></div>}
  </>;
}
