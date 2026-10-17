-- SignalZero hardened per-user RLS (additive, safe to re-run).
-- Fixes broadly-shared anon/authenticated policies; enforces auth.uid() ownership.
-- Legacy unowned rows stay invisible (user_id IS NULL fails auth.uid() equality).

-- 1. Ownership + source columns
ALTER TABLE public.signalzero_transactions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.signalzero_transactions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual';
ALTER TABLE public.signalzero_transactions ADD COLUMN IF NOT EXISTS provider_transaction_id text;
ALTER TABLE public.signalzero_transactions ADD COLUMN IF NOT EXISTS connection_id uuid;
ALTER TABLE public.signalzero_transactions ADD COLUMN IF NOT EXISTS synced_at timestamptz;
ALTER TABLE public.signalzero_transactions ADD COLUMN IF NOT EXISTS merchant_ref text;
ALTER TABLE public.signalzero_transactions ADD COLUMN IF NOT EXISTS status_text text;

ALTER TABLE public.signalzero_alerts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.signalzero_alerts ADD COLUMN IF NOT EXISTS rule text;
ALTER TABLE public.signalzero_alerts ADD COLUMN IF NOT EXISTS provider_alert_id text;
ALTER TABLE public.signalzero_alerts ADD COLUMN IF NOT EXISTS engine_evidence jsonb;

ALTER TABLE public.signalzero_evidence ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.signalzero_evidence ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.signalzero_evidence ADD COLUMN IF NOT EXISTS data jsonb;

ALTER TABLE public.signalzero_alerts DROP CONSTRAINT IF EXISTS signalzero_alerts_severity_check;
ALTER TABLE public.signalzero_alerts ADD CONSTRAINT signalzero_alerts_severity_check
  CHECK (severity IN ('low','medium','high','critical'));
ALTER TABLE public.signalzero_alerts DROP CONSTRAINT IF EXISTS signalzero_alerts_status_check;
ALTER TABLE public.signalzero_alerts ADD CONSTRAINT signalzero_alerts_status_check
  CHECK (status IN ('open','reviewing','resolved'));
