-- Forward-only fixes for sync idempotency and ownership invariants.
ALTER TABLE public.signalzero_transactions
  DROP CONSTRAINT IF EXISTS uq_txn_user_provider_pid;
ALTER TABLE public.signalzero_transactions
  ADD CONSTRAINT uq_txn_user_provider_pid
  UNIQUE (user_id, provider, account_id, provider_transaction_id);

DELETE FROM public.signalzero_evidence duplicate
USING public.signalzero_evidence retained
WHERE duplicate.alert_id = retained.alert_id
  AND duplicate.kind = retained.kind
  AND duplicate.kind IS NOT NULL
  AND duplicate.ctid > retained.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_signalzero_evidence_alert_kind
  ON public.signalzero_evidence (alert_id, kind);

DROP POLICY IF EXISTS "sz_txn_insert_own"
  ON public.signalzero_transactions;
CREATE POLICY "sz_txn_insert_own" ON public.signalzero_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND amount >= 0
    AND (
      connection_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.signalzero_connections c
        WHERE c.id = connection_id
          AND c.user_id = auth.uid()
          AND c.provider_account_id = account_id
      )
    )
  );

DROP POLICY IF EXISTS "sz_txn_update_own"
  ON public.signalzero_transactions;
CREATE POLICY "sz_txn_update_own" ON public.signalzero_transactions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND amount >= 0
    AND (
      connection_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.signalzero_connections c
        WHERE c.id = connection_id
          AND c.user_id = auth.uid()
          AND c.provider_account_id = account_id
      )
    )
  );

DROP POLICY IF EXISTS "sz_alerts_update_own"
  ON public.signalzero_alerts;
CREATE POLICY "sz_alerts_update_own" ON public.signalzero_alerts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND severity IN ('low','medium','high','critical')
    AND status IN ('open','reviewing','resolved')
    AND EXISTS (
      SELECT 1 FROM public.signalzero_transactions t
      WHERE t.id = transaction_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sz_fb_select_own"
  ON public.signalzero_alert_feedback;
CREATE POLICY "sz_fb_select_own" ON public.signalzero_alert_feedback
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.signalzero_alerts a
      WHERE a.id = alert_id AND a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sz_hist_select_own"
  ON public.signalzero_investigation_events;
CREATE POLICY "sz_hist_select_own"
  ON public.signalzero_investigation_events
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.signalzero_alerts a
      WHERE a.id = alert_id AND a.user_id = auth.uid()
    )
  );
