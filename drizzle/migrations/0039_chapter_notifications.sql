CREATE TABLE public.chapter_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  series_id uuid NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chapter_id)
);
CREATE INDEX chapter_notifications_user_idx ON public.chapter_notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.chapter_notifications TO authenticated;
GRANT ALL ON public.chapter_notifications TO service_role;
ALTER TABLE public.chapter_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own chapter notifications read" ON public.chapter_notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own chapter notifications update" ON public.chapter_notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own chapter notifications delete" ON public.chapter_notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.notify_favorite_chapter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.published AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.published, false))
     AND EXISTS (SELECT 1 FROM public.series WHERE id = NEW.series_id AND published) THEN
    INSERT INTO public.chapter_notifications(user_id, series_id, chapter_id)
    SELECT f.user_id, NEW.series_id, NEW.id FROM public.favorites f WHERE f.series_id = NEW.series_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER chapters_notify_favorites AFTER INSERT OR UPDATE OF published ON public.chapters
FOR EACH ROW EXECUTE FUNCTION public.notify_favorite_chapter();