# SignalZero Section 1 integration contract

Section 2 consumes a provider implementing `SignalZeroProvider` from `src/lib/signalzero.ts`.

Required functions:
- `getTransactions(): Promise<Transaction[]>`
- `getAlerts(): Promise<Alert[]>`
- `getAlertDetails(alertId): Promise<InvestigationDetail | null>`
- `updateInvestigationStatus(alertId, status): Promise<Alert>`
- `getDashboardMetrics(): Promise<DashboardMetrics>`

Section 1 owns detection rules, alert creation, explanation text, evidence, related transactions, and the authoritative investigation status behavior. The engine is vendored into `src/lib/detection.ts` as a behavioral port of `project-b-files/src/` (source of truth for thresholds). Sync in `src/lib/store.ts` maps provider IDs to internal DB IDs, persists `provider_alert_id` for idempotency, and stores structured evidence rows.

The current provider is deterministic demo data and is always labeled in the UI. No demo alert is proof of fraud.

## Nessie bridge

`supabase/functions/nessie-data/index.ts` is the server-side bridge for Nessie account and purchase reads. It expects the server secret `NESSIE_API_KEY`, returns raw account and purchase data, and never sends that key to the browser. Add the live provider beside `activeProvider` in `src/lib/signalzero.ts` after the bridge is connected.
