-- Pedidos dos leitores com prioridade no envio do app Estúdio.
-- O admin liga um pedido a uma obra da MediocreScan; a obra entra na fila na frente das outras
-- (quanto mais leitores pediram, mais à frente) e o pedido é atendido sozinho quando a obra é publicada.
-- A comparação de títulos passa a ignorar acentos, pontuação, títulos alternativos e (fora novels) o formato.

ALTER TABLE public.work_requests ADD COLUMN IF NOT EXISTS mediocre_id integer;
ALTER TABLE public.work_requests ADD COLUMN IF NOT EXISTS queued_at timestamptz;
COMMENT ON COLUMN public.work_requests.mediocre_id IS 'Obra da MediocreScan escolhida pelo admin para atender o pedido (entra na fila com prioridade).';
CREATE INDEX IF NOT EXISTS work_requests_pending_mediocre_idx ON public.work_requests (mediocre_id) WHERE status = 'pending';

ALTER TABLE public.mediocre_queue ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.mediocre_queue.priority IS 'Quantos pedidos pendentes de leitores esperam por esta obra; maior vai antes na fila.';

-- Chave de título para comparar pedidos e obras: minúsculas, sem acentos, só letras e números.
CREATE OR REPLACE FUNCTION public.request_title_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT btrim(regexp_replace(regexp_replace(public.work_title_key(value), '[^[:alnum:]]+', ' ', 'g'), ' +', ' ', 'g'));
$$;

-- Todas as chaves de uma obra: título principal e alternativos (vírgula, ponto e vírgula, barra ou linha).
CREATE OR REPLACE FUNCTION public.series_title_keys(_title text, _alt_titles text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(array_agg(DISTINCT k), '{}'::text[])
  FROM (SELECT public.request_title_key(x) AS k
        FROM unnest(array[_title] || regexp_split_to_array(coalesce(_alt_titles, ''), '[,;|\n]')) AS x) s
  WHERE k <> '';
$$;

-- Formato do pedido só separa novel de quadrinho (o leitor costuma errar entre Manga, Manhwa, Comic...).
CREATE OR REPLACE FUNCTION public.request_kind_fits(_request_kind text, _series_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _request_kind = _series_kind OR (_request_kind <> 'Novel' AND _series_kind <> 'Novel');
$$;

-- Obra publicada (ou mudada): atende os pedidos ligados a ela pela MediocreScan e os de mesmo título.
CREATE OR REPLACE FUNCTION public.match_published_work_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  keys text[];
BEGIN
  IF NEW.published THEN
    keys := public.series_title_keys(NEW.title, NEW.alt_titles);
    UPDATE public.work_requests SET status = 'fulfilled', series_id = NEW.id
    WHERE status = 'pending'
      AND ((NEW.source_mediocre_id IS NOT NULL AND mediocre_id = NEW.source_mediocre_id)
        OR (public.request_kind_fits(kind, NEW.kind) AND public.request_title_key(title) = ANY (keys)));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_series_requests ON public.series;
CREATE TRIGGER match_series_requests
  AFTER INSERT OR UPDATE OF published, title, alt_titles, kind, source_mediocre_id ON public.series
  FOR EACH ROW EXECUTE FUNCTION public.match_published_work_requests();

-- Pedido novo: atende na hora se a obra já existe; se outro leitor pediu a mesma obra e o admin já a
-- escolheu na MediocreScan, o pedido novo entra na mesma obra (e ela sobe na fila).
CREATE OR REPLACE FUNCTION public.match_new_work_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  matched uuid;
  linked integer;
  k text := public.request_title_key(NEW.title);
BEGIN
  SELECT id INTO matched FROM public.series
  WHERE published AND public.request_kind_fits(NEW.kind, kind) AND k = ANY (public.series_title_keys(title, alt_titles))
  ORDER BY created_at LIMIT 1;
  IF matched IS NOT NULL THEN
    UPDATE public.work_requests SET status = 'fulfilled', series_id = matched WHERE id = NEW.id;
    RETURN NEW;
  END IF;
  SELECT mediocre_id INTO linked FROM public.work_requests
  WHERE status = 'pending' AND mediocre_id IS NOT NULL AND id <> NEW.id
    AND public.request_kind_fits(NEW.kind, kind) AND public.request_title_key(title) = k
  ORDER BY queued_at LIMIT 1;
  IF linked IS NOT NULL THEN
    UPDATE public.work_requests SET mediocre_id = linked, queued_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Prioridade da fila = pedidos pendentes ligados à obra.
CREATE OR REPLACE FUNCTION public.mediocre_request_priority(_obra integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT count(*)::integer FROM public.work_requests WHERE status = 'pending' AND mediocre_id = _obra;
$$;

CREATE OR REPLACE FUNCTION public.mediocre_queue_set_priority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.priority := public.mediocre_request_priority(NEW.obra_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mediocre_queue_priority ON public.mediocre_queue;
CREATE TRIGGER mediocre_queue_priority
  BEFORE INSERT ON public.mediocre_queue
  FOR EACH ROW EXECUTE FUNCTION public.mediocre_queue_set_priority();

CREATE OR REPLACE FUNCTION public.work_requests_refresh_priority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.mediocre_id IS NOT NULL THEN
    UPDATE public.mediocre_queue SET priority = public.mediocre_request_priority(OLD.mediocre_id) WHERE obra_id = OLD.mediocre_id;
  END IF;
  IF NEW.mediocre_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.mediocre_id IS DISTINCT FROM OLD.mediocre_id) THEN
    UPDATE public.mediocre_queue SET priority = public.mediocre_request_priority(NEW.mediocre_id) WHERE obra_id = NEW.mediocre_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS work_requests_priority ON public.work_requests;
CREATE TRIGGER work_requests_priority
  AFTER INSERT OR UPDATE OF status, mediocre_id ON public.work_requests
  FOR EACH ROW EXECUTE FUNCTION public.work_requests_refresh_priority();

-- Cópia dos pedidos pendentes antes do atendimento abaixo (fora da API).
CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.work_requests_0061 AS
  SELECT id, status, series_id, admin_note, now() AS saved_at FROM public.work_requests WHERE status = 'pending';

-- Pedidos pendentes que já batem com obras publicadas (com a comparação nova) são atendidos agora.
UPDATE public.series SET title = title WHERE published AND EXISTS (
  SELECT 1 FROM public.work_requests r
  WHERE r.status = 'pending' AND public.request_kind_fits(r.kind, series.kind)
    AND public.request_title_key(r.title) = ANY (public.series_title_keys(series.title, series.alt_titles))
);
