-- Run against the hosted database: every result must be true.
SELECT rule, public.maintenance_media_upload_valid(path, metadata) IS NOT DISTINCT FROM expected AS passed
FROM (VALUES
 ('TUS uses contentLength before completion', 'backgrounds/test.mp4', '{"mimetype":"video/mp4","contentLength":60000000}'::jsonb, true),
 ('Legacy TUS preflight has null metadata', 'backgrounds/test.mp4', NULL::jsonb, true),
 ('Completed MP4 accepts exactly 1 GiB', 'backgrounds/test.mp4', '{"mimetype":"video/mp4","size":1073741824}'::jsonb, true),
 ('Reject larger than 1 GiB', 'backgrounds/test.mp4', '{"mimetype":"video/mp4","contentLength":1073741825}'::jsonb, false),
 ('Reject empty video', 'backgrounds/test.mp4', '{"mimetype":"video/mp4","size":0}'::jsonb, false),
 ('Reject mismatched extension', 'backgrounds/test.png', '{"mimetype":"video/mp4","size":20}'::jsonb, false),
 ('Reject unsupported file on preflight', 'backgrounds/test.html', NULL::jsonb, false),
 ('Reject wrong directory', 'other/test.mp4', NULL::jsonb, false),
 ('Reject malformed size without casting error', 'backgrounds/test.mp4', '{"mimetype":"video/mp4","size":"invalid"}'::jsonb, false)
) AS cases(rule, path, metadata, expected);