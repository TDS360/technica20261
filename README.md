# SignalZero — Nessie sandbox fraud review

Private per-user fraud-review app with email magic-link authentication,
Supabase row-level security, a server-side Nessie sandbox bridge, transaction
detection, supporting evidence, investigation history, feedback, and reports.

Nessie is simulated sandbox data, not a real-bank connection. SignalZero
never collects card numbers, CVVs, PINs, or bank passwords.

## 1. Prerequisites

- Node.js 18+
- Supabase project (project URL and anon/publishable key)
- Nessie sandbox API key from https://nessieisreal.com
- Supabase CLI for migrations and Edge Function deployment

## 2. Configure Supabase Auth

1. Create a Supabase project and configure Email OTP/magic-link sign-in.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to a local `.env`
   created from `.env.example`. These browser values are public client
   configuration, not private keys.
3. In Authentication → URL Configuration, set the production app origin as
   the Site URL. Add every allowed app origin to Redirect URLs, including
   `http://localhost:5173`, `http://localhost:4173`, and the deployed origin.
   The app requests `window.location.origin` as the magic-link redirect.
4. Keep the service-role key and Nessie API key out of frontend files,
   `VITE_` variables, and source control.

## 3. Apply database migrations

The migration with the duplicate `20261018000001` prefix has been assigned
the unique version `20261018000005`. Its table setup is idempotent. The
forward-only `20261018000006_signalzero_sync_constraints.sql` migration adds
sync uniqueness and tightens ownership checks.
`20261018000007_signalzero_status_atomic.sql` records investigation status
changes and their history in one transaction.

On an existing project, inspect the linked history before applying pending
migrations. Do not edit or replay migrations already applied remotely:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase migration list --linked
supabase db push
```

For a fresh project, `supabase db push` applies all migration files in
timestamp order. Legacy rows without `user_id` remain inaccessible under
the per-user policies.

## 4. Configure and deploy the Nessie Edge Function

Set these values as Supabase Edge Function secrets (never in the browser):

```bash
supabase secrets set NESSIE_API_KEY="SET_THIS_LOCALLY" APP_ORIGIN="https://your-app-domain"
supabase functions deploy nessie-data
```

`APP_ORIGIN` must be the exact deployed origin, without a path. The function
verifies the caller's Supabase access token, validates the selected sandbox
account, normalizes provider data, and keeps `NESSIE_API_KEY` server-side.
The local origins on ports 5173 and 4173 are allowed for development/preview.

## 5. Run locally

```bash
npm install
npm run dev
```

Sign in, open Accounts, connect an available sandbox account, and sync it.
Purchases are persisted under the authenticated user and analyzed by the
existing detection engine. The local demo is explicitly labeled and
read-only; failed provider access does not silently replace live data with
sample data.

## 6. Detection and sync behavior

`src/lib/detection.ts` normalizes transaction inputs and returns deterministic
alert IDs. Sync upserts purchases by owner, provider, account, and stable
provider transaction ID. Alerts are idempotent by provider alert ID, and
evidence is unique per alert and evidence kind. Re-sync updates transaction
facts without resetting investigation status, status history, or feedback.
Status changes and their history entries are written atomically.
Manual test transactions also use the detection engine.

## 7. Security model

- Transactions, alerts, connections, feedback, and investigation history are
  restricted to `auth.uid()` ownership.
- Evidence access is authorized through its owning alert.
- Alert writes require the related transaction to belong to the same user.
- A transaction connection must belong to that user and match its account.
- Anonymous access to private financial records is revoked.

Verify two-user isolation against the configured Supabase project. With user
A's records, user B should receive zero rows and be unable to update/delete
them; repeat for transactions, alerts, evidence, connections, feedback, and
investigation history. Also verify that anon requests cannot read private
tables. This manual project test is not replaced by local unit tests.

## 8. Tests and checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The sync unit test repeats the same provider dataset and checks transaction,
alert, and evidence idempotency, including preservation of investigation
status, history, and feedback.

## 9. Troubleshooting

- Missing frontend config: add `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` to `.env`.
- Expired magic link: request a new link.
- `not_configured`: set `NESSIE_API_KEY` as an Edge Function secret and
  deploy `nessie-data`.
- `unauthorized`: sign in again; the Edge Function checks the JWT against
  Supabase Auth.
- Empty accounts: verify the Nessie sandbox dataset and server secret.
- Failed sync: inspect the connection's last error and retry after resolving
  the provider/configuration issue.

## 10. Scope

Nessie provides simulated sandbox data only. Real account aggregation,
card controls, and dispute filing require a separate real-bank provider and
are not implemented or claimed here.
