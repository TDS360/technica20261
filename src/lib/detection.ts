// SignalZero detection engine (TypeScript port of project-b-files/).
// Source of truth for rules stays in project-b-files/; this vendored port
// mirrors its behavior so the Vite app can run detection in-browser.
export type EngineSeverity = 'low' | 'medium' | 'high' | 'critical';
export type EngineRule =
  | 'LARGE_TRANSACTION' | 'REPEATED_PAYMENT' | 'RAPID_TRANSACTIONS';

export interface NormalizedTxn {
  id: string; amount: number | null; timestamp: number | null;
  date: string | null; merchantId: string | null; accountId: string | null;
  description: string | null; type: string | null; status: string | null;
}
export interface EngineAlert {
  alertId: string; transactionId: string; rule: EngineRule;
  alertType: string; reason: string; severity: EngineSeverity;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evidence: Record<string, any>; detectedAt: string | null;
  transaction: { id: string; amount: number | null; date: string | null;
    description: string | null; merchantId: string | null;
    accountId: string | null; type: string | null };
}
export interface DetectionConfig {
  largeTransaction: { absoluteThreshold: number; highMultiplier: number;
    criticalMultiplier: number; historyMinTransactions: number;
    deviationMultiplier: number; deviationHighRatio: number };
  repeatedPayment: { windowMinutes: number; minCount: number;
    similarityPercent: number; similarityFloor: number;
    totalAmountHigh: number };
  rapidTransactions: { windowMinutes: number; minCount: number;
    highCountMultiplier: number };
}
export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  largeTransaction: { absoluteThreshold: 1000, highMultiplier: 5,
    criticalMultiplier: 10, historyMinTransactions: 5,
    deviationMultiplier: 5, deviationHighRatio: 10 },
  repeatedPayment: { windowMinutes: 60, minCount: 3,
    similarityPercent: 0.05, similarityFloor: 2, totalAmountHigh: 1000 },
  rapidTransactions: { windowMinutes: 10, minCount: 4,
    highCountMultiplier: 1.5 },
};
const RULE_ALERT_TYPE: Record<EngineRule, string> = {
  LARGE_TRANSACTION: 'Unusually Large Transaction',
  REPEATED_PAYMENT: 'Repeated Payment to Same Merchant',
  RAPID_TRANSACTIONS: 'Rapid Burst of Transactions',
};
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function toTs(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}
function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function money(v: number): string {
  return new Intl.NumberFormat('en-US',
    { style: 'currency', currency: 'USD' }).format(v);
}
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const PREFIX: Record<EngineRule, string> = {
  LARGE_TRANSACTION: 'LT', REPEATED_PAYMENT: 'RP', RAPID_TRANSACTIONS: 'RT',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeTransaction(raw: any, index: number): NormalizedTxn | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = raw._id ?? raw.id ?? raw.transactionId
    ?? raw.transaction_id ?? `txn_fallback_${index}`;
  const amount = toNum(raw.amount);
  const timestamp = toTs(raw.date ?? raw.purchase_date ?? raw.dateISO
    ?? raw.timestamp ?? raw.createdAt ?? raw.created_at);
  return {
    id: String(id),
    amount: amount === null ? null : Math.abs(amount),
    timestamp,
    date: timestamp === null ? null : new Date(timestamp).toISOString(),
    merchantId: raw.merchant_id ?? raw.merchantId ?? null,
    accountId: raw.account_id ?? raw.accountId ?? raw.account_id_text ?? null,
    description: typeof raw.description === 'string' && raw.description.trim() !== ''
      ? raw.description : null,
    type: typeof raw.type === 'string' ? raw.type : null,
    status: typeof raw.status === 'string' ? raw.status : null,
  };
}

function baseAlert(txn: NormalizedTxn, rule: EngineRule, reason: string,
  severity: EngineSeverity, evidence: EngineAlert['evidence'],
  detectedAt: string | null): EngineAlert {
  return {
    alertId: `ALT-${PREFIX[rule]}-${fnv1a(`${txn.id}|${rule}`)}`,
    transactionId: txn.id,
    rule,
    alertType: RULE_ALERT_TYPE[rule],
    reason,
    severity,
    evidence,
    detectedAt,
    transaction: { id: txn.id, amount: txn.amount, date: txn.date,
      description: txn.description, merchantId: txn.merchantId,
      accountId: txn.accountId, type: txn.type },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function detectTransactions(rawTxns: any[],
  cfg: DetectionConfig = DEFAULT_DETECTION_CONFIG,
  now?: string): { alerts: EngineAlert[] } {
  const detectedAt = now ?? new Date().toISOString();
  const normalized: NormalizedTxn[] = [];
  (Array.isArray(rawTxns) ? rawTxns : []).forEach((r, i) => {
    const t = normalizeTransaction(r, i);
    if (t) normalized.push(t);
  });
  const byAccount = new Map<string, NormalizedTxn[]>();
  for (const t of normalized) {
    if (!t.accountId) continue;
    const k = String(t.accountId);
    if (!byAccount.has(k)) byAccount.set(k, []);
    byAccount.get(k)!.push(t);
  }
  const cache = new Map<string, Map<string, number[]>>();
  const priorAmounts = (txn: NormalizedTxn): number[] => {
    if (!txn.accountId) return [];
    const key = String(txn.accountId);
    if (!cache.has(key)) {
      const ordered = (byAccount.get(key) ?? [])
        .filter((t) => t.amount !== null)
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
      const prefix: number[] = [];
      const map = new Map<string, number[]>();
      for (const t of ordered) {
        map.set(t.id, [...prefix]);
        prefix.push(Math.abs(t.amount ?? 0));
      }
      cache.set(key, map);
    }
    return cache.get(key)!.get(txn.id) ?? [];
  };
  const alerts: EngineAlert[] = [];
  const rankOf = { low: 0, medium: 1, high: 2, critical: 3 };
  for (const txn of normalized) {
    if (txn.amount === null) continue;
    const amount = Math.abs(txn.amount);
    const c = cfg.largeTransaction;
    const priors = txn.accountId ? priorAmounts(txn) : [];
    const med = priors.length >= c.historyMinTransactions
      ? median(priors) : null;
    const ratio = med !== null && med > 0
      ? Math.round((amount / med) * 100) / 100 : null;
    const overT = amount >= c.absoluteThreshold;
    const overB = ratio !== null && ratio >= c.deviationMultiplier;
    if (!overT && !overB) continue;
    let sev: EngineSeverity = 'low';
    if (overT) {
      sev = amount >= c.absoluteThreshold * c.criticalMultiplier
        ? 'critical'
        : amount >= c.absoluteThreshold * c.highMultiplier ? 'high' : 'medium';
    }
    if (overB) {
      const b: EngineSeverity = (ratio ?? 0) >= c.deviationHighRatio
        ? 'high' : 'medium';
      sev = rankOf[b] > rankOf[sev] ? b : sev;
    }
    const parts: string[] = [];
    if (overT) {
      parts.push(`amount of ${money(amount)} is at or above ${money(c.absoluteThreshold)}`);
    }
    if (overB) {
      parts.push(`it is ${ratio}x the typical ${money(med ?? 0)} (median of ${priors.length} prior)`);
    }
    alerts.push(baseAlert(txn, 'LARGE_TRANSACTION',
      `Unusually large transaction: ${parts.join(', and ')}.`, sev, {
        amount: Math.round(amount * 100) / 100, threshold: c.absoluteThreshold,
        overThreshold: overT, baselineMedian: med, baselineSampleSize: priors.length,
        deviationRatio: ratio, overBaseline: overB,
      }, detectedAt));
  }
  detectRepeated(normalized, byAccount, cfg, detectedAt, alerts);
  detectRapid(byAccount, cfg, detectedAt, alerts);
  return finish(alerts);
}

function detectRepeated(normalized: NormalizedTxn[],
  _byAccount: Map<string, NormalizedTxn[]>,
  cfg: DetectionConfig, detectedAt: string, alerts: EngineAlert[]) {
  const c = cfg.repeatedPayment;
  const groups = new Map<string, NormalizedTxn[]>();
  for (const t of normalized) {
    if (!t.merchantId || t.amount === null || t.timestamp === null) continue;
    const k = String(t.merchantId);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  for (const [merchantId, group] of groups) {
    const sorted = [...group].sort((a, b) => a.timestamp! - b.timestamp!);
    const assigned = new Set<string>();
    for (let i = 0; i < sorted.length; i += 1) {
      if (assigned.has(sorted[i].id)) continue;
      const anchor = sorted[i];
      const anchorAmt = Math.abs(anchor.amount ?? 0);
      const tol = Math.max(c.similarityFloor, anchorAmt * c.similarityPercent);
      const cluster = [anchor];
      for (let j = i + 1; j < sorted.length; j += 1) {
        const cand = sorted[j];
        if (assigned.has(cand.id)) continue;
        if (cand.timestamp! - anchor.timestamp! > c.windowMinutes * 60000) break;
        if (Math.abs(Math.abs(cand.amount ?? 0) - anchorAmt) <= tol) cluster.push(cand);
      }
      if (cluster.length < c.minCount) continue;
      cluster.forEach((m) => assigned.add(m.id));
      const total = Math.round(cluster.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0) * 100) / 100;
      const sev: EngineSeverity =
        (cluster.length >= c.minCount * 2 || total >= c.totalAmountHigh)
          ? 'high' : 'medium';
      const first = new Date(cluster[0].timestamp!).toISOString();
      const last = new Date(cluster[cluster.length - 1].timestamp!).toISOString();
      for (const m of cluster) {
        alerts.push(baseAlert(m, 'REPEATED_PAYMENT',
          `${cluster.length} payments of similar amount (about ${money(anchorAmt)} each, ${money(total)} total) were made to the same merchant within ${c.windowMinutes} minutes.`,
          sev, { merchantId, accountId: m.accountId ?? null,
            paymentCount: cluster.length, clusterTotal: total,
            windowMinutes: c.windowMinutes,
            relatedTransactionIds: cluster.map((t) => t.id),
            firstAt: first, lastAt: last }, detectedAt));
      }
    }
  }
}

function detectRapid(byAccount: Map<string, NormalizedTxn[]>,
  cfg: DetectionConfig, detectedAt: string, alerts: EngineAlert[]) {
  const c = cfg.rapidTransactions;
  for (const [accountId, list] of byAccount) {
    const sorted = list.filter((t) => t.timestamp !== null)
      .sort((a, b) => a.timestamp! - b.timestamp!);
    const flagged = new Set<string>();
    for (let end = 0; end < sorted.length; end += 1) {
      const endTxn = sorted[end];
      const start = endTxn.timestamp! - c.windowMinutes * 60000;
      const members: NormalizedTxn[] = [];
      for (let k = end; k >= 0; k -= 1) {
        if (sorted[k].timestamp! < start) break;
        members.push(sorted[k]);
      }
      if (members.length < c.minCount) continue;
      const fresh = members.filter((m) => !flagged.has(m.id));
      if (!fresh.length) continue;
      fresh.forEach((m) => flagged.add(m.id));
      const ordered = [...members].sort((a, b) => a.timestamp! - b.timestamp!);
      const total = Math.round(ordered.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0) * 100) / 100;
      const sev: EngineSeverity =
        members.length >= Math.ceil(c.minCount * c.highCountMultiplier)
          ? 'high' : 'medium';
      const ws = new Date(ordered[0].timestamp!).toISOString();
      const we = new Date(ordered[ordered.length - 1].timestamp!).toISOString();
      for (const m of fresh) {
        alerts.push(baseAlert(m, 'RAPID_TRANSACTIONS',
          `${ordered.length} transactions occurred on this account within ${c.windowMinutes} minutes, totalling ${money(total)}.`,
          sev, { accountId, transactionCount: ordered.length,
            totalAmount: total, windowMinutes: c.windowMinutes,
            relatedTransactionIds: ordered.map((t) => t.id),
            windowStart: ws, windowEnd: we }, detectedAt));
      }
    }
  }
}

function finish(alerts: EngineAlert[]): { alerts: EngineAlert[] } {
  const order = { critical: 3, high: 2, medium: 1, low: 0 };
  const seen = new Set<string>();
  const out = alerts.filter((a) => {
    if (seen.has(a.alertId)) return false;
    seen.add(a.alertId);
    return true;
  });
  out.sort((a, b) => (order[b.severity] - order[a.severity])
    || a.rule.localeCompare(b.rule)
    || a.transactionId.localeCompare(b.transactionId));
  return { alerts: out };
}
