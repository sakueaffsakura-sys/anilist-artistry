ALTER POLICY "Maintenance media type and size" ON storage.objects WITH CHECK (
 bucket_id <> 'maintenance-media' OR (
 name ~ '^backgrounds/[a-zA-Z0-9_.-]+$' AND
 (metadata->>'size')::bigint BETWEEN 1 AND 1073741824 AND (
 (lower(metadata->>'mimetype') = 'video/mp4' AND name ~ '\.mp4$') OR
 (lower(metadata->>'mimetype') IN ('image/jpeg','image/png','image/webp') AND name ~ '\.(jpg|png|webp)$')
 ))
);
ALTER POLICY "Maintenance media update validation" ON storage.objects WITH CHECK (
 bucket_id <> 'maintenance-media' OR (
 name ~ '^backgrounds/[a-zA-Z0-9_.-]+$' AND
 (metadata->>'size')::bigint BETWEEN 1 AND 1073741824 AND (
 (lower(metadata->>'mimetype') = 'video/mp4' AND name ~ '\.mp4$') OR
 (lower(metadata->>'mimetype') IN ('image/jpeg','image/png','image/webp') AND name ~ '\.(jpg|png|webp)$')
 ))
);