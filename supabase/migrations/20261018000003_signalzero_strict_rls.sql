-- Part 4: strict per-user RLS (authenticated only, auth.uid ownership).
ALTER TABLE public.signalzero_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signalzero_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signalzero_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signalzero_investigation_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signalzero_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signalzero_alert_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signalzero_investigation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sz_txn_select_own" ON public.signalzero_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sz_txn_insert_own" ON public.signalzero_transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND amount >= 0);
CREATE POLICY "sz_txn_update_own" ON public.signalzero_transactions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND amount >= 0);
CREATE POLICY "sz_txn_delete_own" ON public.signalzero_transactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sz_alerts_select_own" ON public.signalzero_alerts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sz_alerts_insert_own" ON public.signalzero_alerts
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND severity IN ('low','medium','high','critical')
    AND status IN ('open','reviewing','resolved')
    AND EXISTS (SELECT 1 FROM public.signalzero_transactions t
      WHERE t.id = transaction_id AND t.user_id = auth.uid())
  );
CREATE POLICY "sz_alerts_update_own" ON public.signalzero_alerts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND severity IN ('low','medium','high','critical')
    AND status IN ('open','reviewing','resolved'));
CREATE POLICY "sz_alerts_delete_own" ON public.signalzero_alerts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- Evidence is authorized through the owning alert.
CREATE POLICY "sz_evidence_select_own" ON public.signalzero_evidence
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.signalzero_alerts a
      WHERE a.id = alert_id AND a.user_id = auth.uid()));
CREATE POLICY "sz_evidence_insert_own" ON public.signalzero_evidence
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.signalzero_alerts a
      WHERE a.id = alert_id AND a.user_id = auth.uid()));
CREATE POLICY "sz_evidence_update_own" ON public.signalzero_evidence
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.signalzero_alerts a
    WHERE a.id = alert_id AND a.user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.signalzero_alerts a
      WHERE a.id = alert_id AND a.user_id = auth.uid()));
CREATE POLICY "sz_evidence_delete_own" ON public.signalzero_evidence
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.signalzero_alerts a
      WHERE a.id = alert_id AND a.user_id = auth.uid()));
