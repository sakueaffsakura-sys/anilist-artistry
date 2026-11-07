CREATE TABLE public.mediocre_ingest_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  works_received integer NOT NULL DEFAULT 0,
  chapters_added integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0
);
GRANT SELECT, UPDATE ON public.mediocre_ingest_tokens TO authenticated;
GRANT ALL ON public.mediocre_ingest_tokens TO service_role;
ALTER TABLE public.mediocre_ingest_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ingest tokens" ON public.mediocre_ingest_tokens FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins revoke ingest tokens" ON public.mediocre_ingest_tokens FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));