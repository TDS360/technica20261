import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Check, ChevronRight, CircleDot, Clock3, FileText, LayoutDashboard, Menu, RefreshCw, Search, ShieldCheck, SlidersHorizontal, X, Landmark } from 'lucide-react';
import { isSupabaseConfigured, supabaseClient } from '@/lib/signalzero';
import type { Alert, Connection, DashboardMetrics, InvestigationDetail, InvestigationStatus, SandboxAccount, Transaction } from '@/lib/signalzero';
import { connectAccount, createManualTransaction, demoSeed, disconnectAccount, fetchAlertDetail, fetchAlerts, fetchConnections, fetchMetrics, fetchTransactions, listSandboxAccounts, saveFeedback, syncConnection, updateStatus } from '@/lib/store';
import type { FeedbackResponse } from '@/lib/signalzero';
import type { Session } from '@supabase/supabase-js';

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'investigations', label: 'Investigations', icon: ShieldCheck },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'accounts', label: 'Accounts', icon: Landmark },
] as const;
type View = typeof navItems[number]['id'];

const formatMoney = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
const formatDate = (date: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));
  } catch { return date; }
};
function StatusBadge({ status }: { status: InvestigationStatus }) {
  return <span className={`badge badge-${status}`}><span className="badge-dot" />{status}</span>;
}
function SeverityBadge({ severity }: { severity: Alert['severity'] }) {
  const icon = severity === 'critical' ? '!!' : severity === 'high' ? '!' : severity === 'medium' ? 'A' : 'o';
  return <span className={`badge badge-${severity}`}><span className="severity-symbol">{icon}</span>{severity} severity</span>;
}
function SourcePill({ source }: { source: string }) {
  return <span className="source-pill"><span className="live-dot" />{source}</span>;
}
function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof Activity; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-label">{label}</div><div className="metric-value">{value.toLocaleString()}</div><div className="metric-detail">{detail}</div></div>;
}
function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><CircleDot size={22} /><strong>{title}</strong><span>{body}</span></div>;
}
function PageIntro({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: ReactNode }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{body}</p></div>{action}</div>;
}
function AuthScreen() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  if (!isSupabaseConfigured()) {
    return <div className="auth-shell"><div className="auth-card"><div className="brand-mark"><Activity size={18} /></div><h1>SignalZero setup required</h1><p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then reload. See README.</p></div></div>;
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setState('error');
      setMessage('Enter a valid email address to receive a sign-in link.');
      return;
    }
    setState('sending');
    setMessage('');
    try {
      const sb = supabaseClient();
      if (!sb) throw new Error('missing');
      const { error } = await sb.auth.signInWithOtp({ email: value, options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      setState('sent');
    } catch {
      setState('error');
      setMessage('The sign-in link could not be sent. Check configuration and try again.');
    }
  };
  return <div className="auth-shell"><div className="auth-card" role="main" aria-label="Sign in"><div className="brand-mark"><Activity size={18} /></div><div className="eyebrow">SignalZero</div><h1>Sign in with email</h1><p className="muted">One-time magic link. Nessie sandbox only — no card numbers, CVVs, PINs, or bank passwords.</p>
    {state === 'sent'
      ? <div className="notice" role="status"><div className="notice-icon"><Check size={18} /></div><div><strong>Check your inbox</strong><span>If the address is valid, a link is on its way. It expires soon.</span></div></div>
      : <form onSubmit={submit} className="auth-form"><label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={state === 'sending'} />{state === 'error' && <div className="error-banner" role="alert"><AlertTriangle size={16} /><span>{message}</span></div>}<button className="button button-primary" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending link...' : 'Send sign-in link'}</button></form>}
  </div></div>;
}

function App() {
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
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [reportAlert, setReportAlert] = useState<Alert | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [showAddData, setShowAddData] = useState(false);
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

  const filteredAlerts = useMemo(() => alerts.filter((alert) => {
    const txn = transactions.find((t) => t.id === alert.transactionId);
    const hay = `${alert.id} ${alert.reason} ${txn?.merchant ?? ''}`.toLowerCase();
    return hay.includes(search.toLowerCase())
      && (severityFilter === 'all' || alert.severity === severityFilter)
      && (statusFilter === 'all' || alert.status === statusFilter)
      && (typeFilter === 'all' || alert.type === typeFilter);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  [alerts, transactions, search, severityFilter, statusFilter, typeFilter]);

  const sourceLabel = demoMode ? 'LOCAL DEMO DATA' : 'NESSIE SANDBOX';
  const shownTx = demoMode ? demoSeed().transactions : transactions;
  const shownAlerts = demoMode ? demoSeed().alerts : alerts;
  const shownFiltered = demoMode ? shownAlerts : filteredAlerts;
  const openCount = shownAlerts.filter((a) => a.status !== 'resolved').length;
  void shownTx; void shownFiltered; void openCount; void sourceLabel;
  return <div>app {filteredAlerts.length}</div>;
}
export default App;
