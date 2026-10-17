/**
 * Section 1 adapter — wires the rule-based detection module
 * (`../../project-b-files`, pure JavaScript) into Section 2's
 * `SignalZeroProvider` contract from `./signalzero`.
 *
 * Data flow: raw Nessie-shaped transactions -> Section 1
 * `detectSuspiciousTransactions` -> investigations -> mapped to the
 * dashboard's Alert/Transaction/DashboardMetrics shapes.
 *
 * - Seeded with Section 1 mock transactions, or live Nessie purchases when
 *   the `nessie-data` Supabase bridge is configured (graceful fallback).
 * - Investigation statuses live in Section 1's store (survive re-detection);
 *   App.tsx mirrors status changes to the `signalzero_investigation_status`
 *   table, and this adapter restores them on load when Supabase is present.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSignalZero, mockTransactions, RULE_TYPES } from '../../project-b-files/src/index.js';
import type {
  Alert,
  AlertSeverity,
  DashboardMetrics,
  DetectionType,
  EvidenceItem,
  InvestigationDetail,
  InvestigationStatus,
  NewAlert,
  NewTransaction,
  SignalZeroProvider,
  Transaction,
} from './signalzero';

/** Nessie-shaped transaction — Section 1's documented input contract. */
interface RawTx {
  _id: string;
  amount?: number | string | null;
  date?: string | null;
  description?: string | null;
  merchant_id?: string | null;
  merchant_name?: string | null; // friendly merchant name for workspace entries
  account_id?: string | null;
  type?: string | null;
  status?: string | null;
}

/** Structural subset of Section 1's alert/investigation records we consume. */
interface S1Transaction {
  id: string; amount: number | null; date: string | null; description: string | null;
  merchantId: string | null; accountId: string | null; type: string | null;
}
interface S1Alert {
  alertId: string; transactionId: string; rule: string; alertType: string;
  reason: string; severity: string; evidence: unknown;
  detectedAt: string | null; transaction: S1Transaction | null;
}
interface S1Investigation extends S1Alert {
  explanation: string; status: string;
  statusHistory: { status: string; changedAt: string; note?: string | null }[];
  createdAt: string; updatedAt: string;
}
interface S1Instance {
  detectSuspiciousTransactions(transactions: unknown[]): { alerts: S1Alert[]; investigations: S1Investigation[] };
  getInvestigation(alertId: string): S1Investigation | null;
  listInvestigations(filter?: { status?: string }): S1Investigation[];
  updateInvestigationStatus(alertId: string, status: string, meta?: { note?: string }): S1Investigation;
  store: { registerAlerts(alerts: unknown[]): unknown };
}

const section1 = createSignalZero() as unknown as S1Instance;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const money = (value: unknown): string =>
  typeof value === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value) : String(value ?? '—');
const randomId = (): string => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 8);

/** Section 1 rule codes -> the dashboard's DetectionType labels. */
const RULE_TO_TYPE: Partial<Record<string, DetectionType>> = {
  [RULE_TYPES.LARGE_TRANSACTION]: 'Unusually large transaction',
  [RULE_TYPES.REPEATED_PAYMENT]: 'Repeated payment',
  [RULE_TYPES.RAPID_TRANSACTIONS]: 'Rapid transactions',
};
const DASHBOARD_TYPES: DetectionType[] = ['Unusually large transaction', 'Repeated payment', 'Rapid transactions', 'Other'];

/** Section 1 has four severities; the dashboard shows three ('critical' renders as 'high'). */
const SEVERITY_MAP: Partial<Record<string, AlertSeverity>> = { low: 'low', medium: 'medium', high: 'high', critical: 'high' };

const toUiStatus = (status: string): InvestigationStatus => {
  const value = status.toLowerCase();
  return value === 'reviewing' || value === 'resolved' ? value : 'open';
};
const toStoreStatus = (status: InvestigationStatus): 'Open' | 'Reviewing' | 'Resolved' =>
  status === 'reviewing' ? 'Reviewing' : status === 'resolved' ? 'Resolved' : 'Open';

/** Convert Section 1's structured evidence (or a manual alert's evidence array) to dashboard evidence items. */
function toEvidenceItems(alert: S1Alert): EvidenceItem[] {
  const evidence = alert.evidence;
  const stamp = alert.detectedAt ?? undefined;
  const source = `Section 1 · ${alert.alertType}`;
  if (Array.isArray(evidence)) {
    return (evidence as Array<Record<string, unknown>>).map((item, index) => ({
      id: String(item.id ?? `ev-${alert.alertId}-${index}`),
      label: String(item.label ?? `Evidence ${index + 1}`),
      description: String(item.description ?? ''),
      observedValue: item.observedValue != null ? String(item.observedValue) : undefined,
      source: item.source != null ? String(item.source) : undefined,
      timestamp: item.timestamp != null ? String(item.timestamp) : undefined,
    }));
  }
  const ev = (evidence ?? {}) as Record<string, unknown>;
  const items: EvidenceItem[] = [];
  const push = (label: string, description: string, observedValue?: string) => {
    items.push({ id: `ev-${alert.alertId}-${items.length}`, label, description, observedValue, source, timestamp: stamp });
  };
  if (alert.rule === RULE_TYPES.LARGE_TRANSACTION) {
    push('Observed amount', 'Transaction amount compared against the review threshold and the account baseline.', money(ev.amount));
    if (ev.overThreshold) push('Review threshold', `At or above the ${money(ev.threshold)} review threshold (${ev.thresholdMultiple}x).`, money(ev.threshold));
    if (ev.overBaseline) push('Account baseline', `Median of ${ev.baselineSampleSize} prior transactions on this account.`, `${money(ev.baselineMedian)} median · ${ev.deviationRatio}x deviation`);
  } else if (alert.rule === RULE_TYPES.REPEATED_PAYMENT) {
    push('Repeated payments', `${ev.paymentCount} similar payments to one merchant inside ${ev.windowMinutes} minutes.`, `${ev.paymentCount} payments · ${money(ev.clusterTotal)} total`);
    push('Merchant', 'All payments in the cluster share this merchant id.', String(ev.merchantId ?? 'unknown'));
    push('Time window', `${String(ev.firstAt ?? '')} → ${String(ev.lastAt ?? '')}`, `±${money(ev.similarityTolerance)} similarity`);
    push('Related transactions', (Array.isArray(ev.relatedTransactionIds) ? ev.relatedTransactionIds : []).join(', '));
  } else if (alert.rule === RULE_TYPES.RAPID_TRANSACTIONS) {
    push('Burst window', `${ev.transactionCount} transactions within ${ev.windowMinutes} minutes on a single account.`, `${ev.transactionCount} txns · ${money(ev.totalAmount)}`);
    push('Time window', `${String(ev.windowStart ?? '')} → ${String(ev.windowEnd ?? '')}`);
    push('Account', 'Burst measured per account id.', String(ev.accountId ?? 'unknown'));
    push('Related transactions', (Array.isArray(ev.relatedTransactionIds) ? ev.relatedTransactionIds : []).join(', '));
  } else {
    for (const [key, value] of Object.entries(ev)) push(key, typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));
    if (items.length === 0) push('Reason', alert.reason);
  }
  return items;
}

/** Map a Section 1 investigation record to the dashboard's Alert shape. */
function toUiAlert(investigation: S1Investigation): Alert {
  const mapped = RULE_TO_TYPE[investigation.rule];
  const type: DetectionType =
    mapped ?? (DASHBOARD_TYPES.includes(investigation.alertType as DetectionType) ? (investigation.alertType as DetectionType) : 'Other');
  return {
    id: investigation.alertId,
    transactionId: investigation.transactionId,
    type,
    reason: investigation.reason,
    severity: SEVERITY_MAP[investigation.severity] ?? 'medium',
    evidence: toEvidenceItems(investigation),
    createdAt: investigation.detectedAt ?? investigation.createdAt,
    status: toUiStatus(investigation.status),
  };
}

/** Map a raw Nessie-shaped transaction to the dashboard's Transaction shape. */
function toUiTransaction(raw: RawTx): Transaction {
  return {
    id: String(raw._id),
    amount: Math.abs(Number(raw.amount ?? 0)) || 0,
    currency: 'USD',
    date: String(raw.date ?? ''),
    merchant: raw.merchant_name ?? raw.description ?? undefined,
    description: raw.description ?? undefined,
    accountId: raw.account_id ?? undefined,
  };
}

function snapshotToTransaction(snapshot: S1Transaction | null): Transaction | null {
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    amount: Math.abs(Number(snapshot.amount ?? 0)) || 0,
    currency: 'USD',
    date: snapshot.date ?? '',
    merchant: snapshot.description ?? snapshot.merchantId ?? undefined,
    description: snapshot.description ?? undefined,
    accountId: snapshot.accountId ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Data layer: raw transaction cache (Nessie bridge -> mock fallback),
// detection refresh, and Supabase status restoration.
// ---------------------------------------------------------------------------

let rawPromise: Promise<RawTx[]> | null = null;
function ensureRaw(): Promise<RawTx[]> {
  rawPromise ??= loadRaw();
  return rawPromise;
}

async function loadRaw(): Promise<RawTx[]> {
  const live = await loadNessie();
  if (live.length > 0) return live;
  // Copy so workspace entries can be pushed without mutating the shared mock.
  return (mockTransactions as unknown as RawTx[]).map((item) => ({ ...item }));
}

async function loadNessie(): Promise<RawTx[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.functions.invoke('nessie-data');
    if (error || !data) return [];
    const purchases = (data as { purchases?: unknown }).purchases;
    return Array.isArray(purchases) && purchases.length > 0 ? (purchases as RawTx[]) : [];
  } catch {
    return []; // bridge not deployed / no key -> fall back to mock data
  }
}

let refreshPromise: Promise<void> | null = null;
function refresh(): Promise<void> {
  refreshPromise ??= doRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function doRefresh(): Promise<void> {
  const raw = await ensureRaw();
  section1.detectSuspiciousTransactions(raw);
  await applyPersistedStatuses();
}

/** Restore statuses saved by App.tsx in the signalzero_investigation_status table. */
async function applyPersistedStatuses(): Promise<void> {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('signalzero_investigation_status').select('alert_id, status');
    if (error || !data) return;
    for (const row of data as Array<{ alert_id: string; status: string }>) {
      const saved = String(row.status).toLowerCase();
      if (saved !== 'open' && saved !== 'reviewing' && saved !== 'resolved') continue;
      const investigation = section1.getInvestigation(row.alert_id);
      if (!investigation) continue;
      const target = saved === 'open' ? 'Open' : saved === 'reviewing' ? 'Reviewing' : 'Resolved';
      if (investigation.status === target) continue;
      try {
        section1.updateInvestigationStatus(row.alert_id, target, { note: 'Restored from saved workspace status' });
      } catch {
        // skip rows whose transition Section 1 rejects
      }
    }
  } catch {
    // table not provisioned yet -> in-memory status only
  }
}

async function getTransactions(): Promise<Transaction[]> {
  await refresh();
  const raw = await ensureRaw();
  return raw
    .filter((item) => item.date)
    .map(toUiTransaction)
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function getAlerts(): Promise<Alert[]> {
  await refresh();
  return section1.listInvestigations().map(toUiAlert);
}

async function getAlertDetails(alertId: string): Promise<InvestigationDetail | null> {
  await refresh();
  const investigation = section1.getInvestigation(alertId);
  if (!investigation) return null;
  const transactions = await getTransactions();
  const alert = toUiAlert(investigation);
  const transaction =
    transactions.find((item) => item.id === investigation.transactionId) ??
    snapshotToTransaction(investigation.transaction);
  if (!transaction) return null;

  const relatedIds = (() => {
    const evidence = investigation.evidence;
    if (Array.isArray(evidence) || evidence === null || evidence === undefined) return [];
    const ids = (evidence as Record<string, unknown>).relatedTransactionIds;
    return Array.isArray(ids) ? ids.map(String) : [];
  })();
  const fromEvidence = relatedIds
    .map((id) => transactions.find((item) => item.id === id))
    .filter((item): item is Transaction => Boolean(item));
  const sameMerchant = transactions.filter((item) => item.id !== transaction.id && item.merchant && item.merchant === transaction.merchant);
  const sameAccount = transactions.filter((item) => item.id !== transaction.id && item.accountId && item.accountId === transaction.accountId);
  const relatedTransactions = fromEvidence.length
    ? fromEvidence
    : sameMerchant.length
      ? sameMerchant
      : sameAccount.slice(0, 6);

  const timeline: EvidenceItem[] = [
    ...alert.evidence,
    ...investigation.statusHistory.map((entry, index) => ({
      id: `tl-${investigation.alertId}-${index}`,
      label: `Status changed to ${toUiStatus(entry.status)}`,
      description: entry.note ?? 'Investigation status updated',
      observedValue: toUiStatus(entry.status),
      source: 'Investigation workflow',
      timestamp: entry.changedAt,
    })),
  ].sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));

  return { alert, transaction, relatedTransactions, timeline };
}

async function updateInvestigationStatus(alertId: string, status: InvestigationStatus): Promise<Alert> {
  const updated = section1.updateInvestigationStatus(alertId, toStoreStatus(status), {
    note: `Analyst moved case to ${status}`,
  });
  return toUiAlert(updated);
}

async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [transactions, alerts] = await Promise.all([getTransactions(), getAlerts()]);
  const byDay = new Map<string, { transactions: number; alerts: number }>();
  const dayOf = (iso: string): string | null => {
    const time = Date.parse(iso);
    return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
  };
  for (const transaction of transactions) {
    const day = dayOf(transaction.date);
    if (!day) continue;
    const cell = byDay.get(day) ?? { transactions: 0, alerts: 0 };
    cell.transactions += 1;
    byDay.set(day, cell);
  }
  for (const alert of alerts) {
    const day = dayOf(alert.createdAt);
    if (!day) continue;
    const cell = byDay.get(day) ?? { transactions: 0, alerts: 0 };
    cell.alerts += 1;
    byDay.set(day, cell);
  }
  const activity = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([day, cell]) => ({
      label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${day}T00:00:00Z`)),
      ...cell,
    }));
  return {
    totalTransactions: transactions.length,
    suspiciousAlerts: alerts.length,
    openInvestigations: alerts.filter((item) => item.status !== 'resolved').length,
    resolvedInvestigations: alerts.filter((item) => item.status === 'resolved').length,
    activity,
  };
}

async function createTransaction(input: NewTransaction): Promise<Transaction> {
  const raw = await ensureRaw();
  const transaction: RawTx = {
    _id: `txn-man-${randomId()}`,
    amount: input.amount,
    date: input.date,
    merchant_name: input.merchant || undefined,
    merchant_id: input.merchant || `merchant-${randomId()}`,
    description: input.description || undefined,
    account_id: input.accountId || 'workspace-account',
    type: 'purchase',
    status: 'completed',
  };
  raw.push(transaction);
  return toUiTransaction(transaction);
}

async function createAlert(input: NewAlert): Promise<Alert> {
  const raw = await ensureRaw();
  const source = raw.find((item) => String(item._id) === input.transactionId) ?? null;
  const alertId = `ALT-MAN-${randomId().toUpperCase()}`;
  const now = new Date().toISOString();
  const manual = {
    alertId,
    transactionId: input.transactionId,
    rule: 'MANUAL',
    alertType: input.type,
    reason: input.reason,
    severity: input.severity,
    evidence: input.evidence.map((item) => ({ ...item, id: `ev-${randomId()}` })),
    detectedAt: now,
    transaction: source
      ? {
          id: String(source._id),
          amount: Math.abs(Number(source.amount ?? 0)) || 0,
          date: source.date ?? now,
          description: source.description ?? null,
          merchantId: source.merchant_name ?? source.merchant_id ?? null,
          accountId: source.account_id ?? null,
          type: source.type ?? null,
        }
      : null,
  };
  section1.store.registerAlerts([manual]);
  const investigation = section1.getInvestigation(alertId);
  if (!investigation) throw new Error('Alert could not be saved');
  return toUiAlert(investigation);
}

/** Section 1-backed provider, consumed by App.tsx via `activeProvider`. */
export const section1Provider: SignalZeroProvider = {
  source: 'workspace',
  getTransactions,
  getAlerts,
  getAlertDetails,
  updateInvestigationStatus,
  getDashboardMetrics,
  createTransaction,
  createAlert,
};

export const providerLabel = 'Section 1 rules';


