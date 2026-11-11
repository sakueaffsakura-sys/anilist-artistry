-- Contagem de capítulos guardada na própria obra.
-- As prateleiras, o catálogo, o perfil e o painel contavam os capítulos de cada obra a cada visita
-- (chapters(count) pelo PostgREST, com as regras de acesso aplicadas linha a linha): com ~50 mil
-- capítulos isso levava de 1 a 4 s por prateleira. Agora um gatilho mantém os números na obra.

ALTER TABLE public.series ADD COLUMN IF NOT EXISTS chapter_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS chapter_count_total integer NOT NULL DEFAULT 0;
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS latest_chapter_number numeric;
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS latest_chapter_at timestamptz;
COMMENT ON COLUMN public.series.chapter_count IS 'Capítulos publicados (mantido pelo gatilho chapters_series_counts).';
COMMENT ON COLUMN public.series.chapter_count_total IS 'Todos os capítulos, inclusive rascunhos (painel).';
COMMENT ON COLUMN public.series.latest_chapter_number IS 'Número do último capítulo publicado.';
COMMENT ON COLUMN public.series.latest_chapter_at IS 'Data do capítulo publicado mais recente.';

CREATE OR REPLACE FUNCTION public.refresh_series_chapter_counts(_series uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.series s SET
    chapter_count = c.published_count,
    chapter_count_total = c.total,
    latest_chapter_number = c.latest_number,
    latest_chapter_at = c.latest_at
  FROM (
    SELECT count(*) FILTER (WHERE published)::integer AS published_count,
           count(*)::integer AS total,
           max(number) FILTER (WHERE published) AS latest_number,
           max(created_at) FILTER (WHERE published) AS latest_at
    FROM public.chapters WHERE series_id = _series
  ) c
  WHERE s.id = _series
    AND (s.chapter_count, s.chapter_count_total, s.latest_chapter_number, s.latest_chapter_at)
        IS DISTINCT FROM (c.published_count, c.total, c.latest_number, c.latest_at);
$$;
REVOKE ALL ON FUNCTION public.refresh_series_chapter_counts(uuid) FROM PUBLIC, anon, authenticated;

-- Um recálculo por obra e por comando (importações inserem muitos capítulos de uma vez).
CREATE OR REPLACE FUNCTION public.chapters_series_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sid uuid;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    FOR sid IN SELECT DISTINCT series_id FROM new_rows LOOP
      PERFORM public.refresh_series_chapter_counts(sid);
    END LOOP;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    FOR sid IN SELECT DISTINCT series_id FROM old_rows LOOP
      PERFORM public.refresh_series_chapter_counts(sid);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS chapters_series_counts_ins ON public.chapters;
DROP TRIGGER IF EXISTS chapters_series_counts_upd ON public.chapters;
DROP TRIGGER IF EXISTS chapters_series_counts_del ON public.chapters;
CREATE TRIGGER chapters_series_counts_ins AFTER INSERT ON public.chapters
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.chapters_series_counts();
CREATE TRIGGER chapters_series_counts_upd AFTER UPDATE ON public.chapters
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.chapters_series_counts();
CREATE TRIGGER chapters_series_counts_del AFTER DELETE ON public.chapters
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.chapters_series_counts();

-- Os números novos não contam como "obra atualizada" (a ordem de "Capítulos novos" segue como estava).
DROP TRIGGER IF EXISTS series_touch ON public.series;
CREATE TRIGGER series_touch
  BEFORE UPDATE ON public.series
  FOR EACH ROW
  WHEN ((to_jsonb(OLD) - 'views' - 'updated_at' - 'age_rating' - 'age_rating_auto' - 'genres' - 'chapter_count' - 'chapter_count_total' - 'latest_chapter_number' - 'latest_chapter_at')
        IS DISTINCT FROM (to_jsonb(NEW) - 'views' - 'updated_at' - 'age_rating' - 'age_rating_auto' - 'genres' - 'chapter_count' - 'chapter_count_total' - 'latest_chapter_number' - 'latest_chapter_at'))
  EXECUTE FUNCTION public.touch_updated_at();

-- Preenche as obras que já existem (só colunas novas; nenhum dado existente muda).
UPDATE public.series s SET
  chapter_count = coalesce(c.published_count, 0),
  chapter_count_total = coalesce(c.total, 0),
  latest_chapter_number = c.latest_number,
  latest_chapter_at = c.latest_at
FROM public.series s2
LEFT JOIN (
  SELECT series_id,
         count(*) FILTER (WHERE published)::integer AS published_count,
         count(*)::integer AS total,
         max(number) FILTER (WHERE published) AS latest_number,
         max(created_at) FILTER (WHERE published) AS latest_at
  FROM public.chapters GROUP BY series_id
) c ON c.series_id = s2.id
WHERE s.id = s2.id;

-- Painel: total de capítulos do site sem varrer a tabela inteira.
CREATE OR REPLACE FUNCTION public.site_chapter_total()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT coalesce(sum(chapter_count_total), 0)::bigint FROM public.series; $$;
REVOKE ALL ON FUNCTION public.site_chapter_total() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_chapter_total() TO authenticated;
