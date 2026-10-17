/*
# Create SignalZero user-entered investigation data

1. New Tables
- `signalzero_transactions` stores analyst-entered financial transactions used by the dashboard and reports.
- `id` is the transaction identifier.
- `amount`, `currency`, `transaction_date`, `merchant`, `description`, and `account_id` store the available transaction facts.
- `signalzero_alerts` stores analyst-created review alerts linked to transactions.
- `transaction_id`, `detection_type`, `reason`, `severity`, `status`, and `created_at` store the review signal.
- `signalzero_evidence` stores supporting evidence written against an alert.
- `alert_id`, `label`, `description`, `observed_value`, `source`, and `timestamp` store traceable evidence.

2. Security
- Row level security is enabled on all three tables.
- This MVP has no sign-in screen, so anon and authenticated clients can use the intentionally shared workspace data.
- Four separate CRUD policies are defined for each table.

3. Important Notes
- These tables replace the fixed sample records; empty workspaces are valid.
- Existing investigation status persistence remains compatible with the alert IDs created here.
*/

CREATE TABLE IF NOT EXISTS public.signalzero_transactions (
  id text PRIMARY KEY,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  transaction_date timestamptz NOT NULL,
  merchant text,
  description text,
  account_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.signalzero_alerts (
  id text PRIMARY KEY,
  transaction_id text NOT NULL REFERENCES public.signalzero_transactions(id) ON DELETE CASCADE,
  detection_type text NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.signalzero_evidence (
  id text PRIMARY KEY,
  alert_id text NOT NULL REFERENCES public.signalzero_alerts(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text NOT NULL,
  observed_value text,
  source text,
  evidence_timestamp timestamptz
);

ALTER TABLE public.signalzero_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signalzero_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signalzero_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signalzero_read_transactions" ON public.signalzero_transactions;
CREATE POLICY "signalzero_read_transactions" ON public.signalzero_transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "signalzero_insert_transactions" ON public.signalzero_transactions;
CREATE POLICY "signalzero_insert_transactions" ON public.signalzero_transactions FOR INSERT TO anon, authenticated WITH CHECK (amount >= 0);
DROP POLICY IF EXISTS "signalzero_update_transactions" ON public.signalzero_transactions;
CREATE POLICY "signalzero_update_transactions" ON public.signalzero_transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (amount >= 0);
DROP POLICY IF EXISTS "signalzero_delete_transactions" ON public.signalzero_transactions;
CREATE POLICY "signalzero_delete_transactions" ON public.signalzero_transactions FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "signalzero_read_alerts" ON public.signalzero_alerts;
CREATE POLICY "signalzero_read_alerts" ON public.signalzero_alerts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "signalzero_insert_alerts" ON public.signalzero_alerts;
CREATE POLICY "signalzero_insert_alerts" ON public.signalzero_alerts FOR INSERT TO anon, authenticated WITH CHECK (severity IN ('low', 'medium', 'high') AND status IN ('open', 'reviewing', 'resolved'));
DROP POLICY IF EXISTS "signalzero_update_alerts" ON public.signalzero_alerts;
CREATE POLICY "signalzero_update_alerts" ON public.signalzero_alerts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (severity IN ('low', 'medium', 'high') AND status IN ('open', 'reviewing', 'resolved'));
DROP POLICY IF EXISTS "signalzero_delete_alerts" ON public.signalzero_alerts;
CREATE POLICY "signalzero_delete_alerts" ON public.signalzero_alerts FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "signalzero_read_evidence" ON public.signalzero_evidence;
CREATE POLICY "signalzero_read_evidence" ON public.signalzero_evidence FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "signalzero_insert_evidence" ON public.signalzero_evidence;
CREATE POLICY "signalzero_insert_evidence" ON public.signalzero_evidence FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "signalzero_update_evidence" ON public.signalzero_evidence;
CREATE POLICY "signalzero_update_evidence" ON public.signalzero_evidence FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "signalzero_delete_evidence" ON public.signalzero_evidence;
CREATE POLICY "signalzero_delete_evidence" ON public.signalzero_evidence FOR DELETE TO anon, authenticated USING (true);
