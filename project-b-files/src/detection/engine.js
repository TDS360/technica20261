/**
 * Detection engine: normalizes raw (Nessie-shaped) transactions, builds a run
 * context, applies every rule, dedupes and ranks the resulting alerts, and
 * returns them with a small summary. Section 2 should call
 * `detectSuspiciousTransactions` (or the `analyze` method on the wired
 * SignalZero instance from src/index.js).
 */

import { mergeConfig, DEFAULT_DETECTION_CONFIG } from './config.js';
import { getRules } from './rules.js';
import { normalizeTransaction, SEVERITY_LEVELS } from './util.js';

const SEVERITY_ORDER = {
  [SEVERITY_LEVELS.CRITICAL]: 3,
  [SEVERITY_LEVELS.HIGH]: 2,
  [SEVERITY_LEVELS.MEDIUM]: 1,
  [SEVERITY_LEVELS.LOW]: 0,
};

export function createDetectionEngine({ config } = {}) {
  const resolvedConfig = mergeConfig(config ?? DEFAULT_DETECTION_CONFIG);
  const rules = getRules();

  function detectTransactions(transactions, { now } = {}) {
    const detectedAt = (now instanceof Date ? now.toISOString() : now) ?? new Date().toISOString();

    const normalized = [];
    for (const [index, raw] of (Array.isArray(transactions) ? transactions : []).entries()) {
      const txn = normalizeTransaction(raw, index);
      if (txn) normalized.push(txn);
    }

    // Run context: per-account grouping and lazy "prior amounts" baselines.
    const byAccount = new Map();
    for (const txn of normalized) {
      if (!txn.accountId) continue;
      const key = String(txn.accountId);
      if (!byAccount.has(key)) byAccount.set(key, []);
      byAccount.get(key).push(txn);
    }

    const baselineCache = new Map();
    function priorAmountsFor(txn) {
      if (!txn.accountId) return [];
      const accountKey = String(txn.accountId);
      if (!baselineCache.has(accountKey)) {
        const accountTxns = byAccount.get(accountKey) ?? [];
        const ordered = accountTxns
          .filter((t) => t.amount !== null)
          .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        const prefix = [];
        const prefixes = new Map();
        for (const t of ordered) {
          prefixes.set(t.id, prefix.slice());
          prefix.push(Math.abs(t.amount));
        }
        baselineCache.set(accountKey, prefixes);
      }
      return baselineCache.get(accountKey).get(txn.id) ?? [];
    }

    const context = { byAccount, priorAmountsFor, detectedAt, config: resolvedConfig };

    const seen = new Set();
    const alerts = [];
    for (const rule of rules) {
      for (const alert of rule(normalized, context, resolvedConfig)) {
        if (seen.has(alert.alertId)) continue;
        seen.add(alert.alertId);
        alerts.push(alert);
      }
    }

    alerts.sort(
      (a, b) =>
        (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0) ||
        a.rule.localeCompare(b.rule) ||
        a.transactionId.localeCompare(b.transactionId)
    );

    return { alerts, summary: summarize(normalized, alerts) };
  }

  return { detectTransactions, config: resolvedConfig };
}

function summarize(transactions, alerts) {
  const bySeverity = {
    [SEVERITY_LEVELS.CRITICAL]: 0,
    [SEVERITY_LEVELS.HIGH]: 0,
    [SEVERITY_LEVELS.MEDIUM]: 0,
    [SEVERITY_LEVELS.LOW]: 0,
  };
  const byRule = { LARGE_TRANSACTION: 0, REPEATED_PAYMENT: 0, RAPID_TRANSACTIONS: 0 };
  for (const alert of alerts) {
    if (bySeverity[alert.severity] !== undefined) bySeverity[alert.severity] += 1;
    if (byRule[alert.rule] !== undefined) byRule[alert.rule] += 1;
  }
  return {
    transactionsProcessed: transactions.length,
    alertCount: alerts.length,
    bySeverity,
    byRule,
  };
}
