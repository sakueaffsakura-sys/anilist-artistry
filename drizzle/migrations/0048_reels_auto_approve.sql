ALTER TABLE public.reels ALTER COLUMN status SET DEFAULT 'approved';
DROP POLICY reels_create ON public.reels;
CREATE POLICY reels_create ON public.reels FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'approved' AND public.maintenance_access_allowed() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT banned) AND EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'reels' AND name = video_path));
UPDATE public.reels SET status = 'approved' WHERE status = 'pending';