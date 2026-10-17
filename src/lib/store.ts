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
