-- Run against the configured database. Every fixture is rolled back, never deleted.
BEGIN;
DO $$
DECLARE
 reader uuid;
 work public.series%ROWTYPE;
 request uuid;
BEGIN
 SELECT id INTO reader FROM public.profiles LIMIT 1;
 SELECT * INTO work FROM public.series WHERE published LIMIT 1;
 IF reader IS NULL OR work.id IS NULL THEN RAISE EXCEPTION 'Published work and reader required for integration test'; END IF;
 INSERT INTO public.work_requests(user_id, title, kind) VALUES(reader, '__request_regression_' || gen_random_uuid(), work.kind) RETURNING id INTO request;
 UPDATE public.work_requests SET title = work.title WHERE id = request;
 UPDATE public.series SET published = true WHERE id = work.id;
 IF NOT EXISTS(SELECT 1 FROM public.work_requests WHERE id = request AND status = 'fulfilled' AND series_id = work.id) THEN RAISE EXCEPTION 'Publication must fulfill matching request'; END IF;
 IF (SELECT count(*) FROM public.work_notifications WHERE request_id = request AND user_id = reader AND series_id = work.id) <> 1 THEN RAISE EXCEPTION 'Requester must receive one notification'; END IF;
 UPDATE public.series SET published = true WHERE id = work.id;
 IF (SELECT count(*) FROM public.work_notifications WHERE request_id = request) <> 1 THEN RAISE EXCEPTION 'Repeated publication must not duplicate notifications'; END IF;
 INSERT INTO public.work_requests(user_id, title, kind) VALUES(reader, work.title, work.kind) RETURNING id INTO request;
 IF NOT EXISTS(SELECT 1 FROM public.work_requests WHERE id = request AND status = 'fulfilled') THEN RAISE EXCEPTION 'Already published works must fulfill new requests'; END IF;
 PERFORM set_config('request.jwt.claim.sub', reader::text, true);
 IF NOT public.has_role(reader, 'admin') THEN
  BEGIN
   PERFORM public.resolve_work_request(gen_random_uuid(), work.id, '');
   RAISE EXCEPTION 'Non-admin was allowed to resolve a request';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'Acesso restrito' THEN RAISE; END IF;
  END;
 END IF;
END; $$;
ROLLBACK;