CREATE TABLE public.custom_genres (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.custom_genres TO anon;
GRANT SELECT, INSERT ON public.custom_genres TO authenticated;
GRANT ALL ON public.custom_genres TO service_role;
ALTER TABLE public.custom_genres ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX custom_genres_name_unique ON public.custom_genres (lower(btrim(name)));
CREATE POLICY "Public genre names" ON public.custom_genres FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins add genres" ON public.custom_genres FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.app_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 version_name text NOT NULL CHECK (length(btrim(version_name)) BETWEEN 1 AND 40),
 version_code integer NOT NULL UNIQUE CHECK (version_code > 0),
 minimum_version_code integer NOT NULL CHECK (minimum_version_code > 0 AND minimum_version_code <= version_code),
 apk_path text NOT NULL CHECK (apk_path ~ '^releases/[a-f0-9-]+[.]apk$'),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 5000),
 published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_releases TO anon;
GRANT SELECT, INSERT, UPDATE ON public.app_releases TO authenticated;
GRANT ALL ON public.app_releases TO service_role;
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published app releases" ON public.app_releases FOR SELECT TO anon, authenticated USING (published OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins create app releases" ON public.app_releases FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update app releases" ON public.app_releases FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload APK" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'app-releases' AND public.has_role(auth.uid(), 'admin') AND name ~ '^releases/[a-f0-9-]+[.]apk$');
CREATE POLICY "Read published APK or admin" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'app-releases' AND (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.app_releases r WHERE r.published AND r.apk_path = name)));
