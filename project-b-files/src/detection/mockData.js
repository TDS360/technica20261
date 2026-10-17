/**
 * Mock transaction data in the Nessie API shape, used to develop and test the
 * detection module independently of Section 2's Nessie integration.
 *
 * Nessie transaction fields: _id, amount, date, description, merchant_id,
 * account_id, type, status. Several records below deliberately omit optional
 * fields (merchant_id, date, amount) to prove the rules degrade gracefully.
 */

export const mockTransactions = [
  // --- Account A: normal activity + one very large transaction -------------
  { _id: 'txn-1001', amount: 12.5, date: '2026-02-01T09:14:00Z', description: 'Coffee Shop', merchant_id: 'mer-coffee', account_id: 'acc-A', type: 'purchase', status: 'completed' },
  { _id: 'txn-1002', amount: 45.2, date: '2026-02-02T18:30:00Z', description: 'Grocery Store', merchant_id: 'mer-grocery', account_id: 'acc-A', type: 'purchase', status: 'completed' },
  { _id: 'txn-1003', amount: 8.99, date: '2026-02-03T12:05:00Z', description: 'Music Streaming', merchant_id: 'mer-music', account_id: 'acc-A', type: 'purchase', status: 'completed' },
  { _id: 'txn-1004', amount: 63.1, date: '2026-02-04T20:45:00Z', description: 'Gas Station', merchant_id: 'mer-gas', account_id: 'acc-A', type: 'purchase', status: 'completed' },
  { _id: 'txn-1005', amount: 30.0, date: '2026-02-05T08:20:00Z', description: 'Bus Pass', merchant_id: 'mer-transit', account_id: 'acc-A', type: 'purchase', status: 'completed' },
  { _id: 'txn-1006', amount: 27.45, date: '2026-02-06T13:10:00Z', description: 'Lunch Diner', merchant_id: 'mer-diner', account_id: 'acc-A', type: 'purchase', status: 'completed' },
  { _id: 'txn-1007', amount: 55.0, date: '2026-02-07T16:00:00Z', description: 'Bookstore', merchant_id: 'mer-books', account_id: 'acc-A', type: 'purchase', status: 'completed' },
  // Large: 4500 vs baseline median ~30 (150x) and 4.5x threshold -> flagged
  { _id: 'txn-1008', amount: 4500.0, date: '2026-02-08T02:13:00Z', description: 'Electronics Warehouse', merchant_id: 'mer-electronics', account_id: 'acc-A', type: 'purchase', status: 'completed' },

  // --- Account B: repeated payments to one merchant ------------------------
  { _id: 'txn-2001', amount: 39.99, date: '2026-02-10T10:00:00Z', description: 'Online Retailer', merchant_id: 'mer-retail', account_id: 'acc-B', type: 'purchase', status: 'completed' },
  { _id: 'txn-2002', amount: 39.99, date: '2026-02-10T10:18:00Z', description: 'Online Retailer', merchant_id: 'mer-retail', account_id: 'acc-B', type: 'purchase', status: 'completed' },
  { _id: 'txn-2003', amount: 40.01, date: '2026-02-10T10:41:00Z', description: 'Online Retailer', merchant_id: 'mer-retail', account_id: 'acc-B', type: 'purchase', status: 'completed' },
  { _id: 'txn-2004', amount: 15.0, date: '2026-02-11T09:00:00Z', description: 'Sandwich Place', merchant_id: 'mer-sandwich', account_id: 'acc-B', type: 'purchase', status: 'completed' },

  // --- Account C: rapid burst + one normal transaction ---------------------
  { _id: 'txn-3001', amount: 5.0, date: '2026-02-12T23:58:00Z', description: 'Vending Machine', merchant_id: 'mer-vending', account_id: 'acc-C', type: 'purchase', status: 'completed' },
  { _id: 'txn-3002', amount: 6.25, date: '2026-02-12T23:59:10Z', description: 'Parking Meter', merchant_id: 'mer-parking', account_id: 'acc-C', type: 'purchase', status: 'completed' },
  { _id: 'txn-3003', amount: 11.4, date: '2026-02-13T00:01:30Z', description: 'Fast Food', merchant_id: 'mer-fastfood', account_id: 'acc-C', type: 'purchase', status: 'completed' },
  { _id: 'txn-3004', amount: 9.8, date: '2026-02-13T00:03:00Z', description: 'App Store', merchant_id: 'mer-appstore', account_id: 'acc-C', type: 'purchase', status: 'completed' },
  { _id: 'txn-3005', amount: 7.15, date: '2026-02-13T00:04:45Z', description: 'News Stand', merchant_id: 'mer-news', account_id: 'acc-C', type: 'purchase', status: 'completed' },
  { _id: 'txn-3006', amount: 250.0, date: '2026-02-14T15:00:00Z', description: 'Department Store', merchant_id: 'mer-department', account_id: 'acc-C', type: 'purchase', status: 'completed' },

  // --- Edge cases: missing optional fields ---------------------------------
  // No merchant_id / description: repeated-payment rule must skip, others may not.
  { _id: 'txn-4001', amount: 950.0, date: '2026-02-15T11:00:00Z', account_id: 'acc-D', type: 'withdrawal', status: 'completed' },
  // No date: time-based rules must skip without crashing.
  { _id: 'txn-4002', amount: 20.0, description: 'Undated Charge', merchant_id: 'mer-undated', account_id: 'acc-D', type: 'purchase', status: 'completed' },
  // No amount: amount-based rules must skip without crashing.
  { _id: 'txn-4003', date: '2026-02-15T12:00:00Z', description: 'Amountless Charge', merchant_id: 'mer-unknown', account_id: 'acc-D', type: 'purchase', status: 'completed' },
  // No account_id: account-grouped rules must skip without crashing.
  { _id: 'txn-4004', amount: 75.0, date: '2026-02-15T13:00:00Z', description: 'Orphan Charge', merchant_id: 'mer-orphan', type: 'purchase', status: 'completed' },
];

export default mockTransactions;
