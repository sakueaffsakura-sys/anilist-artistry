CREATE OR REPLACE FUNCTION public.maintenance_media_upload_valid(object_name text, object_metadata jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public
AS $fn$
 SELECT object_name ~ '^backgrounds/[a-zA-Z0-9_.-]+\.(mp4|jpg|png|webp)$'
 AND (object_metadata IS NULL OR (
   CASE WHEN coalesce(object_metadata->>'size', object_metadata->>'contentLength') ~ '^[0-9]{1,19}$'
     THEN coalesce(object_metadata->>'size', object_metadata->>'contentLength')::numeric BETWEEN 1 AND 1073741824
     ELSE false END
   AND CASE lower(object_metadata->>'mimetype')
     WHEN 'video/mp4' THEN object_name ~ '\.mp4$'
     WHEN 'image/jpeg' THEN object_name ~ '\.jpg$'
     WHEN 'image/png' THEN object_name ~ '\.png$'
     WHEN 'image/webp' THEN object_name ~ '\.webp$'
     ELSE false END
 ));
$fn$;
REVOKE ALL ON FUNCTION public.maintenance_media_upload_valid(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintenance_media_upload_valid(text, jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.maintenance_media_upload_valid(text,jsonb) IS 'Validates Storage preflight contentLength and completed size; NULL metadata supports legacy TUS preflight. Admin policies and bucket size limits remain mandatory.';
ALTER POLICY "Maintenance media type and size" ON storage.objects WITH CHECK (
 bucket_id <> 'maintenance-media' OR public.maintenance_media_upload_valid(name, metadata)
);
ALTER POLICY "Maintenance media update validation" ON storage.objects WITH CHECK (
 bucket_id <> 'maintenance-media' OR public.maintenance_media_upload_valid(name, metadata)
);