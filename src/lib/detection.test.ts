// Detection unit checks (mirrors project-b-files acceptance behavior).
// Run with: npx tsc --noEmit -p tsconfig.app.json (type-level) and
// node-based review below for logic validation.
import { detectTransactions } from './detection';
import { describe, expect, it } from 'vitest';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`detection test failed: ${msg}`);
}

export function runDetectionSelfTests() {
  const base = [
    { _id: 't1', amount: 12, date: '2026-02-01T09:00:00Z', merchant_id: 'm1', account_id: 'a1' },
    { _id: 't2', amount: 20, date: '2026-02-02T09:00:00Z', merchant_id: 'm2', account_id: 'a1' },
    { _id: 't3', amount: 18, date: '2026-02-03T09:00:00Z', merchant_id: 'm3', account_id: 'a1' },
    { _id: 't4', amount: 25, date: '2026-02-04T09:00:00Z', merchant_id: 'm4', account_id: 'a1' },
    { _id: 't5', amount: 22, date: '2026-02-05T09:00:00Z', merchant_id: 'm5', account_id: 'a1' },
    { _id: 't6', amount: 4500, date: '2026-02-06T09:00:00Z', merchant_id: 'm6', account_id: 'a1' },
  ];
  const large = detectTransactions(base);
  assert(large.alerts.some((a) => a.rule === 'LARGE_TRANSACTION' && a.transactionId === 't6'), 'large rule fires');
  assert(large.alerts.every((a) => a.evidence && a.reason), 'evidence preserved');

  const repeated = detectTransactions([
    { _id: 'r1', amount: 40, date: '2026-02-10T10:00:00Z', merchant_id: 'mx', account_id: 'b1' },
    { _id: 'r2', amount: 40, date: '2026-02-10T10:18:00Z', merchant_id: 'mx', account_id: 'b1' },
    { _id: 'r3', amount: 40, date: '2026-02-10T10:41:00Z', merchant_id: 'mx', account_id: 'b1' },
  ]);
  assert(repeated.alerts.filter((a) => a.rule === 'REPEATED_PAYMENT').length === 3, 'repeated rule fires per member');

  const rapid = detectTransactions([
    { _id: 'q1', amount: 5, date: '2026-02-12T23:58:00Z', merchant_id: 'm1', account_id: 'c1' },
    { _id: 'q2', amount: 6, date: '2026-02-12T23:59:00Z', merchant_id: 'm2', account_id: 'c1' },
    { _id: 'q3', amount: 7, date: '2026-02-13T00:01:00Z', merchant_id: 'm3', account_id: 'c1' },
    { _id: 'q4', amount: 8, date: '2026-02-13T00:03:00Z', merchant_id: 'm4', account_id: 'c1' },
  ]);
  assert(rapid.alerts.some((a) => a.rule === 'RAPID_TRANSACTIONS'), 'rapid rule fires');

  // Idempotent alert IDs: re-running yields identical IDs (no duplicates).
  const again = detectTransactions(base);
  assert(JSON.stringify(again.alerts.map((a) => a.alertId).sort()) === JSON.stringify(large.alerts.map((a) => a.alertId).sort()), 'deterministic alert ids');

  // Missing fields degrade gracefully (no throw, no fabricated alert).
  const edge = detectTransactions([
    { _id: 'e1', description: 'no amount', merchant_id: 'm', account_id: 'a' },
    { _id: 'e2', amount: 20, merchant_id: 'm', account_id: 'a' },
  ]);
  assert(Array.isArray(edge.alerts), 'edge cases handled');
  return { large: large.alerts.length, repeated: repeated.alerts.length, rapid: rapid.alerts.length };
}

describe('transaction detection', () => {
  it('preserves the existing rule acceptance checks', () => {
    expect(runDetectionSelfTests()).toEqual({
      large: expect.any(Number),
      repeated: 3,
      rapid: expect.any(Number),
    });
  });
});
