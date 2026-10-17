/**
 * Investigation details: builds the review record for an alert and tracks an
 * investigation status (Open -> Reviewing -> Resolved) that can be updated at
 * runtime. Statuses live in an in-memory Map by default; if a persistence
 * path is supplied, every mutation is written to a JSON file so the change
 * survives restarts (this is the coordination point with Section 2 — see
 * README.md).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { RULE_TYPES } from '../detection/util.js';

export const INVESTIGATION_STATUSES = Object.freeze(['Open', 'Reviewing', 'Resolved']);
export const DEFAULT_STATUS = 'Open';

const STATUS_TRANSITIONS = {
  Open: new Set(['Open', 'Reviewing', 'Resolved']),
  Reviewing: new Set(['Reviewing', 'Resolved', 'Open']),
  Resolved: new Set(['Resolved', 'Reviewing', 'Open']),
};

export function isValidStatus(status) {
  return INVESTIGATION_STATUSES.includes(status);
}

/** Human-readable explanation of why this activity deserves review. */
function buildExplanation(alert) {
  const tx = alert.transaction ?? {};
  const where = tx.merchantId ? ` at merchant ${tx.merchantId}` : tx.description ? ` (${tx.description})` : '';
  const when = tx.date ? ` on ${tx.date}` : '';
  const evidenceBits = [];

  if (alert.rule === RULE_TYPES.LARGE_TRANSACTION && alert.evidence) {
    if (alert.evidence.overThreshold && alert.evidence.deviationRatio) {
      evidenceBits.push(
        `it exceeds the review threshold and is ${alert.evidence.deviationRatio}x the account's usual amount`
      );
    } else if (alert.evidence.overThreshold) {
      evidenceBits.push(`it exceeds the configured review threshold of ${alert.evidence.threshold}`);
    } else if (alert.evidence.deviationRatio) {
      evidenceBits.push(`it is ${alert.evidence.deviationRatio}x the account's typical amount`);
    }
  } else if (alert.rule === RULE_TYPES.REPEATED_PAYMENT && alert.evidence) {
    evidenceBits.push(
      `${alert.evidence.paymentCount} near-identical payments (${alert.evidence.clusterTotal} total) hit the same merchant inside ${alert.evidence.windowMinutes} minutes, which can indicate duplicate charges, card testing, or an over-eager subscription retry`
    );
  } else if (alert.rule === RULE_TYPES.RAPID_TRANSACTIONS && alert.evidence) {
    evidenceBits.push(
      `${alert.evidence.transactionCount} transactions cleared within ${alert.evidence.windowMinutes} minutes, which can indicate card cloning, automation, or an account under someone else's control`
    );
  }

  const basis = evidenceBits.length > 0 ? evidenceBits.join('; ') : alert.reason;
  return (
    `A transaction of ${tx.amount ?? alert.evidence?.amount ?? 'unknown amount'}` +
    `${where}${when} was flagged by the ${alert.alertType} rule because ${basis}. ` +
    `This is a rule-based signal for analyst review, not proof of fraud — a legitimate explanation may exist.`
  );
}

/** Build the investigation record shown for a single alert. */
export function buildInvestigation(alert) {
  const now = alert.detectedAt ?? new Date().toISOString();
  return {
    alertId: alert.alertId,
    transactionId: alert.transactionId,
    transaction: alert.transaction ?? null,
    rule: alert.rule,
    alertType: alert.alertType,
    reason: alert.reason,
    severity: alert.severity,
    evidence: alert.evidence ?? {},
    explanation: buildExplanation(alert),
    status: DEFAULT_STATUS,
    statusHistory: [{ status: DEFAULT_STATUS, changedAt: now, note: 'Alert created' }],
    detectedAt: alert.detectedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
}


export function createInvestigationStore({ persistencePath } = {}) {
  /** @type {Map<string, any>} */
  const investigations = new Map();

  function load() {
    if (!persistencePath || !existsSync(persistencePath)) return;
    try {
      const raw = JSON.parse(readFileSync(persistencePath, 'utf8'));
      const records = Array.isArray(raw) ? raw : Array.isArray(raw?.investigations) ? raw.investigations : [];
      for (const record of records) {
        if (record && typeof record.alertId === 'string') investigations.set(record.alertId, record);
      }
    } catch {
      // A corrupt/absent file must never crash detection — start fresh.
    }
  }

  function persist() {
    if (!persistencePath) return;
    try {
      writeFileSync(
        persistencePath,
        JSON.stringify({ investigations: [...investigations.values()] }, null, 2),
        'utf8'
      );
    } catch {
      // Persistence is best-effort; in-memory state remains authoritative.
    }
  }

  load();

  return {
    /** Register alerts as new investigations (existing ones are kept as-is). */
    registerAlerts(alerts) {
      for (const alert of alerts) {
        if (!investigations.has(alert.alertId)) {
          investigations.set(alert.alertId, buildInvestigation(alert));
        }
      }
      persist();
      return this.list();
    },

    get(alertId) {
      return investigations.get(alertId) ?? null;
    },

    list({ status } = {}) {
      const all = [...investigations.values()];
      return status ? all.filter((inv) => inv.status === status) : all;
    },

    updateStatus(alertId, status, { note, changedAt } = {}) {
      const investigation = investigations.get(alertId);
      if (!investigation) {
        throw new Error(`Investigation not found for alert: ${alertId}`);
      }
      if (!isValidStatus(status)) {
        throw new Error(
          `Invalid status "${status}". Allowed statuses: ${INVESTIGATION_STATUSES.join(', ')}`
        );
      }
      const previous = investigation.status;
      if (!STATUS_TRANSITIONS[previous].has(status)) {
        throw new Error(`Invalid status transition from "${previous}" to "${status}"`);
      }
      const timestamp = changedAt ?? new Date().toISOString();
      investigation.status = status;
      investigation.updatedAt = timestamp;
      investigation.statusHistory.push({
        status,
        previousStatus: previous,
        changedAt: timestamp,
        note: note ?? null,
      });
      persist();
      return investigation;
    },

    clear() {
      investigations.clear();
      persist();
    },
  };
}
