/**
 * Section 1 acceptance tests: `npm test` (node --test).
 * Covers the three detection rules, negative cases, missing-field robustness,
 * alert shape, investigation details/status updates, and Section-2 integration
 * surface.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createSignalZero,
  detectSuspiciousTransactions,
  getInvestigation,
  listInvestigations,
  updateInvestigationStatus,
  resetInvestigations,
  createInvestigationStore,
  INVESTIGATION_STATUSES,
  RULE_TYPES,
  SEVERITY_LEVELS,
  DEFAULT_DETECTION_CONFIG,
  mockTransactions,
} from '../src/index.js';

const NOW = '2026-02-15T14:00:00Z';

function detect(txns, config) {
  const instance = createSignalZero({ config });
  return instance.detectSuspiciousTransactions(txns, { now: NOW });
}

function tx(overrides) {
  return { type: 'purchase', status: 'completed', ...overrides };
}

const REQUIRED_ALERT_FIELDS = [
  'alertId',
  'transactionId',
  'rule',
  'alertType',
  'reason',
  'severity',
  'evidence',
  'detectedAt',
];

function assertWellFormedAlert(alert) {
  for (const field of REQUIRED_ALERT_FIELDS) {
    assert.ok(alert[field] !== undefined && alert[field] !== null, `alert missing ${field}`);
  }
  assert.match(alert.alertId, /^ALT-/);
  assert.ok(Object.values(RULE_TYPES).includes(alert.rule), `unknown rule ${alert.rule}`);
  assert.ok(Object.values(SEVERITY_LEVELS).includes(alert.severity), `unknown severity ${alert.severity}`);
  assert.ok(alert.reason.length > 15, 'reason must be a readable explanation');
  assert.equal(alert.detectedAt, NOW);
  assert.equal(typeof alert.evidence, 'object');
}

// ---------------------------------------------------------------------------
// Rule 1: unusually large transactions
// ---------------------------------------------------------------------------

test('large rule: flags transaction over the absolute threshold', () => {
  const { alerts } = detect([tx({ _id: 'l1', amount: 5000, date: '2026-02-01T10:00:00Z', account_id: 'a1', merchant_id: 'm1' })]);
  const hits = alerts.filter((a) => a.rule === RULE_TYPES.LARGE_TRANSACTION);
  assert.equal(hits.length, 1);
  assertWellFormedAlert(hits[0]);
  assert.ok([SEVERITY_LEVELS.HIGH, SEVERITY_LEVELS.CRITICAL].includes(hits[0].severity));
  assert.equal(hits[0].evidence.overThreshold, true);
  assert.ok(hits[0].evidence.thresholdMultiple >= 5);
});

test('large rule: flags deviation from account baseline even below threshold', () => {
  const history = Array.from({ length: 8 }, (_, i) =>
    tx({ _id: `h${i}`, amount: 20 + i, date: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`, account_id: 'a2', merchant_id: 'm2' })
  );
  const spike = tx({ _id: 'spike', amount: 900, date: '2026-02-01T10:00:00Z', account_id: 'a2', merchant_id: 'm2' });
  const { alerts } = detect([...history, spike]);
  const hits = alerts.filter((a) => a.rule === RULE_TYPES.LARGE_TRANSACTION && a.transactionId === 'spike');
  assert.equal(hits.length, 1, '900 vs ~24 median should flag via baseline');
  assert.equal(hits[0].evidence.overBaseline, true);
  assert.ok(hits[0].evidence.deviationRatio >= 5);
  assert.ok(hits[0].reason.includes('typical transaction amount'));
});

test('large rule: skips baseline when history is insufficient but still uses threshold', () => {
  const { alerts } = detect([
    tx({ _id: 's1', amount: 30, date: '2026-02-01T10:00:00Z', account_id: 'a3', merchant_id: 'm3' }),
    tx({ _id: 's2', amount: 30, date: '2026-02-02T10:00:00Z', account_id: 'a3', merchant_id: 'm3' }),
    tx({ _id: 's3', amount: 40, date: '2026-02-03T10:00:00Z', account_id: 'a3', merchant_id: 'm3' }),
  ]);
  assert.equal(alerts.length, 0, 'small amounts with thin history must not flag');

// ---------------------------------------------------------------------------
// Rule 2: repeated payments
// ---------------------------------------------------------------------------

test('repeated rule: flags 3 similar payments to the same merchant in-window', () => {
  const { alerts } = detect([
    tx({ _id: 'r1', amount: 39.99, date: '2026-02-10T10:00:00Z', account_id: 'b1', merchant_id: 'mshop' }),
    tx({ _id: 'r2', amount: 39.99, date: '2026-02-10T10:20:00Z', account_id: 'b1', merchant_id: 'mshop' }),
    tx({ _id: 'r3', amount: 40.01, date: '2026-02-10T10:45:00Z', account_id: 'b1', merchant_id: 'mshop' }),
  ]);
  const hits = alerts.filter((a) => a.rule === RULE_TYPES.REPEATED_PAYMENT);
  assert.equal(hits.length, 3, 'every cluster member gets an alert');
  assertWellFormedAlert(hits[0]);
  assert.equal(hits[0].evidence.paymentCount, 3);
  assert.equal(hits[0].evidence.relatedTransactionIds.length, 3);
  assert.ok(hits[0].reason.includes('same merchant'));
});

test('repeated rule: does NOT flag similar amounts at different merchants', () => {
  const { alerts } = detect([
    tx({ _id: 'd1', amount: 39.99, date: '2026-02-10T10:00:00Z', account_id: 'b2', merchant_id: 'mA' }),
    tx({ _id: 'd2', amount: 39.99, date: '2026-02-10T10:10:00Z', account_id: 'b2', merchant_id: 'mB' }),
    tx({ _id: 'd3', amount: 40.00, date: '2026-02-10T10:20:00Z', account_id: 'b2', merchant_id: 'mC' }),
  ]);
  assert.equal(alerts.filter((a) => a.rule === RULE_TYPES.REPEATED_PAYMENT).length, 0);
});

test('repeated rule: does NOT flag same-merchant payments outside the window', () => {
  const { alerts } = detect([
    tx({ _id: 'w1', amount: 39.99, date: '2026-02-10T10:00:00Z', account_id: 'b3', merchant_id: 'mshop' }),
    tx({ _id: 'w2', amount: 39.99, date: '2026-02-10T12:00:00Z', account_id: 'b3', merchant_id: 'mshop' }),
    tx({ _id: 'w3', amount: 39.99, date: '2026-02-10T14:00:00Z', account_id: 'b3', merchant_id: 'mshop' }),
  ]);
  assert.equal(alerts.filter((a) => a.rule === RULE_TYPES.REPEATED_PAYMENT).length, 0, '2h gaps exceed 60min window');
});

// ---------------------------------------------------------------------------
// Rule 3: rapid transactions
// ---------------------------------------------------------------------------

test('rapid rule: flags 4 transactions within the 10-minute window', () => {
  const base = Date.parse('2026-02-13T00:00:00Z');
  const txns = Array.from({ length: 4 }, (_, i) =>
    tx({ _id: `p${i}`, amount: 5 + i, date: new Date(base + i * 2 * 60 * 1000).toISOString(), account_id: 'c1', merchant_id: `m${i}` })
  );
  const { alerts } = detect(txns);
  const hits = alerts.filter((a) => a.rule === RULE_TYPES.RAPID_TRANSACTIONS);
  assert.equal(hits.length, 4, 'every transaction in the burst gets flagged');
  assertWellFormedAlert(hits[0]);
  assert.equal(hits[0].evidence.transactionCount, 4);
  assert.equal(hits[0].evidence.relatedTransactionIds.length, 4);
});

test('rapid rule: does NOT flag spread-out transactions on the same account', () => {
  const { alerts } = detect([
    tx({ _id: 'q1', amount: 10, date: '2026-02-10T09:00:00Z', account_id: 'c2', merchant_id: 'm1' }),
    tx({ _id: 'q2', amount: 10, date: '2026-02-10T13:00:00Z', account_id: 'c2', merchant_id: 'm2' }),
    tx({ _id: 'q3', amount: 10, date: '2026-02-10T18:00:00Z', account_id: 'c2', merchant_id: 'm3' }),
    tx({ _id: 'q4', amount: 10, date: '2026-02-11T09:00:00Z', account_id: 'c2', merchant_id: 'm4' }),
  ]);
  assert.equal(alerts.filter((a) => a.rule === RULE_TYPES.RAPID_TRANSACTIONS).length, 0);
});

test('rapid rule: does NOT merge bursts across different accounts', () => {
  const base = Date.parse('2026-02-13T00:00:00Z');
  const a = Array.from({ length: 3 }, (_, i) =>
    tx({ _id: `x${i}`, amount: 5, date: new Date(base + i * 60 * 1000).toISOString(), account_id: 'cA', merchant_id: `m${i}` })
  );
  const b = Array.from({ length: 3 }, (_, i) =>
    tx({ _id: `y${i}`, amount: 5, date: new Date(base + i * 60 * 1000).toISOString(), account_id: 'cB', merchant_id: `n${i}` })
  );
  const { alerts } = detect([...a, ...b]);
  assert.equal(alerts.filter((x) => x.rule === RULE_TYPES.RAPID_TRANSACTIONS).length, 0, '3+3 across accounts is not a burst');
});


// ---------------------------------------------------------------------------
// Negative cases + robustness
// ---------------------------------------------------------------------------

test('normal activity produces no alerts at all', () => {
  const normal = Array.from({ length: 12 }, (_, i) =>
    tx({ _id: `n${i}`, amount: 15 + (i % 5) * 12, date: `2026-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`, account_id: 'n1', merchant_id: `m${i}` })
  );
  const { alerts, summary } = detect(normal);
  assert.equal(alerts.length, 0, `expected 0 alerts, got ${alerts.length}: ${alerts.map((a) => a.rule).join(',')}`);
  assert.equal(summary.transactionsProcessed, 12);
});

test('missing optional fields never crash and still produce well-formed alerts', () => {
  const edge = [
    null,
    undefined,
    42,
    'nonsense',
    [],
    {}, // no id/amount/date
    tx({ _id: 'e1', amount: 5000, date: '2026-02-01T10:00:00Z' }), // no merchant/account
    tx({ _id: 'e2', amount: 10, account_id: 'e-acc', merchant_id: 'm' }), // no date
    tx({ _id: 'e3', date: '2026-02-01T10:00:00Z', account_id: 'e-acc', merchant_id: 'm' }), // no amount
    tx({ _id: 'e4', amount: 9999999, date: '2026-02-01T10:00:00Z', account_id: 'e-acc2', merchant_id: 'm2' }),
    { _id: 'e5', amount: 'not-a-number', date: 'not-a-date', merchant_id: 'm3' },
  ];
  const { alerts } = detect(edge);
  assert.ok(alerts.length >= 1, 'the huge and threshold-exceeding txns should still flag');
  for (const alert of alerts) assertWellFormedAlert(alert);
});

test('non-array input returns empty result without crashing', () => {
  for (const bad of [null, undefined, 'x', 42, {}]) {
    const { alerts, summary } = detect(bad);
    assert.equal(alerts.length, 0);
    assert.equal(summary.alertCount, 0);
  }
});

test('every alert carries a readable, human explanation', () => {
  const { alerts } = detect(mockTransactions);
  assert.ok(alerts.length >= 5);
  for (const alert of alerts) {
    assertWellFormedAlert(alert);
    assert.ok(alert.reason.length > 20);
    assert.ok(/\d/.test(alert.reason), 'reason should cite concrete numbers');
  }
});

test('mock data exercises all three rules and not only one', () => {
  const { summary } = detect(mockTransactions);
  assert.ok(summary.byRule[RULE_TYPES.LARGE_TRANSACTION] >= 1, 'mock should trigger large rule');
  assert.ok(summary.byRule[RULE_TYPES.REPEATED_PAYMENT] >= 3, 'mock should trigger repeated rule');
  assert.ok(summary.byRule[RULE_TYPES.RAPID_TRANSACTIONS] >= 4, 'mock should trigger rapid rule');
});

test('threshold is configurable', () => {
  const strict = detect([tx({ _id: 'cfg1', amount: 300, date: '2026-02-01T10:00:00Z', account_id: 'g1', merchant_id: 'm' })], {
    largeTransaction: { absoluteThreshold: 250 },
  });
  assert.equal(strict.alerts.filter((a) => a.rule === RULE_TYPES.LARGE_TRANSACTION).length, 1);
  const loose = detect([tx({ _id: 'cfg1', amount: 300, date: '2026-02-01T10:00:00Z', account_id: 'g1', merchant_id: 'm' })], {
    largeTransaction: { absoluteThreshold: 10000 },
  });
  assert.equal(loose.alerts.filter((a) => a.rule === RULE_TYPES.LARGE_TRANSACTION).length, 0);
  assert.equal(DEFAULT_DETECTION_CONFIG.largeTransaction.absoluteThreshold, 1000, 'defaults untouched by overrides');
});


// ---------------------------------------------------------------------------
// Investigations
// ---------------------------------------------------------------------------

test('investigation contains transaction details, rule, evidence and explanation', () => {
  resetInvestigations();
  const { alerts } = detectSuspiciousTransactions(mockTransactions, { now: NOW });
  const alert = alerts.find((a) => a.rule === RULE_TYPES.LARGE_TRANSACTION);
  const investigation = getInvestigation(alert.alertId);

  assert.ok(investigation, 'investigation should exist for every alert');
  assert.equal(investigation.alertId, alert.alertId);
  assert.equal(investigation.transactionId, alert.transactionId);
  assert.equal(investigation.transaction.amount, 4500);
  assert.equal(investigation.transaction.merchantId, 'mer-electronics');
  assert.ok(investigation.transaction.date);
  assert.equal(investigation.rule, RULE_TYPES.LARGE_TRANSACTION);
  assert.deepEqual(investigation.evidence, alert.evidence);
  assert.ok(investigation.explanation.length > 40, 'explanation must be a short readable paragraph');
  assert.ok(investigation.explanation.includes('not proof of fraud'));
  assert.equal(investigation.status, 'Open');
  assert.equal(INVESTIGATION_STATUSES[0], 'Open');
});

test('investigation status updates work and are reflected in listings', () => {
  resetInvestigations();
  const { alerts } = detectSuspiciousTransactions(mockTransactions, { now: NOW });
  const alertId = alerts[0].alertId;

  assert.equal(getInvestigation(alertId).status, 'Open');

  const reviewing = updateInvestigationStatus(alertId, 'Reviewing', { note: 'Picked up by analyst' });
  assert.equal(reviewing.status, 'Reviewing');
  assert.equal(getInvestigation(alertId).status, 'Reviewing');
  assert.equal(reviewing.statusHistory.length, 2);

  const resolved = updateInvestigationStatus(alertId, 'Resolved', { note: 'Confirmed legitimate' });
  assert.equal(resolved.status, 'Resolved');
  assert.equal(getInvestigation(alertId).status, 'Resolved');
  assert.equal(resolved.statusHistory.length, 3);

  assert.equal(listInvestigations({ status: 'Resolved' }).length, 1);
  assert.equal(listInvestigations({ status: 'Open' }).length, alerts.length - 1);
  assert.equal(listInvestigations().length, alerts.length);
});

test('invalid statuses and unknown alerts are rejected with clear errors', () => {
  resetInvestigations();
  const { alerts } = detectSuspiciousTransactions(mockTransactions, { now: NOW });
  const alertId = alerts[0].alertId;

  assert.throws(() => updateInvestigationStatus(alertId, 'Closed'), /Invalid status/);
  assert.throws(() => updateInvestigationStatus(alertId, 'open'), /Invalid status/);
  assert.throws(() => updateInvestigationStatus('ALT-LT-nonexistent', 'Reviewing'), /not found/);
  assert.equal(getInvestigation('nope'), null);
  assert.equal(getInvestigation(alertId).status, 'Open', 'failed updates must not mutate state');
});

test('re-running detection does not reset investigation statuses', () => {
  resetInvestigations();
  const first = detectSuspiciousTransactions(mockTransactions, { now: NOW });
  const alertId = first.alerts[0].alertId;
  updateInvestigationStatus(alertId, 'Reviewing');
  detectSuspiciousTransactions(mockTransactions, { now: NOW });
  assert.equal(getInvestigation(alertId).status, 'Reviewing', 'existing investigation should be preserved');
  assert.equal(listInvestigations().length, first.alerts.length, 'no duplicate investigations');
});


test('investigation status persists to a JSON file when a path is provided', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalzero-'));
  const path = join(dir, 'investigations.json');

  const storeA = createInvestigationStore({ persistencePath: path });
  storeA.registerAlerts(detect(mockTransactions).alerts);
  const id = storeA.list()[0].alertId;
  storeA.updateStatus(id, 'Resolved', { note: 'done' });
  assert.ok(existsSync(path));

  const storeB = createInvestigationStore({ persistencePath: path });
  assert.equal(storeB.get(id).status, 'Resolved', 'fresh store should reload persisted status');
  const onDisk = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(onDisk.investigations[0].status, 'Resolved');
});

test('corrupt persistence file does not crash the store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalzero-'));
  const path = join(dir, 'broken.json');
  writeFileSync(path, '{not json!!', 'utf8');
  const store = createInvestigationStore({ persistencePath: path });
  assert.equal(store.list().length, 0);
});

// ---------------------------------------------------------------------------
// Section 2 integration surface
// ---------------------------------------------------------------------------

test('Section 2 can consume the module with a single import + call', () => {
  resetInvestigations();
  const { alerts, investigations, summary } = detectSuspiciousTransactions(mockTransactions, { now: NOW });
  assert.ok(Array.isArray(alerts) && alerts.length > 0);
  assert.ok(Array.isArray(investigations));
  assert.equal(typeof summary.alertCount, 'number');

  const ids = new Set(alerts.map((a) => a.alertId));
  assert.equal(ids.size, alerts.length, 'alert ids are unique');
  for (const inv of investigations) assert.ok(ids.has(inv.alertId), 'investigations map 1:1 to alerts');

  const serializable = JSON.stringify({ alerts, investigations, summary });
  assert.ok(serializable.length > 0, 'payload must survive JSON serialization for the dashboard');
});

});
