CREATE OR REPLACE FUNCTION public.signalzero_update_investigation_status(
  p_alert_id text,
  p_new_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  previous_status text;
BEGIN
  IF p_new_status IS NULL
    OR p_new_status NOT IN ('open', 'reviewing', 'resolved') THEN
    RAISE EXCEPTION 'Invalid investigation status.';
  END IF;

  SELECT a.status
    INTO previous_status
    FROM public.signalzero_alerts a
    WHERE a.id = p_alert_id
      AND a.user_id = auth.uid()
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investigation not found.';
  END IF;

  IF previous_status = p_new_status THEN
    RETURN;
  END IF;

  UPDATE public.signalzero_alerts
    SET status = p_new_status
    WHERE id = p_alert_id
      AND user_id = auth.uid();

  INSERT INTO public.signalzero_investigation_events (
    user_id, alert_id, previous_status, new_status, note
  ) VALUES (
    auth.uid(), p_alert_id, previous_status, p_new_status, p_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signalzero_update_investigation_status(
  text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signalzero_update_investigation_status(
  text, text, text
) TO authenticated;
