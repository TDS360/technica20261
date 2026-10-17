# SignalZero — Nessie sandbox fraud review

Private per-user fraud-review app. Email magic-link auth, hardened Supabase
RLS, Nessie sandbox sync via a secured Edge Function, real vendored
detection rules, evidence, baselines, storyline, guided response, and
printable reports.

Nessie is simulated sandbox data, not a real-bank connection. SignalZero
never collects card numbers, CVVs, PINs, or bank passwords.

## 1. Prerequisites

- Node 18+
- Supabase project (URL + anon key)
- Nessie sandbox API key from https://nessieisreal.com

## 2. Configure Supabase

1. Create a project at https://supabase.com.
2. Copy the project URL and anon key.
3. Create `.env` from `.env.example` with `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (placeholders only in the example).
4. Supabase Auth → enable Email provider with magic link / OTP.
5. Authentication → URL Configuration → add your Site URL and
   `http://localhost:5173` as a redirect URL.

## 3. Apply migrations (safe, additive)

In Supabase SQL editor or via CLI, apply in order:

- existing `20261017182409_*` and `20261017190043_*` (already created)
- `20261018000000_harden_signalzero_rls.sql` (ownership columns)
- `20261018000001_signalzero_tables.sql` (connections, feedback, events)
- `20261018000002_signalzero_policies.sql` (drop shared policies)
- `20261018000003_signalzero_strict_rls.sql` (per-user policies)
- `20261018000004_signalzero_lockdown.sql` (remaining tables + lockdown)

Do not edit old migrations on a database where they already ran.
Legacy unowned rows stay invisible (`user_id IS NULL` fails ownership).

## 4. Nessie sandbox + Edge Function

Server secret only:

```bash
supabase secrets set NESSIE_API_KEY=your-sandbox-key
supabase secrets set APP_ORIGIN=https://your-app-domain
supabase functions deploy nessie-data
```

The function requires a Bearer session, validates action/accountId,
normalizes only safe fields, and restricts CORS to localhost + APP_ORIGIN.

## 5. Run locally

```bash
npm install
npm run dev
```

Sign in with email, open Accounts → Connect demo account → Sync.
Detection runs over the account history and persists alerts + evidence.
Repeat syncs update without duplicates.

Without `NESSIE_API_KEY`, the UI shows setup guidance plus a labeled
read-only local demo. Never presented as live banking.

## 6. Detection and evidence

Detection is vendored from `project-b-files/` into `src/lib/detection.ts`
(same thresholds, deterministic alert IDs, graceful skips on missing
fields). Sync maps provider IDs to internal DB IDs, persists
`provider_alert_id` for idempotency, and stores structured evidence.
Manual test transactions also run the real engine.

Severity includes `critical` end to end (DB constraint, filters, badges,
reports). Historical baseline shows median, sample size, ratio, and an
insufficient-history state.

## 7. Security model

- `auth.uid()` ownership on transactions, alerts, connections, feedback,
  history; evidence authorized through the owning alert.
- `anon` has no access to private tables.
- Alerts require the transaction to belong to the same user.
- Two-user isolation: no user can read/edit/delete another user's rows.

Manual RLS test (two signed-in users A and B):

1. A syncs an account; note a transaction id.
2. As B, `select * from signalzero_transactions where id = '<A-id>'`
   returns zero rows; direct update/delete affects zero rows.
3. Same checks for alerts, evidence (via alert id), connections,
   feedback, and investigation events.

## 8. Tests

```bash
npm run typecheck
npm run lint
npm run build
```

Detection module tests in `project-b-files/`:

```bash
cd project-b-files && npm test
```

New unit tests: `src/lib/detection.test.ts` (run via `npx tsc` typecheck
or your preferred runner; logic mirrors the Node acceptance tests).
If a pre-existing failure is unrelated, it is reported, not hidden.

## 9. Troubleshooting

- Missing Supabase config → setup banner + read-only demo entry.
- Expired/invalid magic link → request a new link on the auth screen.
- `not_configured` from Edge Function → set `NESSIE_API_KEY` secret.
- `unauthorized` → sign in again; the function verifies the JWT.
- Empty accounts → sandbox dataset may be empty; try another account.
- Failed imports → check connection `last_error`, then retry sync.

## 10. What works vs what needs a real-bank provider

Works in sandbox: auth, per-user storage, account connect/sync,
detection, evidence, storyline, feedback, status history, reports,
idempotent re-sync, and two-user isolation.

Requires a genuine bank-linking provider (not implemented): real account
aggregation, live balances, card controls, and dispute filing. No Plaid
or Credit One integration is claimed or faked.
