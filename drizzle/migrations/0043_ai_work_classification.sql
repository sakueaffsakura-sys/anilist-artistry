CREATE TABLE public.ai_classification_state (
  id text PRIMARY KEY,
  paused boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT '',
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_classification_state TO authenticated;
GRANT ALL ON public.ai_classification_state TO service_role;
ALTER TABLE public.ai_classification_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read classification state" ON public.ai_classification_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE FUNCTION public.acquire_classification_lease(_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE acquired boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  INSERT INTO public.ai_classification_state (id, lease_token, lease_until) VALUES ('work-genres', _token, now() + interval '10 minutes')
  ON CONFLICT (id) DO UPDATE SET lease_token = EXCLUDED.lease_token, lease_until = EXCLUDED.lease_until, updated_at = now()
  WHERE NOT ai_classification_state.paused AND (ai_classification_state.lease_until IS NULL OR ai_classification_state.lease_until < now());
  GET DIAGNOSTICS acquired = ROW_COUNT;
  RETURN acquired;
END; $$;
REVOKE ALL ON FUNCTION public.acquire_classification_lease(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_classification_lease(uuid) TO authenticated;