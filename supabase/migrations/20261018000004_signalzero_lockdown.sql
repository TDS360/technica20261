-- Part 5: connections, feedback, history + privilege lockdown.
CREATE POLICY "sz_invstatus_deny_all" ON public.signalzero_investigation_status
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "sz_conn_select_own" ON public.signalzero_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sz_conn_insert_own" ON public.signalzero_connections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sz_conn_update_own" ON public.signalzero_connections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sz_conn_delete_own" ON public.signalzero_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sz_fb_select_own" ON public.signalzero_alert_feedback
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sz_fb_insert_own" ON public.signalzero_alert_feedback
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.signalzero_alerts a
      WHERE a.id = alert_id AND a.user_id = auth.uid()));
CREATE POLICY "sz_fb_update_own" ON public.signalzero_alert_feedback
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.signalzero_alerts a
      WHERE a.id = alert_id AND a.user_id = auth.uid()));
CREATE POLICY "sz_fb_delete_own" ON public.signalzero_alert_feedback
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sz_hist_select_own" ON public.signalzero_investigation_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "sz_hist_insert_own" ON public.signalzero_investigation_events
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.signalzero_alerts a
      WHERE a.id = alert_id AND a.user_id = auth.uid()));
REVOKE ALL ON public.signalzero_transactions FROM anon;
REVOKE ALL ON public.signalzero_alerts FROM anon;
REVOKE ALL ON public.signalzero_evidence FROM anon;
REVOKE ALL ON public.signalzero_investigation_status FROM anon;
REVOKE ALL ON public.signalzero_connections FROM anon;
REVOKE ALL ON public.signalzero_alert_feedback FROM anon;
REVOKE ALL ON public.signalzero_investigation_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signalzero_transactions
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signalzero_alerts
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signalzero_evidence
  TO authenticated;
GRANT SELECT ON public.signalzero_investigation_status TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signalzero_connections
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signalzero_alert_feedback
  TO authenticated;
GRANT SELECT, INSERT ON public.signalzero_investigation_events
  TO authenticated;
