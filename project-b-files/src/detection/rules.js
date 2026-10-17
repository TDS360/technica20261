/**
 * The three rule-based detection rules. Each rule is a pure function of
 * (normalized transactions, run context, config) and returns an array of
 * alert objects. Rules never throw on missing optional fields — transactions
 * that lack the data a rule needs are simply skipped by that rule.
 */

import {
  RULE_TYPES,
  SEVERITY_LEVELS,
  makeAlertId,
  formatMoney,
  median,
  round2,
} from './util.js';

const MILLISECONDS_PER_MINUTE = 60 * 1000;

function maxSeverity(a, b) {
  const order = [SEVERITY_LEVELS.LOW, SEVERITY_LEVELS.MEDIUM, SEVERITY_LEVELS.HIGH, SEVERITY_LEVELS.CRITICAL];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function magnitude(amount) {
  return Math.abs(amount ?? 0);
}

function transactionSnapshot(txn) {
  return {
    id: txn.id,
    amount: txn.amount,
    date: txn.date,
    description: txn.description,
    merchantId: txn.merchantId ?? null,
    accountId: txn.accountId ?? null,
    type: txn.type,
  };
}

function baseAlert({ txn, rule, alertType, reason, severity, evidence, detectedAt }) {
  return {
    alertId: makeAlertId(txn.id, rule),
    transactionId: txn.id,
    rule,
    alertType,
    reason,
    severity,
    evidence,
    detectedAt: detectedAt ?? null,
    transaction: transactionSnapshot(txn),
  };
}

export const RULE_DEFINITIONS = Object.freeze({
  [RULE_TYPES.LARGE_TRANSACTION]: { alertType: 'Unusually Large Transaction' },
  [RULE_TYPES.REPEATED_PAYMENT]: { alertType: 'Repeated Payment to Same Merchant' },
  [RULE_TYPES.RAPID_TRANSACTIONS]: { alertType: 'Rapid Burst of Transactions' },
});

/**
 * Rule 1 — unusually large transactions.
 * Flags when the amount is at/above the configured absolute threshold, and/or
 * when it is significantly larger than the account's own baseline (median of
 * prior transactions on the same account, when enough history exists).
 */
export function largeTransactionRule(transactions, context, config) {
  const cfg = config.largeTransaction;
  const alerts = [];

  for (const txn of transactions) {
    if (txn.amount === null) continue;
    const amount = magnitude(txn.amount);

    const overThreshold = amount >= cfg.absoluteThreshold;
    const priorAmounts = txn.accountId ? context.priorAmountsFor(txn) : [];
    const baselineMedian = priorAmounts.length >= cfg.historyMinTransactions ? median(priorAmounts) : null;
    const deviationRatio =
      baselineMedian !== null && baselineMedian > 0 ? round2(amount / baselineMedian) : null;
    const overBaseline = deviationRatio !== null && deviationRatio >= cfg.deviationMultiplier;

    if (!overThreshold && !overBaseline) continue;

    let severity = SEVERITY_LEVELS.LOW;
    if (overThreshold) {
      if (amount >= cfg.absoluteThreshold * cfg.criticalMultiplier) {
        severity = maxSeverity(severity, SEVERITY_LEVELS.CRITICAL);
      } else if (amount >= cfg.absoluteThreshold * cfg.highMultiplier) {
        severity = maxSeverity(severity, SEVERITY_LEVELS.HIGH);
      } else {
        severity = maxSeverity(severity, SEVERITY_LEVELS.MEDIUM);
      }
    }
    if (overBaseline) {
      severity = maxSeverity(
        severity,
        deviationRatio >= cfg.deviationHighRatio ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM
      );
    }

    const thresholdMultiple = round2(amount / cfg.absoluteThreshold);
    const parts = [];
    if (overThreshold) {
      parts.push(
        `amount of ${formatMoney(amount)} is at or above the configured review threshold of ${formatMoney(cfg.absoluteThreshold)} (${thresholdMultiple}x)`
      );
    }
    if (overBaseline) {
      parts.push(
        `it is ${deviationRatio}x the account's typical transaction amount of ${formatMoney(baselineMedian)} (median of ${priorAmounts.length} prior transactions)`
      );
    }

    alerts.push(
      baseAlert({
        txn,
        rule: RULE_TYPES.LARGE_TRANSACTION,
        alertType: RULE_DEFINITIONS[RULE_TYPES.LARGE_TRANSACTION].alertType,
        reason: `Unusually large transaction: ${parts.join(', and ')}.`,
        severity,
        evidence: {
          amount: round2(amount),
          threshold: cfg.absoluteThreshold,
          thresholdMultiple,
          overThreshold,
          baselineMedian: baselineMedian === null ? null : round2(baselineMedian),
          baselineSampleSize: priorAmounts.length,
          deviationRatio,
          overBaseline,
        },
        detectedAt: context.detectedAt,
      })
    );
  }

  return alerts;
}

/**
 * Rule 2 — repeated payments to the same merchant.
 * Clusters transactions on the same merchant whose amounts are similar
 * (within a percentage/floor tolerance) and that occur within the configured
 * window; clusters at or above minCount raise one alert per member.
 * Transactions without a merchant id or a timestamp are skipped.
 */
export function repeatedPaymentRule(transactions, context, config) {
  const cfg = config.repeatedPayment;
  const windowMs = cfg.windowMinutes * MILLISECONDS_PER_MINUTE;
  const alerts = [];

  const groups = new Map();
  for (const txn of transactions) {
    if (!txn.merchantId || txn.amount === null || txn.timestamp === null) continue;
    const key = String(txn.merchantId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(txn);
  }

  for (const [merchantId, group] of groups) {
    const sorted = [...group].sort((a, b) => a.timestamp - b.timestamp);
    const assigned = new Set();

    for (let i = 0; i < sorted.length; i += 1) {
      if (assigned.has(sorted[i].id)) continue;
      const anchor = sorted[i];
      const anchorAmount = magnitude(anchor.amount);
      const tolerance = Math.max(cfg.similarityFloor, anchorAmount * cfg.similarityPercent);

      const cluster = [anchor];
      for (let j = i + 1; j < sorted.length; j += 1) {
        const candidate = sorted[j];
        if (assigned.has(candidate.id)) continue;
        if (candidate.timestamp - anchor.timestamp > windowMs) break;
        if (Math.abs(magnitude(candidate.amount) - anchorAmount) <= tolerance) {
          cluster.push(candidate);
        }
      }

      if (cluster.length < cfg.minCount) continue;
      for (const member of cluster) assigned.add(member.id);

      const clusterTotal = round2(cluster.reduce((sum, t) => sum + magnitude(t.amount), 0));
      const severity =
        cluster.length >= cfg.minCount * 2 || clusterTotal >= cfg.totalAmountHigh
          ? SEVERITY_LEVELS.HIGH
          : SEVERITY_LEVELS.MEDIUM;
      const relatedTransactionIds = cluster.map((t) => t.id);
      const firstAt = new Date(cluster[0].timestamp).toISOString();
      const lastAt = new Date(cluster[cluster.length - 1].timestamp).toISOString();

      for (const member of cluster) {
        alerts.push(
          baseAlert({
            txn: member,
            rule: RULE_TYPES.REPEATED_PAYMENT,
            alertType: RULE_DEFINITIONS[RULE_TYPES.REPEATED_PAYMENT].alertType,
            reason: `${cluster.length} payments of similar amount (about ${formatMoney(anchorAmount)} each, ${formatMoney(clusterTotal)} total) were made to the same merchant within ${cfg.windowMinutes} minutes (${firstAt} to ${lastAt}).`,
            severity,
            evidence: {
              merchantId,
              accountId: member.accountId ?? null,
              paymentCount: cluster.length,
              similarityTolerance: round2(tolerance),
              clusterTotal,
              windowMinutes: cfg.windowMinutes,
              relatedTransactionIds,
              firstAt,
              lastAt,
            },
            detectedAt: context.detectedAt,
          })
        );
      }
    }
  }

  return alerts;
}



/**
 * Rule 3 — rapid transactions.
 * Flags bursts of at least minCount transactions on the same account within
 * the configured window (sliding window over the account's timeline).
 * Transactions without an account id or timestamp are skipped.
 */
export function rapidTransactionsRule(transactions, context, config) {
  const cfg = config.rapidTransactions;
  const windowMs = cfg.windowMinutes * MILLISECONDS_PER_MINUTE;
  const alerts = [];

  for (const [accountId, accountTxns] of context.byAccount) {
    const sorted = [...accountTxns]
      .filter((t) => t.timestamp !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
    // One alert per transaction per rule: a txn already flagged keeps its alert.
    const flagged = new Set();

    for (let end = 0; end < sorted.length; end += 1) {
      const endTxn = sorted[end];
      const windowStart = endTxn.timestamp - windowMs;
      const members = [];
      for (let k = end; k >= 0; k -= 1) {
        const candidate = sorted[k];
        if (candidate.timestamp < windowStart) break;
        members.push(candidate);
      }
      if (members.length < cfg.minCount) continue;

      const unflagged = members.filter((m) => !flagged.has(m.id));
      if (unflagged.length === 0) continue;
      for (const member of unflagged) flagged.add(member.id);

      const ordered = [...members].sort((a, b) => a.timestamp - b.timestamp);
      const totalAmount = round2(ordered.reduce((sum, t) => sum + magnitude(t.amount ?? 0), 0));
      const severity = members.length >= cfg.minCount * 2 ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM;
      const relatedTransactionIds = ordered.map((t) => t.id);
      const windowStartIso = new Date(ordered[0].timestamp).toISOString();
      const windowEndIso = new Date(ordered[ordered.length - 1].timestamp).toISOString();

      for (const member of unflagged) {
        alerts.push(
          baseAlert({
            txn: member,
            rule: RULE_TYPES.RAPID_TRANSACTIONS,
            alertType: RULE_DEFINITIONS[RULE_TYPES.RAPID_TRANSACTIONS].alertType,
            reason: `${ordered.length} transactions occurred on this account within ${cfg.windowMinutes} minutes (${windowStartIso} to ${windowEndIso}), totalling ${formatMoney(totalAmount)}.`,
            severity,
            evidence: {
              accountId,
              transactionCount: ordered.length,
              totalAmount,
              windowMinutes: cfg.windowMinutes,
              relatedTransactionIds,
              windowStart: windowStartIso,
              windowEnd: windowEndIso,
            },
            detectedAt: context.detectedAt,
          })
        );
      }
    }
  }

  return alerts;
}

/** All rules in evaluation order. */
export function getRules() {
  return [largeTransactionRule, repeatedPaymentRule, rapidTransactionsRule];
}

