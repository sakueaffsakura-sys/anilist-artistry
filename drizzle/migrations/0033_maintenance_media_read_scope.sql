DROP POLICY IF EXISTS "Maintenance media readable" ON storage.objects;
CREATE POLICY "Admins read maintenance media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'maintenance-media' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Active maintenance media readable" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'maintenance-media' AND name = (SELECT s.media_path FROM public.maintenance_settings s WHERE s.id = 1));