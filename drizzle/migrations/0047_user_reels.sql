CREATE TABLE public.reels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 500),
 video_path text NOT NULL UNIQUE,
 duration_seconds numeric NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 90),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (video_path LIKE user_id::text || '/%')
);
GRANT SELECT, INSERT, DELETE ON public.reels TO authenticated;
GRANT UPDATE (status) ON public.reels TO authenticated;
GRANT ALL ON public.reels TO service_role;
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
CREATE POLICY reels_read ON public.reels FOR SELECT TO authenticated USING (public.maintenance_access_allowed() AND (status = 'approved' OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY reels_create ON public.reels FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending' AND public.maintenance_access_allowed() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT banned) AND EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'reels' AND name = video_path));
CREATE POLICY reels_moderate ON public.reels FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') AND public.maintenance_access_allowed()) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY reels_delete ON public.reels FOR DELETE TO authenticated USING (public.maintenance_access_allowed() AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
CREATE INDEX reels_feed_idx ON public.reels (status, created_at DESC, id DESC);
CREATE INDEX reels_owner_idx ON public.reels (user_id, created_at DESC);
CREATE TABLE public.reel_likes (
 reel_id uuid NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (reel_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.reel_likes TO authenticated;
GRANT ALL ON public.reel_likes TO service_role;
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY reel_likes_read ON public.reel_likes FOR SELECT TO authenticated USING (public.maintenance_access_allowed() AND EXISTS (SELECT 1 FROM public.reels WHERE id = reel_id));
CREATE POLICY reel_likes_create ON public.reel_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.maintenance_access_allowed() AND EXISTS (SELECT 1 FROM public.reels WHERE id = reel_id AND status = 'approved') AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT banned));
CREATE POLICY reel_likes_delete ON public.reel_likes FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.maintenance_access_allowed());
CREATE TABLE public.reel_reports (
 reel_id uuid NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (reel_id, user_id)
);
GRANT SELECT, INSERT ON public.reel_reports TO authenticated;
GRANT ALL ON public.reel_reports TO service_role;
ALTER TABLE public.reel_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reel_reports_read ON public.reel_reports FOR SELECT TO authenticated USING (public.maintenance_access_allowed() AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY reel_reports_create ON public.reel_reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.maintenance_access_allowed() AND EXISTS (SELECT 1 FROM public.reels WHERE id = reel_id AND status = 'approved'));
CREATE POLICY reels_video_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reels' AND (storage.foldername(name))[1] = auth.uid()::text AND lower(storage.extension(name)) IN ('mp4', 'webm') AND public.maintenance_access_allowed() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT banned));
CREATE POLICY reels_video_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'reels' AND public.maintenance_access_allowed() AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.reels WHERE video_path = name AND status = 'approved')));
CREATE POLICY reels_video_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'reels' AND public.maintenance_access_allowed() AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));