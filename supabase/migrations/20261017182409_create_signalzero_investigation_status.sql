/*
# Create SignalZero investigation status persistence

1. New Tables
- `signalzero_investigation_status` stores the latest review status for each Section 1 alert.
- `alert_id` is the shared alert identifier and primary key.
- `status` is one of `open`, `reviewing`, or `resolved`.
- `updated_at` records the last successful status change.

2. Security
- Row level security is enabled.
- SignalZero is an internal single-tenant hackathon MVP without sign-in, so anon and authenticated clients can read and write the shared investigation status table.
- Four separate CRUD policies are defined for predictable access control.

3. Important Notes
- This table stores only the UI workflow state; Section 1 remains the source of truth for detection logic, evidence, and alert explanations.
- The table is intentionally additive and safe to re-run.
*/

CREATE TABLE IF NOT EXISTS public.signalzero_investigation_status (
  alert_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('open', 'reviewing', 'resolved')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signalzero_investigation_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signalzero_read_status" ON public.signalzero_investigation_status;
CREATE POLICY "signalzero_read_status"
  ON public.signalzero_investigation_status FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "signalzero_insert_status" ON public.signalzero_investigation_status;
CREATE POLICY "signalzero_insert_status"
  ON public.signalzero_investigation_status FOR INSERT
  TO anon, authenticated
  WITH CHECK (status IN ('open', 'reviewing', 'resolved'));

DROP POLICY IF EXISTS "signalzero_update_status" ON public.signalzero_investigation_status;
CREATE POLICY "signalzero_update_status"
  ON public.signalzero_investigation_status FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (status IN ('open', 'reviewing', 'resolved'));

DROP POLICY IF EXISTS "signalzero_delete_status" ON public.signalzero_investigation_status;
CREATE POLICY "signalzero_delete_status"
  ON public.signalzero_investigation_status FOR DELETE
  TO anon, authenticated
  USING (true);
