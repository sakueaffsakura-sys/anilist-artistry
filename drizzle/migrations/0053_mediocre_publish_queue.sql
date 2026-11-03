CREATE TABLE public.mediocre_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id integer NOT NULL UNIQUE CHECK (obra_id > 0),
  title text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','running','done','error')),
  chapters_added integer NOT NULL DEFAULT 0,
  chapters_remaining integer,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  slug text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX mediocre_queue_status_idx ON public.mediocre_queue (status, created_at);
GRANT SELECT, DELETE ON public.mediocre_queue TO authenticated;
GRANT ALL ON public.mediocre_queue TO service_role;
ALTER TABLE public.mediocre_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read queue" ON public.mediocre_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete queue" ON public.mediocre_queue FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));