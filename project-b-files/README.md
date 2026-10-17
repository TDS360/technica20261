# SignalZero — Section 1: Suspicious Transaction Detection & Investigation Details

Rule-based (no ML) detection module plus investigation/status logic.
Plain JavaScript (ESM), **zero dependencies**, Node >= 18. Section 2 imports
this directly — no server or build step required.

## Quick start

```bash
npm test              # acceptance tests (node:test)
node scripts/demo.js  # smoke test against mock data
```

## Integration contract (Section 2)

```js
import {
  detectSuspiciousTransactions,
  getInvestigation,
  listInvestigations,
  updateInvestigationStatus,
  INVESTIGATION_STATUSES,
  createSignalZero,
  mockTransactions,
} from '<relative-path>/src/index.js';

// 1. Run detection (pass Nessie transactions once Section 2 has them;
//    shapes are identical to mockTransactions until then).
const { alerts, investigations, summary } = detectSuspiciousTransactions(transactions, {
  now: '2026-02-15T14:00:00Z', // optional; defaults to current time
});

// 2. Show investigation details for a selected alert.
const details = getInvestigation(alerts[0].alertId);

// 3. Update status: 'Open' | 'Reviewing' | 'Resolved'.
updateInvestigationStatus(alerts[0].alertId, 'Reviewing', { note: 'Analyst assigned' });

// 4. Filter lists for the dashboard.
listInvestigations({ status: 'Open' });
```

All return values are plain JSON-serializable objects — safe to POST/serve
as-is from Section 2's dashboard/report code.

### Input shape (Nessie transaction)

```jsonc
{
  "_id": "txn-1008",
  "amount": 4500,
  "date": "2026-02-08T02:13:00Z",
  "description": "Electronics Warehouse",
  "merchant_id": "mer-electronics",
  "account_id": "acc-A",
  "type": "purchase",
  "status": "completed"
}
```

`amount`, `date`, `merchant_id`, and `account_id` are optional — rules that
need a missing field skip that transaction instead of crashing. camelCase
aliases (`id`, `merchantId`, `accountId`, `timestamp`) are also accepted.

### Alert shape (output of `detectSuspiciousTransactions`)

```jsonc
{
  "alertId": "ALT-LT-d9db25f1",        // unique, deterministic per (txn, rule)
  "transactionId": "txn-1008",
  "rule": "LARGE_TRANSACTION",          // LARGE_TRANSACTION | REPEATED_PAYMENT | RAPID_TRANSACTIONS
  "alertType": "Unusually Large Transaction",
  "reason": "Unusually large transaction: amount of $4,500.00 ... (150x ...).",
  "severity": "high",                   // low | medium | high | critical
  "evidence": { /* rule-specific structured evidence */ },
  "detectedAt": "2026-02-15T14:00:00Z",
  "transaction": { /* snapshot: id, amount, date, description, merchantId, accountId, type */ }
}
```

`summary` = `{ transactionsProcessed, alertCount, bySeverity, byRule }`.

### Investigation shape (output of `getInvestigation` / `listInvestigations`)

```jsonc
{
  "alertId": "ALT-LT-d9db25f1",
  "transactionId": "txn-1008",
  "transaction": { "amount": 4500, "date": "...", "merchantId": "mer-electronics" },
  "rule": "LARGE_TRANSACTION",
  "alertType": "Unusually Large Transaction",
  "reason": "...",                      // why it was flagged
  "severity": "high",
  "evidence": { "...": "same evidence the alert carried" },
  "explanation": "A transaction of 4500 at merchant ... deserves review because ... not proof of fraud ...",
  "status": "Open",                     // Open | Reviewing | Resolved
  "statusHistory": [{ "status": "Open", "changedAt": "...", "note": "Alert created" }],
  "detectedAt": "...", "createdAt": "...", "updatedAt": "..."
}
```

Status updates are validated (unknown alert → error, invalid status → error)

## The three rules (defaults — all configurable)

| Rule | Trigger | Default config key |
|---|---|---|
| `LARGE_TRANSACTION` | amount ≥ threshold, **or** ≥ 5× the median of the account's ≥5 prior transactions | `largeTransaction.absoluteThreshold: 1000`, `.deviationMultiplier: 5`, `.historyMinTransactions: 5` |
| `REPEATED_PAYMENT` | ≥ 3 payments to the **same `merchant_id`** within 60 min, amounts within 5% (or $2) | `repeatedPayment.minCount: 3`, `.windowMinutes: 60` |
| `RAPID_TRANSACTIONS` | ≥ 4 transactions on the **same `account_id`** within 10 minutes | `rapidTransactions.minCount: 4`, `.windowMinutes: 10` |

Override per instance:

```js
const sz = createSignalZero({ config: { largeTransaction: { absoluteThreshold: 500 } } });
```

Severity: large → medium/high/critical by multiple of threshold; repeated →
medium (high at ≥6 payments or ≥ $1,000 total); rapid → medium (high at ≥8).

## Persistence coordination (Section 1 ↔ Section 2)

By default investigations live in memory (fine for the demo session). If
Section 2 wants statuses to survive restarts, pass a file path:

```js
const sz = createSignalZero({ persistencePath: './investigations.json' });
```

Every status change is written to that JSON file, and a fresh instance
reloads it. If Section 2 prefers another store (DB, backend endpoint),
keep this module as the source of truth and call
`updateInvestigationStatus` from your API route, or wrap the store shape
`{ registerAlerts, get, list, updateStatus, clear }`.

## Layout

```
src/index.js                 # public API (import this)
src/detection/config.js      # defaults + config merging
src/detection/util.js        # normalization, IDs, severity, formatting
src/detection/rules.js       # the three rules
src/detection/engine.js      # orchestration, dedupe, ranking, summary
src/detection/mockData.js    # Nessie-shaped mock transactions
src/investigations/store.js  # investigation records + status + persistence
scripts/demo.js              # manual smoke test
test/detection.test.js       # acceptance tests
```

## Notes / assumptions

- Amounts are treated as USD and compared by magnitude (negatives allowed).
- A flagged transaction is a **potential risk, not proof of fraud** — every
  reason/explanation says so explicitly.
- Only fields actually present in the Nessie transaction payload are used;
  no invented merchant names or account metadata.
- Alert IDs are deterministic (`ALT-{LT|RP|RT}-{hash(txnId+rule)}`), so
  re-running detection over the same data yields the same IDs and does not
  duplicate investigations or clobber statuses.

and appended to `statusHistory`, so the dashboard can show an audit trail.
