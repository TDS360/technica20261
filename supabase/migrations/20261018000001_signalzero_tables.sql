-- Part 2: new tables for connections, feedback, investigation history.
CREATE TABLE IF NOT EXISTS public.signalzero_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'nessie_sandbox',
  provider_account_id text NOT NULL,
  nickname text,
  account_type text,
  balance numeric(14,2),
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected','disconnected')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_connections_user
  ON public.signalzero_connections(user_id);
CREATE TABLE IF NOT EXISTS public.signalzero_alert_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_id text NOT NULL
    REFERENCES public.signalzero_alerts(id) ON DELETE CASCADE,
  response text NOT NULL
    CHECK (response IN ('recognize','unrecognized','unsure')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_alert
  ON public.signalzero_alert_feedback(alert_id);
CREATE TABLE IF NOT EXISTS public.signalzero_investigation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_id text NOT NULL
    REFERENCES public.signalzero_alerts(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL
    CHECK (new_status IN ('open','reviewing','resolved')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_alert
  ON public.signalzero_investigation_events(alert_id);
CREATE INDEX IF NOT EXISTS idx_txn_user_date
  ON public.signalzero_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user
  ON public.signalzero_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_alert
  ON public.signalzero_evidence(alert_id);
-- Per-user idempotency for imports and engine alerts.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_txn_user_provider_pid') THEN
    ALTER TABLE public.signalzero_transactions
      ADD CONSTRAINT uq_txn_user_provider_pid
      UNIQUE (user_id, provider, provider_transaction_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_alert_user_provider_aid') THEN
    ALTER TABLE public.signalzero_alerts
      ADD CONSTRAINT uq_alert_user_provider_aid
      UNIQUE (user_id, provider_alert_id);
  END IF;
END $$;
