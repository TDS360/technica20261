/**
 * Quick manual smoke test: `node scripts/demo.js`
 * Runs detection over the mock data and prints alerts + an investigation,
 * then flips one status to show the update flow.
 */

import {
  detectSuspiciousTransactions,
  getInvestigation,
  listInvestigations,
  updateInvestigationStatus,
  resetInvestigations,
  mockTransactions,
} from '../src/index.js';

resetInvestigations();

const { alerts, summary } = detectSuspiciousTransactions(mockTransactions, { now: '2026-02-15T14:00:00Z' });

console.log('Summary:', JSON.stringify(summary, null, 2));
console.log(`\n${alerts.length} alert(s):`);
for (const alert of alerts) {
  console.log(`  [${alert.severity.toUpperCase().padEnd(8)}] ${alert.alertId} ${alert.rule} tx=${alert.transactionId}`);
  console.log(`             ${alert.reason}`);
}

const first = alerts[0];
if (first) {
  console.log('\n--- Investigation for', first.alertId, '---');
  console.log(JSON.stringify(getInvestigation(first.alertId), null, 2));

  const updated = updateInvestigationStatus(first.alertId, 'Reviewing', { note: 'Analyst picked it up' });
  console.log('\nStatus after update:', updated.status, '=> list(Open):', listInvestigations({ status: 'Open' }).length);
}
