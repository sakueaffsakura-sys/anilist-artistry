CREATE TABLE public.work_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
 kind text NOT NULL DEFAULT 'Manga' CHECK (kind IN ('Comic','Comic2','Shoujo','Shoujo2','Manga','Yaoi','Yuri','Hentai','English','Novel')),
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','rejected')),
 series_id uuid REFERENCES public.series(id) ON DELETE SET NULL,
 admin_note text NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.work_requests TO authenticated;
GRANT ALL ON public.work_requests TO service_role;
ALTER TABLE public.work_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY requests_read ON public.work_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY requests_create ON public.work_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending' AND series_id IS NULL AND admin_note = '' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND banned));
CREATE INDEX requests_user_idx ON public.work_requests(user_id, created_at DESC);
CREATE INDEX requests_pending_idx ON public.work_requests(status, created_at DESC);
CREATE UNIQUE INDEX requests_unique_pending ON public.work_requests(user_id, lower(btrim(title)), kind) WHERE status = 'pending';
CREATE TABLE public.work_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 request_id uuid NOT NULL UNIQUE REFERENCES public.work_requests(id) ON DELETE CASCADE,
 series_id uuid NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
 title text NOT NULL,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.work_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.work_notifications TO authenticated;
GRANT ALL ON public.work_notifications TO service_role;
ALTER TABLE public.work_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_read ON public.work_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_mark_read ON public.work_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX notifications_user_idx ON public.work_notifications(user_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.notify_fulfilled_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.status = 'fulfilled' AND OLD.status IS DISTINCT FROM 'fulfilled' THEN
  IF NOT EXISTS (SELECT 1 FROM public.series WHERE id = NEW.series_id AND published) THEN RAISE EXCEPTION 'Selecione uma obra publicada'; END IF;
  INSERT INTO public.work_notifications(user_id, request_id, series_id, title) VALUES (NEW.user_id, NEW.id, NEW.series_id, NEW.title) ON CONFLICT (request_id) DO NOTHING;
 END IF;
 NEW.updated_at := now();
 RETURN NEW;
END; $$;
CREATE TRIGGER request_fulfilled BEFORE UPDATE ON public.work_requests FOR EACH ROW EXECUTE FUNCTION public.notify_fulfilled_request();
CREATE OR REPLACE FUNCTION public.resolve_work_request(_request uuid, _series uuid DEFAULT NULL, _note text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Acesso restrito'; END IF;
 IF char_length(_note) > 2000 THEN RAISE EXCEPTION 'Resposta muito longa'; END IF;
 IF _series IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.series WHERE id = _series AND published) THEN RAISE EXCEPTION 'Selecione uma obra publicada'; END IF;
 UPDATE public.work_requests SET status = CASE WHEN _series IS NULL THEN 'rejected' ELSE 'fulfilled' END, series_id = _series, admin_note = _note WHERE id = _request AND status = 'pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido já atendido ou não encontrado'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_work_request(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_work_request(uuid, uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.match_published_work_requests() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.published THEN
  UPDATE public.work_requests SET status = 'fulfilled', series_id = NEW.id WHERE status = 'pending' AND kind = NEW.kind AND lower(btrim(title)) = lower(btrim(NEW.title));
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER match_series_requests AFTER INSERT OR UPDATE OF published, title, kind ON public.series FOR EACH ROW EXECUTE FUNCTION public.match_published_work_requests();
CREATE OR REPLACE FUNCTION public.match_new_work_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE matched uuid;
BEGIN
 SELECT id INTO matched FROM public.series WHERE published AND kind = NEW.kind AND lower(btrim(title)) = lower(btrim(NEW.title)) LIMIT 1;
 IF matched IS NOT NULL THEN UPDATE public.work_requests SET status = 'fulfilled', series_id = matched WHERE id = NEW.id; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER match_request_on_create AFTER INSERT ON public.work_requests FOR EACH ROW EXECUTE FUNCTION public.match_new_work_request();
CREATE INDEX IF NOT EXISTS series_slider_updated_idx ON public.series(updated_at DESC) WHERE published AND in_slider;