import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type InvestigationStatus = 'open' | 'reviewing' | 'resolved';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DetectionType = 'Unusually large transaction' | 'Repeated payment' | 'Rapid transactions' | 'Other';
export type FeedbackResponse = 'recognize' | 'unrecognized' | 'unsure';
export type DataSource = 'nessie_sandbox' | 'local_demo';

export interface Transaction {
  id: string; amount: number; currency: string; date: string;
  merchant?: string; description?: string; accountId?: string;
  provider?: string; providerTransactionId?: string;
  connectionId?: string; syncedAt?: string;
}
export interface EvidenceItem {
  id: string; label: string; description: string;
  observedValue?: string; source?: string; timestamp?: string; kind?: string;
}
export interface Alert {
  id: string; transactionId: string; type: DetectionType;
  reason: string; severity: AlertSeverity; evidence: EvidenceItem[];
  createdAt: string; status: InvestigationStatus;
  rule?: string; feedback?: AlertFeedback | null;
  history?: StatusEvent[];
}
export interface AlertFeedback {
  response: FeedbackResponse; note?: string | null; updatedAt?: string;
}
export interface StatusEvent {
  previousStatus: string | null; newStatus: string;
  note?: string | null; createdAt: string;
}
export interface RelatedEvent {
  kind: 'transaction' | 'alert'; id: string; date: string;
  merchant?: string; amount?: number; alertType?: string;
  severity?: AlertSeverity; status?: InvestigationStatus;
  relation: string; factual: boolean;
}
export interface InvestigationDetail {
  alert: Alert; transaction: Transaction;
  relatedTransactions: Transaction[]; timeline: EvidenceItem[];
  relatedActivity: RelatedEvent[]; baseline?: BaselineInfo | null;
}
export interface BaselineInfo {
  amount: number; median: number | null; sampleSize: number;
  ratio: number | null; threshold: number; explanation: string;
  insufficient: boolean;
}
export interface DashboardMetrics {
  totalTransactions: number; suspiciousAlerts: number;
  openInvestigations: number; resolvedInvestigations: number;
  activity: { label: string; transactions: number; alerts: number }[];
}
export interface NewTransaction {
  amount: number; date: string; merchant: string;
  description: string; accountId: string;
}
export interface SandboxAccount {
  id: string; nickname: string; type: string; balance: number;
}
export interface Connection {
  id: string; providerAccountId: string; nickname: string;
  accountType: string; balance: number; status: string;
  lastSyncedAt: string | null; lastError: string | null;
}

export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return null;
  return createClient(url, key);
}
let cached: SupabaseClient | null | undefined;
export function supabaseClient(): SupabaseClient | null {
  if (cached === undefined) cached = getSupabase();
  return cached;
}
export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL
    && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
export interface SignalZeroProvider {
  source: DataSource;
  getTransactions(): Promise<Transaction[]>;
  getAlerts(): Promise<Alert[]>;
  getAlertDetails(alertId: string): Promise<InvestigationDetail | null>;
  updateInvestigationStatus(alertId: string, status: InvestigationStatus, note?: string): Promise<Alert>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
}

export function alertTypeToDetection(alertType: string): DetectionType {
  if (alertType.includes('Large')) return 'Unusually large transaction';
  if (alertType.includes('Repeated')) return 'Repeated payment';
  if (alertType.includes('Rapid')) return 'Rapid transactions';
  return 'Other';
}

export const workspaceProvider: SignalZeroProvider = {
  source: 'local_demo',
  async getTransactions() { return []; },
  async getAlertDetails() { return null; },
  async updateInvestigationStatus() {
    throw new Error('Demo mode is read-only.');
  },
  async getDashboardMetrics() {
    return { totalTransactions: 0, suspiciousAlerts: 0,
      openInvestigations: 0, resolvedInvestigations: 0, activity: [] };
  },
  async getAlerts() { return []; },
};

export const activeProvider = workspaceProvider;
export const providerLabel = 'Workspace data';
