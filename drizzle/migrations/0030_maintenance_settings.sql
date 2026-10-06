CREATE TABLE public.maintenance_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 enabled boolean NOT NULL DEFAULT false,
 title text NOT NULL DEFAULT 'Voltamos em breve.',
 message text NOT NULL DEFAULT 'Estamos preparando o próximo capítulo do Better Mangá. Obrigado por esperar.',
 media_kind text NOT NULL DEFAULT 'image' CHECK (media_kind IN ('image', 'video')),
 media_path text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.maintenance_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.maintenance_settings TO authenticated;
GRANT ALL ON public.maintenance_settings TO service_role;
ALTER TABLE public.maintenance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Maintenance public settings" ON public.maintenance_settings FOR SELECT TO anon, authenticated USING (id = 1);
CREATE POLICY "Admins insert maintenance" ON public.maintenance_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update maintenance" ON public.maintenance_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload maintenance media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'maintenance-media' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Maintenance media readable" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'maintenance-media');
CREATE POLICY "Admins update maintenance media" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'maintenance-media' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'maintenance-media' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete maintenance media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'maintenance-media' AND public.has_role(auth.uid(), 'admin'));