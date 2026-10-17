import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Check, ChevronRight, CircleDot, Clock3, FileText, LayoutDashboard, Menu, RefreshCw, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { activeProvider, providerLabel } from '@/lib/signalzero';
import type { Alert, DashboardMetrics, InvestigationDetail, InvestigationStatus, NewAlert, NewTransaction, Transaction } from '@/lib/signalzero';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'investigations', label: 'Investigations', icon: ShieldCheck },
  { id: 'reports', label: 'Reports', icon: FileText },
] as const;
type View = typeof navItems[number]['id'];

const formatMoney = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
const formatDate = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));
const formatShortDate = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date));

function StatusBadge({ status }: { status: InvestigationStatus }) {
  return <span className={`badge badge-${status}`}><span className="badge-dot" />{status}</span>;
}
function SeverityBadge({ severity }: { severity: Alert['severity'] }) {
  const icon = severity === 'high' ? '!' : severity === 'medium' ? '▲' : '•';
  return <span className={`badge badge-${severity}`}><span className="severity-symbol">{icon}</span>{severity} severity</span>;
}
function SourcePill() { return <span className="source-pill"><span className="live-dot" />{providerLabel}</span>; }
function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof Activity; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-label">{label}</div><div className="metric-value">{value.toLocaleString()}</div><div className="metric-detail">{detail}</div></div>;
}
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="empty-state"><CircleDot size={22} /><strong>{title}</strong><span>{body}</span></div>; }

function App() {
  const [view, setView] = useState<View>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvestigationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [reportAlert, setReportAlert] = useState<Alert | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [showAddData, setShowAddData] = useState(false);
  const [savingData, setSavingData] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [nextAlerts, nextTransactions, nextMetrics] = await Promise.all([activeProvider.getAlerts(), activeProvider.getTransactions(), activeProvider.getDashboardMetrics()]);
      setAlerts(nextAlerts); setTransactions(nextTransactions); setMetrics(nextMetrics);
      if (!selectedId && nextAlerts[0]) setSelectedId(nextAlerts[0].id);
    } catch { setError('SignalZero could not load the current investigation data. Retry to try again.'); }
    finally { setLoading(false); }
  }, [selectedId]);
  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    void activeProvider.getAlertDetails(selectedId).then(setDetail).catch(() => setDetail(null)).finally(() => setDetailLoading(false));
  }, [selectedId, alerts]);

  const filteredAlerts = useMemo(() => alerts.filter((alert) => {
    const transaction = transactions.find((item) => item.id === alert.transactionId);
    const matchesSearch = `${alert.id} ${alert.reason} ${transaction?.merchant ?? ''} ${transaction?.id ?? ''}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (severityFilter === 'all' || alert.severity === severityFilter) && (statusFilter === 'all' || alert.status === statusFilter) && (typeFilter === 'all' || alert.type === typeFilter);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [alerts, transactions, search, severityFilter, statusFilter, typeFilter]);

  const handleStatus = async (status: InvestigationStatus) => {
    if (!detail || savingStatus || detail.alert.status === status) return;
    const prior = detail.alert.status;
    setSavingStatus(true); setError('');
    try {
      const updated = await activeProvider.updateInvestigationStatus(detail.alert.id, status);
      setAlerts((current) => current.map((alert) => alert.id === updated.id ? updated : alert));
      if (supabase) {
        const { error: persistenceError } = await supabase.from('signalzero_investigation_status').upsert({ alert_id: updated.id, status: updated.status, updated_at: new Date().toISOString() });
        if (persistenceError) throw persistenceError;
      }
    } catch { setError(`Status stayed ${prior}. The change could not be saved.`); }
    finally { setSavingStatus(false); }
  };

  const handleCreateData = async (transactionInput: NewTransaction, alertInput: NewAlert | null) => {
    setSavingData(true); setError('');
    try {
      const transaction = await activeProvider.createTransaction(transactionInput);
      const alert = alertInput ? await activeProvider.createAlert({ ...alertInput, transactionId: transaction.id }) : null;
      setShowAddData(false);
      setSelectedId(alert?.id ?? null);
      setView(alert ? 'investigations' : 'overview');
      await loadData();
    } catch { setError('Your data could not be saved. Check the fields and try again.'); }
    finally { setSavingData(false); }
  };
  const openInvestigation = (id: string) => { setSelectedId(id); setView('investigations'); setMobileNav(false); };
  const currentTitle = navItems.find((item) => item.id === view)?.label ?? 'Overview';

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Activity size={18} /></div><div><div className="brand-name">Signal<span>Zero</span></div><div className="brand-subtitle">Financial intelligence</div></div><button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Primary navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => { setView(id); setMobileNav(false); }}><Icon size={18} /><span>{label}</span>{id === 'alerts' && alerts.filter((a) => a.status !== 'resolved').length > 0 && <span className="nav-count">{alerts.filter((a) => a.status !== 'resolved').length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="provider-card"><div className="provider-top"><span className="provider-status"><span className="live-dot" />Data source</span><SourcePill /></div><p>Your saved transactions and alerts are active in this workspace.</p></div></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation overlay" />}
    <main className="main-area">
      <header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumbs"><span>SignalZero</span><ChevronRight size={14} /><strong>{currentTitle}</strong></div><div className="topbar-actions"><SourcePill /></div></header>
      <div className="content">
        {error && <div className="error-banner" role="alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {view === 'overview' && <Overview metrics={metrics} alerts={alerts} transactions={transactions} loading={loading} onOpen={openInvestigation} onRefresh={loadData} />}
        {view === 'alerts' && <AlertsPage alerts={filteredAlerts} search={search} setSearch={setSearch} severityFilter={severityFilter} setSeverityFilter={setSeverityFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} onOpen={openInvestigation} onAdd={() => setShowAddData(true)} onClear={() => { setSearch(''); setSeverityFilter('all'); setStatusFilter('all'); setTypeFilter('all'); }} transactions={transactions} />}
        {view === 'investigations' && <InvestigationPage detail={detail} loading={detailLoading} alerts={alerts} selectedId={selectedId} onSelect={setSelectedId} onStatus={handleStatus} savingStatus={savingStatus} onReport={setReportAlert} />}
        {view === 'reports' && <ReportsPage alerts={alerts} transactions={transactions} onReport={setReportAlert} />}

      </div>
    </main>
    {showAddData && <AddDataModal saving={savingData} onClose={() => setShowAddData(false)} onSave={handleCreateData} />}
    {reportAlert && <ReportModal alert={reportAlert} detail={detail?.alert.id === reportAlert.id ? detail : null} onClose={() => setReportAlert(null)} />}
  </div>;
}

function PageIntro({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: ReactNode }) { return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{body}</p></div>{action}</div>; }

function Overview({ metrics, alerts, transactions, loading, onOpen, onRefresh }: { metrics: DashboardMetrics | null; alerts: Alert[]; transactions: Transaction[]; loading: boolean; onOpen: (id: string) => void; onRefresh: () => void }) {
  const maxTransactions = Math.max(...(metrics?.activity.map((item) => item.transactions) ?? [1]));
  return <><PageIntro eyebrow="Security overview" title="Command center" body="Review flagged financial activity and its supporting evidence." action={<button className="button button-secondary" onClick={onRefresh}><RefreshCw size={16} />Refresh data</button>} />
    <div className="notice"><div className="notice-icon"><Activity size={18} /></div><div><strong>Workspace data</strong><span>Add your own transactions and review alerts. Dashboard cards update from the records you save.</span></div><button onClick={() => onRefresh()} aria-label="Refresh workspace data"><ArrowUpRight size={17} /></button></div>
    <div className="metrics-grid">{loading ? <><div className="skeleton metric-skeleton" /><div className="skeleton metric-skeleton" /><div className="skeleton metric-skeleton" /><div className="skeleton metric-skeleton" /></> : <><MetricCard label="Transactions analyzed" value={metrics?.totalTransactions ?? 0} detail="Across active data window" icon={BarChart3} tone="cyan" /><MetricCard label="Suspicious alerts" value={metrics?.suspiciousAlerts ?? 0} detail="Generated by Section 1" icon={AlertTriangle} tone="red" /><MetricCard label="Open investigations" value={metrics?.openInvestigations ?? 0} detail="Require analyst review" icon={Clock3} tone="amber" /><MetricCard label="Resolved investigations" value={metrics?.resolvedInvestigations ?? 0} detail="Closed with a status update" icon={Check} tone="green" /></>}</div>
    <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-header"><div><h2>Transaction activity</h2><p>Volume and flagged activity over the last 7 days</p></div><span className="chart-legend"><i className="legend-bar" /> transactions <i className="legend-alert" /> alerts</span></div><div className="chart" role="img" aria-label="Bar chart of transaction activity over the last seven days">{metrics?.activity.map((item) => <div className="chart-column" key={item.label}><div className="chart-bars"><div className="chart-alert" style={{ height: `${Math.max(item.alerts * 16, 4)}%` }} /><div className="chart-bar" style={{ height: `${(item.transactions / maxTransactions) * 100}%` }} /></div><span>{item.label}</span></div>)}</div></section><section className="panel"><div className="panel-header"><div><h2>Recent alerts</h2><p>Highest priority items needing attention</p></div><button className="text-button" onClick={() => onOpen(alerts[0]?.id ?? '')}>View all <ArrowUpRight size={14} /></button></div><div className="alert-list">{alerts.length === 0 ? <EmptyState title="No alerts yet" body="New Section 1 alerts will appear here." /> : alerts.slice(0, 3).map((alert) => <button className="alert-row" key={alert.id} onClick={() => onOpen(alert.id)}><div className={`alert-severity severity-${alert.severity}`}><AlertTriangle size={16} /></div><div className="alert-row-copy"><div><strong>{alert.type}</strong><span>{alert.id}</span></div><p>{alert.reason}</p><div className="alert-row-meta"><SeverityBadge severity={alert.severity} /><StatusBadge status={alert.status} /></div></div><ChevronRight size={16} /></button>)}</div></section></div>
    <section className="panel investigation-feed"><div className="panel-header"><div><h2>Investigation activity</h2><p>Recent status signals across the workspace</p></div><span className="muted-label">Updated just now</span></div><div className="feed-list">{alerts.map((alert) => { const txn = transactions.find((item) => item.id === alert.transactionId); return <div className="feed-item" key={alert.id}><div className={`feed-icon feed-${alert.status}`}><ShieldCheck size={15} /></div><div><strong>{alert.id} is {alert.status}</strong><span>{txn?.merchant ?? 'Unknown merchant'} · {formatShortDate(alert.createdAt)}</span></div><StatusBadge status={alert.status} /></div>; })}</div></section>
  </>;
}

function AlertsPage({ alerts, transactions, search, setSearch, severityFilter, setSeverityFilter, statusFilter, setStatusFilter, typeFilter, setTypeFilter, onOpen, onAdd, onClear }: { alerts: Alert[]; transactions: Transaction[]; search: string; setSearch: (v: string) => void; severityFilter: string; setSeverityFilter: (v: string) => void; statusFilter: string; setStatusFilter: (v: string) => void; typeFilter: string; setTypeFilter: (v: string) => void; onOpen: (id: string) => void; onAdd: () => void; onClear: () => void }) {
  return <><PageIntro eyebrow="Your investigation data" title="Alert center" body="Add transactions, create review alerts, and keep the evidence behind every report." action={<button className="button button-primary" onClick={onAdd}><FileText size={16} />Add transaction</button>} /><section className="panel alert-center"><div className="filter-bar"><div className="search-box"><Search size={17} /><input aria-label="Search alerts" placeholder="Search alert ID, merchant, or transaction" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={15} /></button>}</div><select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} aria-label="Filter by severity"><option value="all">All severities</option><option value="high">High severity</option><option value="medium">Medium severity</option><option value="low">Low severity</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option></select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by detection type"><option value="all">All detection types</option><option>Unusually large transaction</option><option>Repeated payment</option><option>Rapid transactions</option></select></div><div className="results-meta"><span>{alerts.length} alerts found</span>{(search || severityFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all') && <button className="text-button" onClick={onClear}>Clear filters <X size={14} /></button>}</div>{alerts.length === 0 ? <EmptyState title="No matching alerts" body="Try clearing a filter or searching for a different merchant." /> : <div className="table-wrap"><table><thead><tr><th>Alert</th><th>Detection type</th><th>Transaction</th><th>Severity</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{alerts.map((alert) => { const txn = transactions.find((item) => item.id === alert.transactionId); return <tr key={alert.id} onClick={() => onOpen(alert.id)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen(alert.id)}><td><strong>{alert.id}</strong><span className="table-sub">{formatDate(alert.createdAt)}</span></td><td><span className="detection-type"><span className={`type-dot type-${alert.severity}`} />{alert.type}</span><span className="table-sub">{alert.reason}</span></td><td><strong>{txn ? formatMoney(txn.amount) : 'Amount unavailable'}</strong><span className="table-sub">{txn?.merchant ?? 'Merchant unavailable'}</span></td><td><SeverityBadge severity={alert.severity} /></td><td><StatusBadge status={alert.status} /></td><td><ChevronRight size={17} /></td></tr>; })}</tbody></table></div>}</section></>;
}

function InvestigationPage({ detail, loading, alerts, selectedId, onSelect, onStatus, savingStatus, onReport }: { detail: InvestigationDetail | null; loading: boolean; alerts: Alert[]; selectedId: string | null; onSelect: (id: string) => void; onStatus: (status: InvestigationStatus) => void; savingStatus: boolean; onReport: (alert: Alert) => void }) {
  return <><PageIntro eyebrow="Evidence workspace" title="Investigations" body="Inspect why a pattern was flagged, then record the next review state." /><div className="investigation-layout"><section className="panel investigation-list"><div className="panel-header"><div><h2>Cases</h2><p>{alerts.length} active Section 1 signals</p></div><SlidersHorizontal size={17} /></div>{alerts.map((alert) => <button className={`case-row ${selectedId === alert.id ? 'selected' : ''}`} key={alert.id} onClick={() => onSelect(alert.id)}><div><strong>{alert.id}</strong><span>{alert.type}</span></div><div><SeverityBadge severity={alert.severity} /><StatusBadge status={alert.status} /></div></button>)}</section><section className="panel detail-panel">{loading ? <div className="detail-loading"><div className="spinner" /><span>Loading evidence...</span></div> : !detail ? <EmptyState title="Select an investigation" body="Choose a case to inspect its evidence." /> : <><div className="detail-header"><div><div className="eyebrow">Investigation {detail.alert.id}</div><h2>{detail.alert.type}</h2><p>{detail.alert.reason}</p></div><div className="detail-actions"><StatusBadge status={detail.alert.status} /><button className="button button-secondary" onClick={() => onReport(detail.alert)}><FileText size={16} />Generate report</button></div></div><div className="detail-grid"><div><div className="detail-section"><div className="section-label">Transaction</div><div className="transaction-card"><div><span className="transaction-merchant">{detail.transaction.merchant ?? 'Merchant unavailable'}</span><span className="transaction-description">{detail.transaction.description ?? 'Description unavailable'}</span></div><strong>{formatMoney(detail.transaction.amount)}</strong></div><div className="facts-grid"><div><span>Transaction ID</span><strong>{detail.transaction.id}</strong></div><div><span>Date and time</span><strong>{formatDate(detail.transaction.date)}</strong></div><div><span>Account</span><strong>{detail.transaction.accountId ?? 'Not provided'}</strong></div><div><span>Currency</span><strong>{detail.transaction.currency}</strong></div></div></div><div className="detail-section"><div className="section-label">Supporting evidence</div><div className="evidence-list">{detail.alert.evidence.length ? detail.alert.evidence.map((item) => <div className="evidence-card" key={item.id}><div className="evidence-icon"><Check size={15} /></div><div><strong>{item.label}</strong><p>{item.description}</p><span>{item.observedValue ?? 'Observed value unavailable'} · {item.source ?? 'Source unavailable'}</span></div></div>) : <EmptyState title="No supporting evidence" body="Section 1 did not provide evidence for this alert." />}</div></div></div><aside className="detail-aside"><div className="aside-block"><div className="section-label">Review status</div><div className="status-controls">{(['open', 'reviewing', 'resolved'] as InvestigationStatus[]).map((status) => <button key={status} className={detail.alert.status === status ? 'current' : ''} disabled={savingStatus} onClick={() => onStatus(status)}><span className={`status-radio radio-${status}`} />{status}{detail.alert.status === status && <Check size={15} />}</button>)}</div>{savingStatus && <span className="saving-label">Saving confirmed status...</span>}</div><div className="aside-block"><div className="section-label">Evidence timeline</div><div className="timeline">{detail.timeline.length ? detail.timeline.map((item) => <div className="timeline-item" key={item.id}><div className="timeline-line" /><div className="timeline-dot" /><div><strong>{item.label}</strong><span>{item.timestamp ? formatDate(item.timestamp) : 'Timestamp unavailable'}</span></div></div>) : <span className="muted-copy">No timeline events were provided.</span>}</div></div><div className="caveat"><AlertTriangle size={16} /><span>Flagged for review is not the same as confirmed fraud. Use the evidence and your investigation process before drawing conclusions.</span></div></aside></div></>}</section></div></>;
}

function ReportsPage({ alerts, transactions, onReport }: { alerts: Alert[]; transactions: Transaction[]; onReport: (alert: Alert) => void }) { return <><PageIntro eyebrow="Investigation records" title="Reports" body="Generate a print-friendly record from an alert's actual evidence and current status." /><section className="panel reports-panel"><div className="panel-header"><div><h2>Available cases</h2><p>Reports are generated from the selected Section 1 alert.</p></div><FileText size={18} /></div>{alerts.length === 0 ? <EmptyState title="No reports available" body="Reports will appear when alerts are available." /> : <div className="report-list">{alerts.map((alert) => { const txn = transactions.find((item) => item.id === alert.transactionId); return <div className="report-row" key={alert.id}><div className="report-icon"><FileText size={18} /></div><div><strong>{alert.id} · {alert.type}</strong><span>{txn?.merchant ?? 'Merchant unavailable'} · {formatMoney(txn?.amount ?? 0)} · {formatShortDate(alert.createdAt)}</span></div><div className="report-row-end"><StatusBadge status={alert.status} /><button className="button button-secondary" onClick={() => onReport(alert)}>Preview report <ArrowUpRight size={15} /></button></div></div>; })}</div>}</section></>; }

function AddDataModal({ saving, onClose, onSave }: { saving: boolean; onClose: () => void; onSave: (transaction: NewTransaction, alert: NewAlert | null) => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [addAlert, setAddAlert] = useState(true);
  const [type, setType] = useState<NewAlert['type']>('Unusually large transaction');
  const [severity, setSeverity] = useState<Alert['severity']>('medium');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({ amount: Number(amount), date: new Date(date).toISOString(), merchant, description, accountId }, addAlert ? { transactionId: '', type, severity, reason: reason || 'Added for analyst review.', evidence: evidence ? [{ label: 'Analyst note', description: evidence, observedValue: evidence, source: 'Workspace entry', timestamp: new Date(date).toISOString() }] : [] } : null);
  };
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add workspace data"><div className="data-modal"><div className="report-toolbar"><span>Add workspace data</span><button className="icon-button" onClick={onClose} aria-label="Close form"><X size={18} /></button></div><form className="data-form" onSubmit={submit}><div className="form-section"><div className="section-label">Transaction details</div><div className="form-grid"><label>Amount<input required min="0" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label><label>Date and time<input required type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Merchant<input value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Merchant name" /></label><label>Account ID<input value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder="Optional" /></label></div><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was this transaction for?" rows={2} /></label></div><label className="check-row"><input type="checkbox" checked={addAlert} onChange={(event) => setAddAlert(event.target.checked)} />Create a review alert for this transaction</label>{addAlert && <div className="form-section"><div className="section-label">Review alert</div><div className="form-grid"><label>Detection type<select value={type} onChange={(event) => setType(event.target.value as NewAlert['type'])}><option>Unusually large transaction</option><option>Repeated payment</option><option>Rapid transactions</option><option>Other</option></select></label><label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value as Alert['severity'])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><label>Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why should this be reviewed?" rows={2} /></label><label>Evidence note<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Optional supporting observation" rows={2} /></label></div>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving...' : 'Save workspace data'}</button></div></form></div></div>;
}

function ReportModal({ alert, detail, onClose }: { alert: Alert; detail: InvestigationDetail | null; onClose: () => void }) { const transaction = detail?.transaction; return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Investigation report"><div className="report-modal"><div className="report-toolbar"><span>Report preview</span><div><button className="button button-primary" onClick={() => window.print()}><FileText size={16} />Download PDF</button><button className="icon-button" onClick={onClose} aria-label="Close report"><X size={18} /></button></div></div><article className="print-report"><div className="report-kicker">SIGNALZERO · INVESTIGATION REPORT</div><h1>{alert.id}</h1><p className="report-lead">Financial activity review record · Generated {formatDate(new Date().toISOString())}</p><div className="report-status-row"><SeverityBadge severity={alert.severity} /><StatusBadge status={alert.status} /><span>Source: {providerLabel}</span></div><div className="report-rule"><span>Detection rule</span><strong>{alert.type}</strong><p>{alert.reason}</p></div><div className="report-two-col"><div><span className="section-label">Transaction details</span><dl><dt>Transaction ID</dt><dd>{transaction?.id ?? alert.transactionId}</dd><dt>Merchant</dt><dd>{transaction?.merchant ?? 'Not provided'}</dd><dt>Amount</dt><dd>{transaction ? formatMoney(transaction.amount) : 'Not provided'}</dd><dt>Date</dt><dd>{transaction ? formatDate(transaction.date) : 'Not provided'}</dd></dl></div><div><span className="section-label">Supporting evidence</span><ul className="report-evidence">{alert.evidence.map((item) => <li key={item.id}><strong>{item.label}</strong><span>{item.description}</span></li>)}</ul></div></div><div className="report-next"><span className="section-label">Recommended next steps</span><p>Review the supplied evidence, validate the transaction with the account context available to your team, and record the next status only when the review outcome is confirmed.</p></div><footer>This report records an alert for investigation. It does not independently establish fraud. Data source: {providerLabel}.</footer></article></div></div>; }

export default App;
