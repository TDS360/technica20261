import { useEffect, useState } from 'react';
import { FileText, Landmark, RefreshCw, X } from 'lucide-react';
import type { Alert, Connection, SandboxAccount, Transaction } from '@/lib/signalzero';
import { connectAccount, disconnectAccount, fetchAlertDetail, listSandboxAccounts } from '@/lib/store';
import { EmptyState, PageIntro, SeverityBadge, StatusBadge, formatDate, formatMoney } from './helpers';

export function AccountsView(p: {
  connections: Connection[]; demoMode: boolean; syncing: string | null;
  onSync: (c: Connection) => void; onRefresh: () => void;
  onEnterDemo: () => void; onError: (msg: string) => void;
  onNotice: (msg: string) => void;
}) {
  const { connections, demoMode, syncing } = p;
  const [available, setAvailable] = useState<SandboxAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (demoMode) return;
    setLoading(true);
    listSandboxAccounts()
      .then(setAvailable)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sandbox unavailable.'))
      .finally(() => setLoading(false));
  }, [demoMode, connections.length]);

  const handleConnect = async (acct: SandboxAccount) => {
    setConnecting(acct.id);
    try {
      const conn = await connectAccount(acct);
      p.onNotice(`Connected ${conn.nickname}. Sync to import purchases.`);
      p.onRefresh();
    } catch (e) {
      p.onError(e instanceof Error ? e.message : 'Connection failed.');
    } finally {
      setConnecting(null);
    }
  };

  return <>
    <PageIntro eyebrow="Connected accounts" title="Accounts" body="Connect a Nessie sandbox account, then sync its purchases through the secured Edge Function." />
    {error && <div className="error-banner" role="alert"><X size={16} /><span>{error} Configure NESSIE_API_KEY in Edge Function secrets, or use the labeled local demo below.</span></div>}
    <section className="panel"><div className="panel-header"><div><h2>Your connections</h2><p>Only your own records are visible (per-user RLS).</p></div><button className="button button-secondary" onClick={p.onRefresh}><RefreshCw size={16} />Refresh</button></div>
      {connections.length === 0 ? <EmptyState title="No connected accounts" body="Connect a demo account below, or use the explicitly labeled local demo." /> : connections.map((c) => <div className="case-row" key={c.id}><div><strong>{c.nickname}</strong><span>{c.accountType} · balance {formatMoney(c.balance)} · {c.status}{c.lastSyncedAt ? ` · synced ${formatDate(c.lastSyncedAt)}` : ' · never synced'}{c.lastError ? ` · error: ${c.lastError}` : ''}</span></div><div>{c.status === 'connected' && <button className="button button-primary" disabled={syncing === c.id} onClick={() => p.onSync(c)}>{syncing === c.id ? 'Syncing...' : 'Sync'}</button>}<button className="text-button" onClick={() => { void disconnectAccount(c.id).then(() => p.onRefresh()); }}>Disconnect</button></div></div>)}
    </section>
    <section className="panel"><div className="panel-header"><div><h2>Available sandbox accounts</h2><p>Shared Nessie test data — not a real-bank connection.</p></div><Landmark size={17} /></div>
      {loading ? <div className="detail-loading"><div className="spinner" /><span>Loading sandbox accounts...</span></div> : available.length === 0 ? <EmptyState title="Sandbox not configured" body="Add NESSIE_API_KEY to the nessie-data Edge Function secrets and deploy it." /> : available.map((a) => <div className="case-row" key={a.id}><div><strong>{a.nickname}</strong><span>{a.type} · balance {formatMoney(a.balance)}</span></div><button className="button button-secondary" disabled={connecting === a.id} onClick={() => void handleConnect(a)}>{connecting === a.id ? 'Connecting...' : 'Connect demo account'}</button></div>)}
      <div className="notice"><div><strong>Local demo option</strong><span>Read-only sample data, clearly labeled. Never presented as live banking.</span></div><button className="button button-secondary" onClick={p.onEnterDemo}>Use local demo</button></div>
    </section>
  </>;
}
