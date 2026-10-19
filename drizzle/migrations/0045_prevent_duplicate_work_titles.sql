CREATE FUNCTION public.work_title_key(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT btrim(regexp_replace(translate(lower(coalesce(value, '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'), '[[:space:]]+', ' ', 'g')); $$;
CREATE FUNCTION public.work_title_keys(title text, alternatives text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT coalesce(array_agg(DISTINCT key ORDER BY key) FILTER (WHERE key <> ''), ARRAY[]::text[]) FROM (SELECT public.work_title_key(value) AS key FROM unnest(ARRAY[title] || regexp_split_to_array(coalesce(alternatives, ''), '[,;|\n\r]+')) AS value) keys; $$;
CREATE TABLE public.work_title_claims (title_key text PRIMARY KEY, series_ids uuid[] NOT NULL);
GRANT ALL ON public.work_title_claims TO service_role;
ALTER TABLE public.work_title_claims ENABLE ROW LEVEL SECURITY;
INSERT INTO public.work_title_claims(title_key, series_ids) SELECT key, array_agg(DISTINCT s.id ORDER BY s.id) FROM public.series s CROSS JOIN LATERAL unnest(public.work_title_keys(s.title, s.alt_titles)) AS key GROUP BY key;
CREATE FUNCTION public.guard_work_title_duplicates() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_keys text[] := ARRAY[]::text[]; new_keys text[] := ARRAY[]::text[]; key text; claimed text;
BEGIN
 IF TG_OP <> 'INSERT' THEN old_keys := public.work_title_keys(OLD.title, OLD.alt_titles); END IF;
 IF TG_OP <> 'DELETE' THEN new_keys := public.work_title_keys(NEW.title, NEW.alt_titles); END IF;
 IF TG_OP = 'UPDATE' AND old_keys = new_keys THEN RETURN NEW; END IF;
 FOREACH key IN ARRAY new_keys LOOP
  claimed := NULL;
  INSERT INTO public.work_title_claims AS claims(title_key, series_ids) VALUES (key, ARRAY[NEW.id])
  ON CONFLICT (title_key) DO UPDATE SET series_ids = claims.series_ids WHERE NEW.id = ANY(claims.series_ids)
  RETURNING title_key INTO claimed;
  IF claimed IS NULL THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Já existe uma obra com esse título ou título alternativo.', CONSTRAINT = 'series_duplicate_work_title'; END IF;
 END LOOP;
 FOREACH key IN ARRAY old_keys LOOP
  IF NOT (key = ANY(new_keys)) THEN
   UPDATE public.work_title_claims SET series_ids = array_remove(series_ids, OLD.id) WHERE title_key = key;
   DELETE FROM public.work_title_claims WHERE title_key = key AND cardinality(series_ids) = 0;
  END IF;
 END LOOP;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_work_title_duplicates() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER series_guard_duplicate_titles BEFORE INSERT OR UPDATE OF title, alt_titles OR DELETE ON public.series FOR EACH ROW EXECUTE FUNCTION public.guard_work_title_duplicates();
COMMENT ON TABLE public.work_title_claims IS 'Internal atomic title reservations; legacy duplicate owners preserved, new duplicate titles rejected across all work categories.';