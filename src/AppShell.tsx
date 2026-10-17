import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Check, ChevronRight, Landmark, LayoutDashboard, FileText, Menu, ShieldCheck, X } from 'lucide-react';
import { isSupabaseConfigured, supabaseClient } from '@/lib/signalzero';
import type { Alert, Connection, DashboardMetrics, InvestigationDetail, InvestigationStatus, Transaction } from '@/lib/signalzero';
import { createManualTransaction, demoSeed, fetchAlertDetail, fetchAlerts, fetchConnections, fetchMetrics, fetchTransactions, saveFeedback, syncConnection, updateStatus } from '@/lib/store';
import type { FeedbackResponse } from '@/lib/signalzero';
import type { Session } from '@supabase/supabase-js';
import { SourcePill } from './views/helpers';
import { OverviewView } from './views/Overview';
import { AlertsView } from './views/Alerts';
import { InvestigationView } from './views/Investigation';
import { ReportsView } from './views/Reports';
import { AddDataModal, ReportModal } from './views/Modals';
import { AccountsView } from './views/Accounts';

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'investigations', label: 'Investigations', icon: ShieldCheck },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'accounts', label: 'Accounts', icon: Landmark },
] as const;
type View = typeof navItems[number]['id'];

function AuthGate(p: { onAuthed: (s: Session) => void; onDemo: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  if (!isSupabaseConfigured()) {
    return <div className="auth-shell"><div className="auth-card"><h1>Setup required</h1><p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then reload. Or continue with the read-only demo.</p><button className="button button-secondary" onClick={p.onDemo}>Use local demo</button></div></div>;
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const sb = supabaseClient();
      if (!sb) throw new Error('missing');
      const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      setSent(true);
    } catch {
      setErr('The sign-in link could not be sent.');
    } finally {
      setBusy(false);
    }
  };
  void p.onAuthed;
  return <div className="auth-shell"><div className="auth-card" role="main" aria-label="Sign in"><div className="brand-mark"><Activity size={18} /></div><h1>Sign in with email</h1><p className="muted">Magic link only. Sandbox data — never card numbers or bank passwords.</p>
    {sent ? <div className="notice" role="status"><div><strong>Check your inbox</strong><span>A link is on its way if the address is valid. It expires soon.</span></div><button className="button button-secondary" onClick={p.onDemo}>Or use local demo</button></div>
      : <form onSubmit={submit} className="auth-form"><label htmlFor="auth-email">Email</label><input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={busy} />{err && <div className="error-banner" role="alert"><AlertTriangle size={16} /><span>{err}</span></div>}<button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send sign-in link'}</button><button className="button button-secondary" type="button" onClick={p.onDemo}>Use local demo</button></form>}
  </div></div>;
}

export default function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [view, setView] = useState<View>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvestigationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [sevF, setSevF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [typeF, setTypeF] = useState('all');
  const [reportAlert, setReportAlert] = useState<Alert | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [savingData, setSavingData] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseClient();
    if (!sb) { setAuthLoading(false); return; }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, next) => {
      setSession(next);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const loadData = useCallback(async () => {
    if (!session || demoMode) return;
    setLoading(true);
    setError('');
    try {
      const [tx, al, conns] = await Promise.all([
        fetchTransactions(), fetchAlerts(), fetchConnections(),
      ]);
      setTransactions(tx);
      setAlerts(al);
      setConnections(conns);
      setMetrics(await fetchMetrics(tx, al));
      if (!selectedId && al[0]) setSelectedId(al[0].id);
    } catch {
      setError('SignalZero could not load your records. Retry to try again.');
    } finally {
      setLoading(false);
    }
  }, [session, demoMode, selectedId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    if (demoMode) {
      const seed = demoSeed();
      const alert = seed.alerts.find((a) => a.id === selectedId) ?? null;
      const txn = alert
        ? seed.transactions.find((t) => t.id === alert.transactionId) ?? null
        : null;
      setDetail(alert && txn ? {
        alert, transaction: txn, relatedTransactions: [],
        timeline: alert.evidence, relatedActivity: [], baseline: null,
      } : null);
      return;
    }
    setDetailLoading(true);
    fetchAlertDetail(selectedId, transactions, alerts)
      .then(setDetail).catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId, alerts, transactions, demoMode]);
  const filtered = useMemo(() => alerts.filter((a) => {
    const txn = transactions.find((t) => t.id === a.transactionId);
    const hay = `${a.id} ${a.reason} ${txn?.merchant ?? ''}`.toLowerCase();
    return hay.includes(search.toLowerCase())
      && (sevF === 'all' || a.severity === sevF)
      && (statusF === 'all' || a.status === statusF)
      && (typeF === 'all' || a.type === typeF);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  [alerts, transactions, search, sevF, statusF, typeF]);

  const sourceLabel = demoMode ? 'LOCAL DEMO DATA' : 'NESSIE SANDBOX';
  const shownTx = demoMode ? demoSeed().transactions : transactions;
  const shownAlerts = demoMode ? demoSeed().alerts : alerts;
  const shownFiltered = demoMode ? shownAlerts : filtered;
  const openCount = shownAlerts.filter((a) => a.status !== 'resolved').length;

  if (authLoading) {
    return <div className="auth-shell"><div className="auth-card"><div className="spinner" /><p>Restoring your session...</p></div></div>;
  }
  if (!session && !demoMode) {
    return <AuthGate onAuthed={(s) => setSession(s)} onDemo={() => setDemoMode(true)} />;
  }
  const title = navItems.find((i) => i.id === view)?.label ?? 'Overview';
  return <ShellBody view={view} setView={setView} title={title}
    mobileNav={mobileNav} setMobileNav={setMobileNav}
    sessionEmail={session?.user?.email ?? null} demoMode={demoMode}
    sourceLabel={sourceLabel} openCount={openCount}
    error={error} setError={setError} notice={notice} setNotice={setNotice}
    metrics={metrics} alerts={shownAlerts} transactions={shownTx}
    loading={loading} loadData={loadData} setSelectedId={setSelectedId}
    filtered={shownFiltered} search={search} setSearch={setSearch}
    sevF={sevF} setSevF={setSevF} statusF={statusF} setStatusF={setStatusF}
    typeF={typeF} setTypeF={setTypeF} detail={detail}
    detailLoading={detailLoading} selectedId={selectedId}
    reportAlert={reportAlert} setReportAlert={setReportAlert}
    showAdd={showAdd} setShowAdd={setShowAdd} savingData={savingData}
    setSavingData={setSavingData} connections={connections}
    syncing={syncing} setSyncing={setSyncing} setDemoMode={setDemoMode}
    setSession={setSession} setAlerts={setAlerts}
    setTransactions={setTransactions} setConnections={setConnections} />;
}

export type ShellProps = {
  view: View; setView: (v: View) => void; title: string;
  mobileNav: boolean; setMobileNav: (v: boolean) => void;
  sessionEmail: string | null; demoMode: boolean;
  sourceLabel: string; openCount: number;
  error: string; setError: (v: string) => void;
  notice: string; setNotice: (v: string) => void;
  metrics: DashboardMetrics | null; alerts: Alert[];
  transactions: Transaction[];
  loading: boolean; loadData: () => void;
  setSelectedId: (v: string | null) => void;
  filtered: Alert[]; search: string; setSearch: (v: string) => void;
  sevF: string; setSevF: (v: string) => void;
  statusF: string; setStatusF: (v: string) => void;
  typeF: string; setTypeF: (v: string) => void;
  detail: InvestigationDetail | null; detailLoading: boolean;
  selectedId: string | null;
  reportAlert: Alert | null; setReportAlert: (v: Alert | null) => void;
  showAdd: boolean; setShowAdd: (v: boolean) => void;
  savingData: boolean; setSavingData: (v: boolean) => void;
  connections: Connection[]; syncing: string | null;
  setSyncing: (v: string | null) => void;
  setDemoMode: (v: boolean) => void;
  setSession: (v: Session | null) => void;
  setAlerts: (v: Alert[]) => void;
  setTransactions: (v: Transaction[]) => void;
  setConnections: (v: Connection[]) => void;
};

export async function doStatus(p: ShellProps, status: InvestigationStatus) {
  if (!p.detail || p.demoMode) return;
  p.setError('');
  try {
    await updateStatus(p.detail.alert.id, status);
    await p.loadData();
    p.setNotice(`Status updated to ${status}.`);
  } catch {
    p.setError('The status change could not be saved.');
  }
}
export async function doFeedback(p: ShellProps, r: FeedbackResponse, note: string) {
  if (!p.detail || p.demoMode) return;
  try {
    await saveFeedback(p.detail.alert.id, r, note || undefined);
    await p.loadData();
    p.setNotice('Response saved. The case stays open until you resolve it.');
  } catch {
    p.setError('Your response could not be saved.');
  }
}
export async function doSync(p: ShellProps, conn: Connection) {
  p.setSyncing(conn.id);
  p.setError('');
  try {
    const res = await syncConnection(conn);
    await p.loadData();
    p.setNotice(`Synced ${res.imported} new / ${res.updated} updated. ${res.alertsCreated} new alerts.`);
  } catch (e) {
    p.setError(e instanceof Error ? e.message : 'Sync failed.');
  } finally {
    p.setSyncing(null);
  }
}

export async function doManual(p: ShellProps,
  v: { amount: number; date: string; merchant: string; description: string; accountId: string }) {
  p.setSavingData(true);
  try {
    const r = await createManualTransaction(v);
    p.setShowAdd(false);
    await p.loadData();
    p.setNotice(`Saved. Detection created ${r.alertsCreated} alert(s).`);
  } catch {
    p.setError('Your test transaction could not be saved.');
  } finally {
    p.setSavingData(false);
  }
}

export function ShellBody(p: ShellProps) {
  const openInv = (id: string) => {
    p.setSelectedId(id);
    p.setView('investigations');
    p.setMobileNav(false);
  };
  const signOut = async () => {
    const sb = supabaseClient();
    if (sb) await sb.auth.signOut();
    p.setSession(null);
    p.setDemoMode(false);
    p.setAlerts([]);
    p.setTransactions([]);
    p.setConnections([]);
  };
  return <div className="app-shell">
    <aside className={`sidebar ${p.mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Activity size={18} /></div><div><div className="brand-name">Signal<span>Zero</span></div><div className="brand-subtitle">Financial intelligence</div></div><button className="mobile-close" onClick={() => p.setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Primary navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${p.view === id ? 'active' : ''}`} onClick={() => { p.setView(id); p.setMobileNav(false); }}><Icon size={18} /><span>{label}</span>{id === 'alerts' && p.openCount > 0 && <span className="nav-count">{p.openCount}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="provider-card"><div className="provider-top"><span className="provider-status"><span className="live-dot" />Data source</span><SourcePill source={p.sourceLabel} /></div><p>{p.demoMode ? 'Read-only local demo.' : 'Nessie sandbox test data.'}</p></div></div>
    </aside>
    {p.mobileNav && <button className="scrim" onClick={() => p.setMobileNav(false)} aria-label="Close navigation overlay" />}
    <main className="main-area">
      <header className="topbar"><button className="menu-button" onClick={() => p.setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumbs"><span>SignalZero</span><ChevronRight size={14} /><strong>{p.title}</strong></div><div className="topbar-actions"><SourcePill source={p.sourceLabel} /><button className="button button-secondary" onClick={() => { if (p.demoMode) p.setDemoMode(false); else void signOut(); }}>{p.demoMode ? 'Exit demo' : 'Sign out'}</button></div></header>
      <div className="content">
        {p.error && <div className="error-banner" role="alert"><AlertTriangle size={17} /><span>{p.error}</span><button onClick={() => p.setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {p.notice && <div className="notice" role="status"><div className="notice-icon"><Check size={16} /></div><div><strong>Done</strong><span>{p.notice}</span></div><button onClick={() => p.setNotice('')} aria-label="Dismiss notice"><X size={16} /></button></div>}
        {p.view === 'overview' && <OverviewView metrics={p.metrics} alerts={p.alerts} transactions={p.transactions} loading={p.loading} onOpen={openInv} onRefresh={() => void p.loadData()} demoMode={p.demoMode} connections={p.connections} />}
        {p.view === 'alerts' && <AlertsView alerts={p.filtered} search={p.search} setSearch={p.setSearch} severityFilter={p.sevF} setSeverityFilter={p.setSevF} statusFilter={p.statusF} setStatusFilter={p.setStatusF} typeFilter={p.typeF} setTypeFilter={p.setTypeF} onOpen={openInv} onAdd={() => p.setShowAdd(true)} onClear={() => { p.setSearch(''); p.setSevF('all'); p.setStatusF('all'); p.setTypeF('all'); }} transactions={p.transactions} demoMode={p.demoMode} />}
        {p.view === 'investigations' && <InvestigationView detail={p.detail} loading={p.detailLoading} alerts={p.alerts} selectedId={p.selectedId} onSelect={p.setSelectedId} onStatus={(s) => void doStatus(p, s)} savingStatus={false} onReport={p.setReportAlert} onFeedback={(r, n) => void doFeedback(p, r, n)} demoMode={p.demoMode} />}
        {p.view === 'reports' && <ReportsView alerts={p.alerts} transactions={p.transactions} onReport={p.setReportAlert} />}
        {p.view === 'accounts' && <AccountsView connections={p.connections} demoMode={p.demoMode} syncing={p.syncing} onSync={(c) => void doSync(p, c)} onRefresh={() => void p.loadData()} onEnterDemo={() => p.setDemoMode(true)} onError={p.setError} onNotice={p.setNotice} />}
      </div>
    </main>
    {p.showAdd && <AddDataModal saving={p.savingData} onClose={() => p.setShowAdd(false)} onSave={(v) => void doManual(p, v)} />}
    {p.reportAlert && <ReportModal alert={p.reportAlert} detail={p.detail?.alert.id === p.reportAlert.id ? p.detail : null} source={p.sourceLabel} onClose={() => p.setReportAlert(null)} />}
    <div style={{ display: 'none' }}>{p.sessionEmail ?? ''}</div>
  </div>;
}
