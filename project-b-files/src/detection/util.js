/**
 * Shared helpers for normalization, IDs, severity and formatting.
 * Every helper here is total: they never throw on malformed input.
 */

export const RULE_TYPES = Object.freeze({
  LARGE_TRANSACTION: 'LARGE_TRANSACTION',
  REPEATED_PAYMENT: 'REPEATED_PAYMENT',
  RAPID_TRANSACTIONS: 'RAPID_TRANSACTIONS',
});

export const SEVERITY_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const SEVERITY_RANKS = { low: 1, medium: 2, high: 3, critical: 4 };
const RANK_TO_SEVERITY = { 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' };

const RULE_ID_PREFIX = {
  [RULE_TYPES.LARGE_TRANSACTION]: 'LT',
  [RULE_TYPES.REPEATED_PAYMENT]: 'RP',
  [RULE_TYPES.RAPID_TRANSACTIONS]: 'RT',
};

export function severityRank(severity) {
  return SEVERITY_RANKS[severity] ?? 0;
}

export function severityFromRank(rank) {
  return RANK_TO_SEVERITY[rank] ?? 'low';
}

/** Round to 2 decimals for evidence payloads. */
export function round2(value) {
  return Math.round(value * 100) / 100;
}

export function formatMoney(value) {
  if (!Number.isFinite(value)) return 'an unknown amount';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

/** Parse a value into a finite number, or null. Accepts numeric strings. */
export function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Parse a timestamp (ISO string, Date, or epoch millis) into epoch millis, or null. */
export function parseTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function toIsoString(value) {
  const time = parseTimestamp(value);
  return time === null ? null : new Date(time).toISOString();
}

export function timestampToIso(time) {
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Stable FNV-1a hash so alert IDs are deterministic across runs. */
export function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function makeAlertId(transactionId, ruleCode) {
  return `ALT-${RULE_ID_PREFIX[ruleCode] ?? 'XX'}-${fnv1aHex(`${transactionId}|${ruleCode}`)}`;
}

/**
 * Normalize a raw (Nessie-style) transaction into an internal shape.
 * Supports Nessie fields (_id, account_id, merchant_id, amount, date,
 * description, type, status) and common camelCase aliases. Returns null
 * only when the input is not an object at all.
 */
export function normalizeTransaction(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const id = raw._id ?? raw.id ?? raw.transactionId ?? raw.transaction_id ?? `txn_fallback_${index}`;
  const amount = toFiniteNumber(raw.amount);
  const timestamp = parseTimestamp(raw.date ?? raw.dateISO ?? raw.timestamp ?? raw.createdAt ?? raw.created_at);

  return {
    id: String(id),
    amount: amount === null ? null : Math.abs(amount),
    timestamp,
    date: timestampToIso(timestamp),
    merchantId: raw.merchant_id ?? raw.merchantId ?? null,
    accountId: raw.account_id ?? raw.accountId ?? null,
    description: typeof raw.description === 'string' && raw.description.trim() !== '' ? raw.description : null,
    type: typeof raw.type === 'string' ? raw.type : null,
    status: typeof raw.status === 'string' ? raw.status : null,
  };
}

/** Public snapshot of a transaction attached to alerts and investigations. */
export function publicTransaction(txn) {
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
