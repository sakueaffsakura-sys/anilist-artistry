ALTER TABLE public.series ADD COLUMN anilist_popularity integer NOT NULL DEFAULT 0, ADD COLUMN anilist_trending integer NOT NULL DEFAULT 0;
CREATE INDEX series_anilist_popularity_idx ON public.series (anilist_popularity DESC) WHERE published;
CREATE INDEX series_anilist_trending_idx ON public.series (anilist_trending DESC) WHERE published;
CREATE TABLE public.home_sections (
 section text PRIMARY KEY CHECK (section IN ('popular', 'trending', 'manhwa')),
 mode text NOT NULL DEFAULT 'automatic' CHECK (mode IN ('automatic', 'manual')),
 series_ids uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_sections TO anon;
GRANT SELECT, INSERT, UPDATE ON public.home_sections TO authenticated;
GRANT ALL ON public.home_sections TO service_role;
ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY home_sections_read ON public.home_sections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY home_sections_insert ON public.home_sections FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY home_sections_update ON public.home_sections FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY maintenance_restriction ON public.home_sections AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.maintenance_access_allowed()) WITH CHECK (public.maintenance_access_allowed());
CREATE TRIGGER home_sections_touch BEFORE UPDATE ON public.home_sections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();