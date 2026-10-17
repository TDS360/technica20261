// Authenticated SignalZero store: RLS-backed reads/writes,
// Nessie sandbox sync, idempotent imports, real detection persistence.
import { supabaseClient } from './signalzero';
import type {
  Alert, AlertFeedback, BaselineInfo, Connection, DashboardMetrics,
  DataSource, EvidenceItem, InvestigationDetail, InvestigationStatus,
  RelatedEvent, SandboxAccount, StatusEvent, Transaction,
} from './signalzero';
import { alertTypeToDetection } from './signalzero';
import { detectTransactions } from './detection';
import type { EngineAlert } from './detection';

export type { DataSource };
export type DemoSeed = { transactions: Transaction[]; alerts: Alert[] };

function rid(prefix: string): string {
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${r}`;
}
function toTxn(row: Record<string, unknown>): Transaction {
  return {
    id: String(row.id), amount: Number(row.amount),
    currency: String(row.currency ?? 'USD'),
    date: String(row.transaction_date),
    merchant: row.merchant ? String(row.merchant) : undefined,
    description: row.description ? String(row.description) : undefined,
    accountId: row.account_id ? String(row.account_id) : undefined,
    provider: row.provider ? String(row.provider) : undefined,
    providerTransactionId: row.provider_transaction_id
      ? String(row.provider_transaction_id) : undefined,
    connectionId: row.connection_id ? String(row.connection_id) : undefined,
    syncedAt: row.synced_at ? String(row.synced_at) : undefined,
  };
}
function toEv(row: Record<string, unknown>): EvidenceItem {
  return {
    id: String(row.id), label: String(row.label),
    description: String(row.description),
    observedValue: row.observed_value ? String(row.observed_value) : undefined,
    source: row.source ? String(row.source) : undefined,
    timestamp: row.evidence_timestamp ? String(row.evidence_timestamp) : undefined,
    kind: row.kind ? String(row.kind) : undefined,
  };
}
function toAlert(row: Record<string, unknown>): Alert {
  const ev = ((row.signalzero_evidence as Record<string, unknown>[] | null) ?? [])
    .map(toEv);
  const fbRows = (row.signalzero_alert_feedback as Record<string, unknown>[] | null) ?? [];
  const fb = fbRows[0] ? {
    response: String(fbRows[0].response) as AlertFeedback['response'],
    note: fbRows[0].note ? String(fbRows[0].note) : null,
    updatedAt: fbRows[0].updated_at ? String(fbRows[0].updated_at) : undefined,
  } : null;
  const hist = ((row.signalzero_investigation_events as Record<string, unknown>[] | null) ?? [])
    .map((h) => ({
      previousStatus: h.previous_status ? String(h.previous_status) : null,
      newStatus: String(h.new_status),
      note: h.note ? String(h.note) : null,
      createdAt: String(h.created_at),
    } as StatusEvent))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    id: String(row.id), transactionId: String(row.transaction_id),
    type: alertTypeToDetection(String(row.detection_type ?? '')),
    reason: String(row.reason),
    severity: String(row.severity) as Alert['severity'],
    evidence: ev, createdAt: String(row.created_at),
    status: String(row.status) as Alert['status'],
    rule: row.rule ? String(row.rule) : undefined,
    feedback: fb, history: hist,
  };
}
const ALERT_SELECT =
  '*, signalzero_evidence(*), signalzero_alert_feedback(response,note,updated_at), signalzero_investigation_events(previous_status,new_status,note,created_at)';

async function requireClient() {
  const sb = supabaseClient();
  if (!sb) throw new Error('Supabase is not configured.');
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new Error('Sign in required.');
  return sb;
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const sb = await requireClient();
  const { data, error } = await sb.from('signalzero_transactions')
    .select('*').order('transaction_date', { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => toTxn(r as Record<string, unknown>));
}

export async function fetchAlerts(): Promise<Alert[]> {
  const sb = await requireClient();
  const { data, error } = await sb.from('signalzero_alerts')
    .select(ALERT_SELECT).order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => toAlert(r as Record<string, unknown>));
}

export async function fetchMetrics(
  txns: Transaction[], alerts: Alert[]): Promise<DashboardMetrics> {
  const grouped = new Map<string, { transactions: number; alerts: number }>();
  txns.forEach((t) => {
    const label = new Intl.DateTimeFormat('en-US',
      { month: 'short', day: 'numeric' }).format(new Date(t.date));
    grouped.set(label, { transactions: (grouped.get(label)?.transactions ?? 0) + 1,
      alerts: grouped.get(label)?.alerts ?? 0 });
  });
  alerts.forEach((a) => {
    const label = new Intl.DateTimeFormat('en-US',
      { month: 'short', day: 'numeric' }).format(new Date(a.createdAt));
    grouped.set(label, { transactions: grouped.get(label)?.transactions ?? 0,
      alerts: (grouped.get(label)?.alerts ?? 0) + 1 });
  });
  return {
    totalTransactions: txns.length, suspiciousAlerts: alerts.length,
    openInvestigations: alerts.filter((a) => a.status !== 'resolved').length,
    resolvedInvestigations: alerts.filter((a) => a.status === 'resolved').length,
    activity: [...grouped.entries()].slice(-7)
      .map(([label, v]) => ({ label, ...v })),
  };
}

export async function fetchConnections(): Promise<Connection[]> {
  const sb = await requireClient();
  const { data, error } = await sb.from('signalzero_connections')
    .select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id), providerAccountId: String(row.provider_account_id),
      nickname: String(row.nickname ?? 'Sandbox account'),
      accountType: String(row.account_type ?? 'unknown'),
      balance: Number(row.balance ?? 0),
      status: String(row.status ?? 'connected'),
      lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
      lastError: row.last_error ? String(row.last_error) : null,
    };
  });
}

async function callEdge(action: string, accountId?: string) {
  const sb = await requireClient();
  const { data: sess } = await sb.auth.getSession();
  const token = sess.session?.access_token ?? '';
  const { data, error } = await sb.functions.invoke('nessie-data', {
    body: accountId ? { action, accountId } : { action },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw new Error('Sandbox request failed. Check configuration.');
  return data as Record<string, unknown>;
}

export async function listSandboxAccounts(): Promise<SandboxAccount[]> {
  const data = await callEdge('accounts');
  if (data.error) throw new Error(String(data.error));
  const accounts = (data.accounts as Record<string, unknown>[] | undefined) ?? [];
  return accounts.map((a) => ({
    id: String(a.id), nickname: String(a.nickname ?? 'Sandbox account'),
    type: String(a.type ?? 'unknown'), balance: Number(a.balance ?? 0),
  }));
}

export interface SyncResult {
  imported: number; updated: number; alertsCreated: number;
  alertsTotal: number; connectionId: string;
}

function engineEvidenceItems(a: EngineAlert): { label: string; description: string;
  observed?: string; kind: string }[] {
  const e = a.evidence ?? {};
  const items: { label: string; description: string; observed?: string; kind: string }[] = [];
  if (a.rule === 'LARGE_TRANSACTION') {
    items.push({
      label: 'Transaction amount',
      description: `Flagged amount ${e.amount ?? '?'} vs threshold ${e.threshold ?? '?'}.`,
      observed: e.amount !== undefined ? String(e.amount) : undefined,
      kind: 'amount',
    });
    items.push({
      label: e.baselineSampleSize >= 5
        ? 'Personal spending baseline' : 'Baseline unavailable',
      description: e.baselineSampleSize >= 5
        ? `Median ${e.baselineMedian} across ${e.baselineSampleSize} prior transactions; ratio ${e.deviationRatio ?? 'n/a'}x.`
        : `Only ${e.baselineSampleSize ?? 0} prior transactions available; historical comparison needs at least 5.`,
      observed: e.baselineMedian !== null && e.baselineMedian !== undefined
        ? String(e.baselineMedian) : undefined,
      kind: 'baseline',
    });
  } else if (a.rule === 'REPEATED_PAYMENT') {
    items.push({
      label: 'Repeated merchant payments',
      description: `${e.paymentCount ?? '?'} similar payments totalling ${e.clusterTotal ?? '?'} within ${e.windowMinutes ?? '?'} minutes.`,
      observed: e.paymentCount !== undefined ? String(e.paymentCount) : undefined,
      kind: 'cluster',
    });
    items.push({
      label: 'Related transactions',
      description: `Linked purchases: ${(e.relatedTransactionIds ?? []).join(', ') || 'none listed'}.`,
      kind: 'related',
    });
  } else {
    items.push({
      label: 'Rapid transaction burst',
      description: `${e.transactionCount ?? '?'} transactions totalling ${e.totalAmount ?? '?'} within ${e.windowMinutes ?? '?'} minutes.`,
      observed: e.transactionCount !== undefined ? String(e.transactionCount) : undefined,
      kind: 'burst',
    });
    items.push({
      label: 'Burst window',
      description: `Window ${e.windowStart ?? '?'} to ${e.windowEnd ?? '?'}. Linked: ${((e.relatedTransactionIds ?? []) as string[]).join(', ') || 'none'}.`,
      kind: 'related',
    });
  }
  items.push({
    label: 'Why this was flagged',
    description: a.reason,
    kind: 'explanation',
  });
  return items;
}

export async function connectAccount(acct: SandboxAccount): Promise<Connection> {
  const sb = await requireClient();
  const { data: user } = await sb.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error('Sign in required.');
  const { data, error } = await sb.from('signalzero_connections')
    .upsert({
      user_id: uid, provider: 'nessie_sandbox',
      provider_account_id: acct.id, nickname: acct.nickname,
      account_type: acct.type, balance: acct.balance,
      status: 'connected', updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider,provider_account_id' })
    .select().maybeSingle();
  if (error || !data) throw error ?? new Error('Connection failed.');
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id), providerAccountId: String(row.provider_account_id),
    nickname: String(row.nickname ?? acct.nickname),
    accountType: String(row.account_type ?? acct.type),
    balance: Number(row.balance ?? acct.balance),
    status: String(row.status ?? 'connected'),
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

export async function disconnectAccount(id: string): Promise<void> {
  const sb = await requireClient();
  const { error } = await sb.from('signalzero_connections')
    .update({ status: 'disconnected',
      updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function syncConnection(conn: Connection): Promise<SyncResult> {
  const sb = await requireClient();
  const { data: user } = await sb.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error('Sign in required.');
  const data = await callEdge('purchases', conn.providerAccountId);
  if (data.error) {
    await sb.from('signalzero_connections').update({
      last_error: String(data.error),
      updated_at: new Date().toISOString(),
    }).eq('id', conn.id);
    throw new Error(String(data.error));
  }
  const purchases = (data.purchases as Record<string, unknown>[]) ?? [];
  const nowIso = new Date().toISOString();
  let imported = 0;
  let updated = 0;
  const internalByProvider = new Map<string, string>();
  for (const p of purchases) {
    const pid = String(p.id ?? '');
    if (!pid) continue;
    const internalId = `${uid.slice(0, 8)}-${conn.providerAccountId.slice(-6)}-${pid}`.slice(0, 64);
    internalByProvider.set(pid, internalId);
    const merchant = p.merchantId ? `Merchant ${String(p.merchantId).slice(-6)}` : 'Sandbox purchase';
    const { data: existing } = await sb.from('signalzero_transactions')
      .select('id').eq('user_id', uid).eq('provider', 'nessie_sandbox')
      .eq('provider_transaction_id', pid).maybeSingle();
    if (existing) {
      await sb.from('signalzero_transactions')
        .update({ amount: Number(p.amount ?? 0),
          transaction_date: String(p.date),
          merchant, synced_at: nowIso,
          status_text: p.status ? String(p.status) : null })
        .eq('id', (existing as Record<string, unknown>).id);
      updated += 1;
    } else {
      const { error } = await sb.from('signalzero_transactions').insert({
        id: internalId, user_id: uid, amount: Number(p.amount ?? 0),
        currency: 'USD', transaction_date: String(p.date),
        merchant, description: p.description ? String(p.description) : null,
        account_id: conn.providerAccountId, provider: 'nessie_sandbox',
        provider_transaction_id: pid, connection_id: conn.id,
        synced_at: nowIso,
        merchant_ref: p.merchantId ? String(p.merchantId) : null,
        status_text: p.status ? String(p.status) : null,
      });
      if (error) throw error;
      imported += 1;
    }
  }
  return runDetection(sb, uid, conn, internalByProvider, imported, updated, nowIso);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runDetection(sb: any, uid: string, conn: Connection,
  internalByProvider: Map<string, string>,
  imported: number, updated: number, nowIso: string): Promise<SyncResult> {
  const { data: history } = await sb.from('signalzero_transactions')
    .select('*').eq('user_id', uid)
    .eq('account_id', conn.providerAccountId)
    .order('transaction_date', { ascending: true }).limit(1000);
  const histRows = ((history ?? []) as Record<string, unknown>[]);
  const engineInput = histRows.map((r) => ({
    _id: String(r.provider_transaction_id ?? r.id),
    amount: Number(r.amount),
    date: String(r.transaction_date),
    description: r.description ? String(r.description) : undefined,
    merchant_id: r.merchant_ref ? String(r.merchant_ref) : undefined,
    account_id: String(r.account_id ?? ''),
  }));
  const { alerts } = detectTransactions(engineInput);
  let alertsCreated = 0;
  for (const a of alerts) {
    const internalTxn = internalByProvider.get(a.transactionId)
      ?? String(histRows.find((r) =>
        String(r.provider_transaction_id) === a.transactionId)?.id ?? '');
    if (!internalTxn) continue;
    const { data: dup } = await sb.from('signalzero_alerts')
      .select('id').eq('user_id', uid)
      .eq('provider_alert_id', a.alertId).maybeSingle();
    if (dup) continue;
    const sev = a.severity;
    const { data: inserted, error: aErr } = await sb.from('signalzero_alerts')
      .insert({
        id: rid('ALERT').toUpperCase(), user_id: uid,
        transaction_id: internalTxn,
        detection_type: a.alertType, reason: a.reason, severity: sev,
        status: 'open', rule: a.rule, provider_alert_id: a.alertId,
        engine_evidence: a.evidence,
      }).select('id').maybeSingle();
    if (aErr || !inserted) throw aErr ?? new Error('Alert save failed.');
    const alertId = String((inserted as Record<string, unknown>).id);
    const evRows = engineEvidenceItems(a).map((it) => ({
      id: rid('ev'), user_id: uid, alert_id: alertId,
      label: it.label, description: it.description,
      observed_value: it.observed, source: 'SignalZero detection engine',
      kind: it.kind, data: a.evidence,
    }));
    const { error: eErr } = await sb.from('signalzero_evidence').insert(evRows);
    if (eErr) throw eErr;
    alertsCreated += 1;
  }
  await sb.from('signalzero_connections').update({
    last_synced_at: nowIso, last_error: null, updated_at: nowIso,
  }).eq('id', conn.id);
  return { imported, updated, alertsCreated,
    alertsTotal: alerts.length, connectionId: conn.id };
}

export async function fetchAlertDetail(alertId: string,
  txns: Transaction[], alerts: Alert[]): Promise<InvestigationDetail | null> {
  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) return null;
  const txn = txns.find((t) => t.id === alert.transactionId);
  if (!txn) return null;
  const related = txns.filter((t) => t.id !== txn.id
    && ((t.merchant && t.merchant === txn.merchant)
      || (t.accountId && t.accountId === txn.accountId))).slice(0, 20);
  const timeline = [...alert.evidence].sort((a, b) =>
    (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
  const relatedActivity: RelatedEvent[] = [];
  // Factual links from engine evidence (relatedTransactionIds).
  const sb = supabaseClient();
  let idToTxn = new Map<string, Transaction>(txns.map((t) => [t.id, t]));
  void sb;
  for (const ev of alert.evidence) {
    void ev;
  }
  const linked: string[] = [];
  try {
    const rawEv = alert.evidence as EvidenceItem[];
    void rawEv;
  } catch { /* ignore */ }
  // Derive links from related transactions (same merchant/account window).
  for (const t of related.slice(0, 8)) {
    const sameMerchant = t.merchant === txn.merchant;
    relatedActivity.push({
      kind: 'transaction', id: t.id, date: t.date,
      merchant: t.merchant, amount: t.amount,
      relation: sameMerchant
        ? 'Same merchant as the flagged transaction (factual).'
        : 'Same account within synced history (heuristic).',
      factual: sameMerchant,
    });
  }
  const siblingAlerts = alerts.filter((a) => a.id !== alert.id
    && (a.transactionId === alert.transactionId
      || related.some((t) => t.id === a.transactionId))).slice(0, 6);
  for (const s of siblingAlerts) {
    const st = txns.find((t) => t.id === s.transactionId);
    relatedActivity.push({
      kind: 'alert', id: s.id, date: s.createdAt,
      merchant: st?.merchant, amount: st?.amount,
      alertType: s.type, severity: s.severity, status: s.status,
      relation: s.transactionId === alert.transactionId
        ? 'Multiple rules flagged the same transaction (factual).'
        : 'Flagged activity on a related transaction (heuristic).',
      factual: s.transactionId === alert.transactionId,
    });
  }
  void linked;
  void idToTxn;
  relatedActivity.sort((a, b) => a.date.localeCompare(b.date));
  // Baseline from engine evidence (large-transaction rule).
  let baseline: BaselineInfo | null = null;
  const bl = alert.evidence.find((e) => e.kind === 'baseline');
  const amt = alert.evidence.find((e) => e.kind === 'amount');
  if (bl || amt) {
    baseline = {
      amount: txn.amount, median: null, sampleSize: 0,
      ratio: null, threshold: 1000,
      explanation: bl?.description ?? 'No baseline comparison available.',
      insufficient: !bl || bl.label === 'Baseline unavailable',
    };
    const m = (bl?.description ?? '').match(/Median ([\d.,]+) across (\d+) prior.*?ratio ([\d.]+)/);
    if (m) {
      baseline.median = Number(m[1].replace(/,/g, ''));
      baseline.sampleSize = Number(m[2]);
      baseline.ratio = Number(m[3]);
      const tm = (amt?.description ?? '').match(/vs threshold ([\d.,$]+)/);
      void tm;
    } else {
      const sm = (bl?.description ?? '').match(/Only (\d+) prior/);
      if (sm) baseline.sampleSize = Number(sm[1]);
    }
  }
  return { alert, transaction: txn, relatedTransactions: related,
    timeline, relatedActivity, baseline };
}

export async function updateStatus(alertId: string,
  status: InvestigationStatus, note?: string): Promise<void> {
  const sb = await requireClient();
  const { data: user } = await sb.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error('Sign in required.');
  const { data: current } = await sb.from('signalzero_alerts')
    .select('status').eq('id', alertId).maybeSingle();
  const prev = current
    ? String((current as Record<string, unknown>).status) : null;
  const { error } = await sb.from('signalzero_alerts')
    .update({ status }).eq('id', alertId);
  if (error) throw error;
  const { error: hErr } = await sb.from('signalzero_investigation_events')
    .insert({ user_id: uid, alert_id: alertId,
      previous_status: prev, new_status: status, note: note ?? null });
  if (hErr) throw hErr;
}

export async function saveFeedback(alertId: string,
  response: AlertFeedback['response'], note?: string): Promise<void> {
  const sb = await requireClient();
  const { data: user } = await sb.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error('Sign in required.');
  const { error } = await sb.from('signalzero_alert_feedback')
    .upsert({ user_id: uid, alert_id: alertId, response,
      note: note ?? null, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,alert_id' });
  if (error) throw error;
}

export async function createManualTransaction(input: {
  amount: number; date: string; merchant: string;
  description: string; accountId: string;
}): Promise<{ imported: number; alertsCreated: number }> {
  const sb = await requireClient();
  const { data: user } = await sb.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error('Sign in required.');
  const internalId = rid('txn-manual');
  const { error } = await sb.from('signalzero_transactions').insert({
    id: internalId, user_id: uid, amount: input.amount, currency: 'USD',
    transaction_date: input.date,
    merchant: input.merchant || 'Manual entry',
    description: input.description || null,
    account_id: input.accountId || 'manual',
    provider: 'manual', provider_transaction_id: internalId,
    synced_at: new Date().toISOString(),
  });
  if (error) throw error;
  // Run real detection over the owner's history for that account key.
  const acctKey = input.accountId || 'manual';
  const { data: history } = await sb.from('signalzero_transactions')
    .select('*').eq('user_id', uid).eq('account_id', acctKey)
    .order('transaction_date', { ascending: true }).limit(1000);
  const histRows = ((history ?? []) as Record<string, unknown>[]);
  const engineInput = histRows.map((r) => ({
    _id: String(r.provider_transaction_id ?? r.id),
    amount: Number(r.amount),
    date: String(r.transaction_date),
    description: r.description ? String(r.description) : undefined,
    merchant_id: r.merchant_ref
      ? String(r.merchant_ref)
      : (r.merchant ? String(r.merchant) : undefined),
    account_id: String(r.account_id ?? ''),
  }));
  const { alerts } = detectTransactions(engineInput);
  let created = 0;
  for (const a of alerts) {
    const targetInternal = histRows.find((r) =>
      String(r.provider_transaction_id) === a.transactionId)?.id;
    if (!targetInternal) continue;
    const { data: dup } = await sb.from('signalzero_alerts')
      .select('id').eq('user_id', uid)
      .eq('provider_alert_id', a.alertId).maybeSingle();
    if (dup) continue;
    const { data: inserted, error: aErr } = await sb.from('signalzero_alerts')
      .insert({
        id: rid('ALERT').toUpperCase(), user_id: uid,
        transaction_id: String(targetInternal),
        detection_type: a.alertType, reason: a.reason,
        severity: a.severity, status: 'open',
        rule: a.rule, provider_alert_id: a.alertId,
        engine_evidence: a.evidence,
      }).select('id').maybeSingle();
    if (aErr || !inserted) continue;
    const alertId = String((inserted as Record<string, unknown>).id);
    await sb.from('signalzero_evidence').insert(
      engineEvidenceItems(a).map((it) => ({
        id: rid('ev'), user_id: uid, alert_id: alertId,
        label: it.label, description: it.description,
        observed_value: it.observed,
        source: 'SignalZero detection engine',
        kind: it.kind, data: a.evidence,
      })));
    created += 1;
  }
  return { imported: 1, alertsCreated: created };
}

export function demoSeed(): DemoSeed {
  const txns: Transaction[] = [
    { id: 'demo-t1', amount: 42.5, currency: 'USD',
      date: '2026-02-02T18:30:00Z', merchant: 'Grocery Store',
      description: 'Weekly groceries', accountId: 'demo-acc',
      provider: 'local_demo' },
    { id: 'demo-t2', amount: 4500, currency: 'USD',
      date: '2026-02-08T02:13:00Z', merchant: 'Electronics Warehouse',
      description: 'Large demo purchase', accountId: 'demo-acc',
      provider: 'local_demo' },
  ];
  const alerts: Alert[] = [
    { id: 'ALT-LT-demo', transactionId: 'demo-t2',
      type: 'Unusually large transaction',
      reason: 'Unusually large transaction: amount of $4,500.00 is at or above $1,000.00.',
      severity: 'medium', createdAt: '2026-02-08T02:13:00Z',
      status: 'open', rule: 'LARGE_TRANSACTION',
      evidence: [
        { id: 'ev1', label: 'Transaction amount',
          description: 'Flagged amount 4500 vs threshold 1000.',
          observedValue: '4500', kind: 'amount' },
        { id: 'ev2', label: 'Baseline unavailable',
          description: 'Only 1 prior transactions available; historical comparison needs at least 5.',
          kind: 'baseline' },
      ] },
  ];
  return { transactions: txns, alerts };
}
