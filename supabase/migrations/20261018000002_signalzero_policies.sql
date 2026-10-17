-- Part 3: drop permissive shared-workspace policies.
DROP POLICY IF EXISTS "signalzero_read_transactions"
  ON public.signalzero_transactions;
DROP POLICY IF EXISTS "signalzero_insert_transactions"
  ON public.signalzero_transactions;
DROP POLICY IF EXISTS "signalzero_update_transactions"
  ON public.signalzero_transactions;
DROP POLICY IF EXISTS "signalzero_delete_transactions"
  ON public.signalzero_transactions;
DROP POLICY IF EXISTS "signalzero_read_alerts" ON public.signalzero_alerts;
DROP POLICY IF EXISTS "signalzero_insert_alerts" ON public.signalzero_alerts;
DROP POLICY IF EXISTS "signalzero_update_alerts" ON public.signalzero_alerts;
DROP POLICY IF EXISTS "signalzero_delete_alerts" ON public.signalzero_alerts;
DROP POLICY IF EXISTS "signalzero_read_evidence" ON public.signalzero_evidence;
DROP POLICY IF EXISTS "signalzero_insert_evidence" ON public.signalzero_evidence;
DROP POLICY IF EXISTS "signalzero_update_evidence" ON public.signalzero_evidence;
DROP POLICY IF EXISTS "signalzero_delete_evidence" ON public.signalzero_evidence;
DROP POLICY IF EXISTS "signalzero_read_status"
  ON public.signalzero_investigation_status;
DROP POLICY IF EXISTS "signalzero_insert_status"
  ON public.signalzero_investigation_status;
DROP POLICY IF EXISTS "signalzero_update_status"
  ON public.signalzero_investigation_status;
DROP POLICY IF EXISTS "signalzero_delete_status"
  ON public.signalzero_investigation_status;
