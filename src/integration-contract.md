# SignalZero data flow

`AppShell.tsx` uses the authenticated operations in `src/lib/store.ts`
directly. Supabase Auth owns the browser session; the database client sends
that session with reads and writes, and row-level security enforces ownership.

Nessie account and purchase reads go through
`supabase/functions/nessie-data/index.ts`. The function verifies the caller's
Supabase access token, reads `NESSIE_API_KEY` from server-side secrets, and
returns normalized records. `store.ts` saves purchases under the signed-in
user, runs `src/lib/detection.ts`, and idempotently persists alerts and
evidence. Investigation status, feedback, and history are stored separately
from provider sync so a repeated sync does not reset analyst decisions.
Status changes and corresponding history entries are persisted atomically.

`src/lib/section1-provider.ts` is a legacy adapter and is not used by the
application shell. It must not be treated as the live authenticated data
path. The local demo is explicit and read-only.

Nessie is a simulator. A configured key and a successful authenticated sync
are required before claiming that provider access is live.
