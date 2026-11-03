CREATE TABLE public.mediocre_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token text,
  refresh_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mediocre_settings TO service_role;
ALTER TABLE public.mediocre_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mediocre_cache (
  key text PRIMARY KEY,
  payload text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mediocre_cache TO service_role;
ALTER TABLE public.mediocre_cache ENABLE ROW LEVEL SECURITY;