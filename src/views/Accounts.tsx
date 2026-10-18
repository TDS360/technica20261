import { useEffect, useState } from 'react';
import { Landmark, RefreshCw, X } from 'lucide-react';
import type { Connection, SandboxAccount } from '@/lib/signalzero';
import { connectAccount, disconnectAccount, listSandboxAccounts } from '@/lib/store';
import { EmptyState, PageIntro, formatDate, formatMoney } from './helpers';
import {
  getDemoCards,
  saveDemoCard,
  deleteDemoCard,
  type DemoCard,
} from '@/lib/demoCards';

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

  const [demoCards, setDemoCards] = useState<DemoCard[]>([]);
  const [cardName, setCardName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [cardType, setCardType] = useState<'Debit' | 'Credit'>('Debit');
  const [balance, setBalance] = useState('0');

useEffect(() => {
  setDemoCards(getDemoCards());
}, []);

const handleAddDemoCard = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  const amount = Number(balance);
  if (
    !cardName.trim() ||
    !issuer.trim() ||
    !/^\d{4}$/.test(lastFour) ||
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    setError('Enter a card name, issuer, four digits, and a valid non-negative balance.');
    return;
  }

  const next = saveDemoCard({
    nickname: cardName.trim(),
    issuer: issuer.trim(),
    lastFour,
    type: cardType,
    balance: amount,
  });

  setDemoCards(next);
  setCardName('');
  setIssuer('');
  setLastFour('');
  setCardType('Debit');
  setBalance('0');
  setError('');
  p.onNotice('Demo card profile added. It is not connected to a bank.');

  
<section className="panel">
  <div className="panel-header">
    <div>
      <h2>Add a demo card</h2>
      <p>
        Create a sample card profile for the prototype.
        Do not enter real card credentials.
      </p>
    </div>
  </div>

  <form className="auth-form" onSubmit={handleAddDemoCard}>
    <label htmlFor="demo-card-name">Card nickname</label>
    <input
      id="demo-card-name"
      value={cardName}
      onChange={(e) => setCardName(e.target.value)}
      placeholder="My everyday card"
      required
    />

    <label htmlFor="demo-card-issuer">Bank or issuer</label>
    <input
      id="demo-card-issuer"
      value={issuer}
      onChange={(e) => setIssuer(e.target.value)}
      placeholder="Demo Bank"
      required
    />

    <label htmlFor="demo-card-last-four">Last four digits (fictional)</label>
    <input
      id="demo-card-last-four"
      inputMode="numeric"
      maxLength={4}
      pattern="[0-9]{4}"
      value={lastFour}
      onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
      placeholder="1234"
      required
    />

    <label htmlFor="demo-card-type">Card type</label>
    <select
      id="demo-card-type"
      value={cardType}
      onChange={(e) => setCardType(e.target.value as 'Debit' | 'Credit')}
    >
      <option value="Debit">Debit</option>
      <option value="Credit">Credit</option>
    </select>

    <label htmlFor="demo-card-balance">Sample balance ($)</label>
    <input
      id="demo-card-balance"
      type="number"
      min="0"
      step="0.01"
      value={balance}
      onChange={(e) => setBalance(e.target.value)}
      required
    />

    <button className="button button-primary" type="submit">
      Add demo card
    </button>
  </form>

  {demoCards.map((card) => (
    <article className="bank-card" key={card.id}>
      <div className="bank-card-top">
        <span className="bank-card-brand">SIGNALZERO · DEMO</span>
        <Landmark size={24} />
      </div>
      <p className="bank-card-label">{card.issuer}</p>
      <h3 className="bank-card-name">{card.nickname}</h3>
      <div className="bank-card-number">
        •••• •••• •••• {card.lastFour}
      </div>
      <div className="bank-card-bottom">
        <div>
          <span className="bank-card-label">Type</span>
          <strong>{card.type}</strong>
        </div>
        <div>
          <span className="bank-card-label">Sample balance</span>
          <strong>{formatMoney(card.balance)}</strong>
        </div>
      </div>
      <button
        className="text-button"
        type="button"
        onClick={() => setDemoCards(deleteDemoCard(card.id))}
      >
        Remove demo card
      </button>
    </article>
  ))}
</section>

};

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
    {error && <div className="error-banner" role="alert"><X size={16} /><span>{error} Check the Edge Function configuration or try again. The local demo below is read-only.</span></div>}
    <section className="panel"><div className="panel-header"><div><h2>Your connections</h2><p>Only your own records are visible (per-user RLS).</p></div><button className="button button-secondary" onClick={p.onRefresh}><RefreshCw size={16} aria-hidden="true" />Refresh</button></div>
     {connections.length === 0 ? (
  <EmptyState
    title="No connected accounts"
    body="Connect a Nessie sandbox account below to see its information here."
  />
) : (
  <div className="card-grid">
    {connections.map((account) => (
      <article className="bank-card" key={account.id}>
        <div className="bank-card-top">
          <span className="bank-card-brand">SIGNALZERO</span>
          <Landmark size={24} aria-hidden="true" />
        </div>

        <p className="bank-card-label">Connected sandbox account</p>
        <h3 className="bank-card-name">{account.nickname}</h3>

        <div className="bank-card-number">
          •••• •••• •••• {account.id.slice(-4)}
        </div>

        <div className="bank-card-bottom">
          <div>
            <span className="bank-card-label">Account type</span>
            <strong>{account.accountType}</strong>
          </div>
          <div>
            <span className="bank-card-label">Available balance</span>
            <strong>{formatMoney(account.balance)}</strong>
          </div>
        </div>

        <div className="bank-card-actions">
          <span className="account-status">
            {account.status === "connected" ? "Connected" : account.status}
          </span>

          {account.status === "connected" && (
            <button
              className="button button-primary"
              disabled={syncing === account.id}
              onClick={() => p.onSync(account)}
            >
              {syncing === account.id ? "Syncing..." : "Sync transactions"}
            </button>
          )}

          <button
            className="text-button"
            onClick={() => {
              void disconnectAccount(account.id)
                .then(() => p.onRefresh())
                .catch((error: unknown) =>
                  p.onError(
                    error instanceof Error
                      ? error.message
                      : "Disconnect failed."
                  )
                );
            }}
          >
            Disconnect
          </button>
        </div>
      </article>
    ))}
  </div>
)}
    </section>
    <section className="panel"><div className="panel-header"><div><h2>Available sandbox accounts</h2><p>Shared Nessie test data — not a real-bank connection.</p></div><Landmark size={17} /></div>
      {loading ? <div className="detail-loading"><div className="spinner" /><span>Loading sandbox accounts...</span></div> : available.length === 0 ? <EmptyState title={error ? "Sandbox unavailable" : "No sandbox accounts available"} body={error ? "Check the error above and retry after resolving the configuration or provider issue." : "No accounts were returned by the configured Nessie sandbox."} /> : available.map((a) => <div className="case-row" key={a.id}><div><strong>{a.nickname}</strong><span>{a.type} · balance {formatMoney(a.balance)}</span></div><button className="button button-secondary" disabled={connecting === a.id} onClick={() => void handleConnect(a)}>{connecting === a.id ? 'Connecting...' : 'Connect sandbox account'}</button></div>)}
      <div className="notice"><div><strong>Local demo option</strong><span>Read-only sample data, clearly labeled. Never presented as live banking.</span></div><button className="button button-secondary" onClick={p.onEnterDemo}>Use local demo</button></div>
    </section>
  </>;
}
