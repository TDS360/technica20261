import { createDetectionEngine } from '../../project-b-files/src/detection/engine.js';
import { DEFAULT_DETECTION_CONFIG } from '../../project-b-files/src/detection/config.js';
import type { Transaction } from './signalzero';

export interface EngineAlert {
  alertId: string;
  transactionId: string;
  rule: 'LARGE_TRANSACTION' | 'REPEATED_PAYMENT' | 'RAPID_TRANSACTIONS';
  alertType: string;
  reason: string;
  severity: string;
  evidence: Record<string, any>;
  detectedAt: string;
}

export interface DetectionResult {
  alerts: EngineAlert[];
  summary: {
    transactionsProcessed: number;
    alertCount: number;
    bySeverity: Record<string, number>;
    byRule: Record<string, number>;
  };
}

const engine = createDetectionEngine({
  config: DEFAULT_DETECTION_CONFIG,
});

export function detectTransactions(
  transactions: Array<Record<string, unknown>>,
): DetectionResult {
  const normalized = transactions.map((transaction) => ({
    ...transaction,
    _id: String(
      transaction._id ??
      transaction.id ??
      transaction.transactionId ??
      '',
    ),
    amount: Number(transaction.amount ?? 0),
    date: String(
      transaction.date ??
      transaction.transaction_date ??
      new Date().toISOString(),
    ),
    description: String(transaction.description ?? ''),
    merchant_id: String(
      transaction.merchant_id ??
      transaction.merchantId ??
      transaction.merchant_ref ??
      transaction.merchant ??
      'unknown',
    ),
    account_id: String(
      transaction.account_id ??
      transaction.accountId ??
      '',
    ),
  }));

  const result = engine.detectSuspiciousTransactions(normalized);

  return {
    alerts: result.alerts.map((alert: any) => ({
      alertId: String(alert.alertId),
      transactionId: String(alert.transactionId),
      rule: alert.rule,
      alertType: String(alert.alertType ?? alert.rule),
      reason: String(alert.reason),
      severity: String(alert.severity).toLowerCase(),
      evidence: alert.evidence ?? {},
      detectedAt: String(
        alert.detectedAt ?? new Date().toISOString(),
      ),
    })),
    summary: result.summary,
  };
}
