DROP POLICY IF EXISTS "Read published APK or admin" ON storage.objects;

CREATE POLICY "Admins read APKs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'app-releases'
  AND public.has_role(auth.uid(), 'admin')
);