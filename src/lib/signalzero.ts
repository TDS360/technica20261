import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type InvestigationStatus = 'open' | 'reviewing' | 'resolved';
export type AlertSeverity = 'low' | 'medium' | 'high';
export type DetectionType = 'Unusually large transaction' | 'Repeated payment' | 'Rapid transactions' | 'Other';

export interface Transaction { id: string; amount: number; currency: string; date: string; merchant?: string; description?: string; accountId?: string; }
export interface EvidenceItem { id: string; label: string; description: string; observedValue?: string; source?: string; timestamp?: string; }
export interface Alert { id: string; transactionId: string; type: DetectionType; reason: string; severity: AlertSeverity; evidence: EvidenceItem[]; createdAt: string; status: InvestigationStatus; }
export interface InvestigationDetail { alert: Alert; transaction: Transaction; relatedTransactions: Transaction[]; timeline: EvidenceItem[]; }
export interface DashboardMetrics { totalTransactions: number; suspiciousAlerts: number; openInvestigations: number; resolvedInvestigations: number; activity: { label: string; transactions: number; alerts: number }[]; }
export interface NewTransaction { amount: number; date: string; merchant: string; description: string; accountId: string; }
export interface NewAlert { transactionId: string; type: DetectionType; reason: string; severity: AlertSeverity; evidence: Omit<EvidenceItem, 'id'>[]; }
export interface SignalZeroProvider {
  source: 'workspace';
  getTransactions(): Promise<Transaction[]>;
  getAlerts(): Promise<Alert[]>;
  getAlertDetails(alertId: string): Promise<InvestigationDetail | null>;
  updateInvestigationStatus(alertId: string, status: InvestigationStatus): Promise<Alert>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
  createTransaction(input: NewTransaction): Promise<Transaction>;
  createAlert(input: NewAlert): Promise<Alert>;
}

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
const memoryTransactions: Transaction[] = [];
const memoryAlerts: Alert[] = [];
const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const toTransaction = (row: Record<string, unknown>): Transaction => ({ id: String(row.id), amount: Number(row.amount), currency: String(row.currency ?? 'USD'), date: String(row.transaction_date), merchant: row.merchant ? String(row.merchant) : undefined, description: row.description ? String(row.description) : undefined, accountId: row.account_id ? String(row.account_id) : undefined });
const toEvidence = (row: Record<string, unknown>): EvidenceItem => ({ id: String(row.id), label: String(row.label), description: String(row.description), observedValue: row.observed_value ? String(row.observed_value) : undefined, source: row.source ? String(row.source) : undefined, timestamp: row.evidence_timestamp ? String(row.evidence_timestamp) : undefined });

async function getTransactions(): Promise<Transaction[]> {
  if (!supabase) return [...memoryTransactions];
  const { data, error } = await supabase.from('signalzero_transactions').select('*').order('transaction_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTransaction);
}
async function getAlerts(): Promise<Alert[]> {
  if (!supabase) return [...memoryAlerts];
  const { data, error } = await supabase.from('signalzero_alerts').select('*, signalzero_evidence(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: String(row.id), transactionId: String(row.transaction_id), type: row.detection_type as DetectionType, reason: String(row.reason), severity: row.severity as AlertSeverity, createdAt: String(row.created_at), status: row.status as InvestigationStatus, evidence: ((row.signalzero_evidence as Record<string, unknown>[] | null) ?? []).map(toEvidence) }));
}

export const workspaceProvider: SignalZeroProvider = {
  source: 'workspace',
  getTransactions,
  getAlerts,
  async getAlertDetails(alertId) {
    const [alerts, transactions] = await Promise.all([getAlerts(), getTransactions()]);
    const alert = alerts.find((item) => item.id === alertId);
    const transaction = alert && transactions.find((item) => item.id === alert.transactionId);
    if (!alert || !transaction) return null;
    return { alert, transaction, relatedTransactions: transactions.filter((item) => item.id !== transaction.id && item.merchant && item.merchant === transaction.merchant), timeline: [...alert.evidence].sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '')) };
  },
  async updateInvestigationStatus(alertId, status) {
    if (!supabase) {
      const alert = memoryAlerts.find((item) => item.id === alertId);
      if (!alert) throw new Error('Alert not found');
      alert.status = status;
      return { ...alert };
    }
    const { data, error } = await supabase.from('signalzero_alerts').update({ status }).eq('id', alertId).select('*, signalzero_evidence(*)').maybeSingle();
    if (error || !data) throw error ?? new Error('Alert not found');
    return { id: String(data.id), transactionId: String(data.transaction_id), type: data.detection_type as DetectionType, reason: String(data.reason), severity: data.severity as AlertSeverity, createdAt: String(data.created_at), status: data.status as InvestigationStatus, evidence: ((data.signalzero_evidence as Record<string, unknown>[] | null) ?? []).map(toEvidence) };
  },
  async getDashboardMetrics() {
    const [transactions, alerts] = await Promise.all([getTransactions(), getAlerts()]);
    const grouped = new Map<string, { transactions: number; alerts: number }>();
    transactions.forEach((transaction) => { const label = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(transaction.date)); grouped.set(label, { transactions: (grouped.get(label)?.transactions ?? 0) + 1, alerts: grouped.get(label)?.alerts ?? 0 }); });
    alerts.forEach((alert) => { const label = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(alert.createdAt)); grouped.set(label, { transactions: grouped.get(label)?.transactions ?? 0, alerts: (grouped.get(label)?.alerts ?? 0) + 1 }); });
    return { totalTransactions: transactions.length, suspiciousAlerts: alerts.length, openInvestigations: alerts.filter((item) => item.status !== 'resolved').length, resolvedInvestigations: alerts.filter((item) => item.status === 'resolved').length, activity: [...grouped.entries()].slice(-7).map(([label, values]) => ({ label, ...values })) };
  },
  async createTransaction(input) {
    const transaction: Transaction = { id: id('txn'), amount: input.amount, currency: 'USD', date: input.date, merchant: input.merchant || undefined, description: input.description || undefined, accountId: input.accountId || undefined };
    if (!supabase) { memoryTransactions.unshift(transaction); return transaction; }
    const { data, error } = await supabase.from('signalzero_transactions').insert({ id: transaction.id, amount: transaction.amount, transaction_date: transaction.date, merchant: transaction.merchant, description: transaction.description, account_id: transaction.accountId }).select().maybeSingle();
    if (error || !data) throw error ?? new Error('Transaction could not be saved');
    return toTransaction(data);
  },
  async createAlert(input) {
    const alertId = id('alert').toUpperCase();
    const alert: Alert = { id: alertId, transactionId: input.transactionId, type: input.type, reason: input.reason, severity: input.severity, createdAt: new Date().toISOString(), status: 'open', evidence: input.evidence.map((item) => ({ ...item, id: id('evidence') })) };
    if (!supabase) { memoryAlerts.unshift(alert); return alert; }
    const { data, error } = await supabase.from('signalzero_alerts').insert({ id: alert.id, transaction_id: alert.transactionId, detection_type: alert.type, reason: alert.reason, severity: alert.severity }).select().maybeSingle();
    if (error || !data) throw error ?? new Error('Alert could not be saved');
    if (alert.evidence.length) {
      const { error: evidenceError } = await supabase.from('signalzero_evidence').insert(alert.evidence.map((item) => ({ id: item.id, alert_id: alert.id, label: item.label, description: item.description, observed_value: item.observedValue, source: item.source, evidence_timestamp: item.timestamp })));
      if (evidenceError) throw evidenceError;
    }
    return { ...alert, createdAt: String(data.created_at) };
  },
};

export const activeProvider = workspaceProvider;
export const providerLabel = 'Workspace data';
