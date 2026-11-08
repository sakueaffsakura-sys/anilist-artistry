-- Classificação automática das obras, sem IA e sem créditos: regras fixas aplicadas pelo próprio banco.
-- Toda obra nova (app, automação, fila, painel) recebe na hora a classificação indicativa e, se vier sem
-- gêneros, gêneros tirados do título e da sinopse. Idade escolhida por alguém nunca é trocada.
-- A classificação automática nunca libera obra para perfil infantil: o mínimo é 14 (L, 10 e 12 só por
-- escolha de um administrador).

ALTER TABLE public.series ADD COLUMN IF NOT EXISTS age_rating_auto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.series.age_rating_auto IS 'true quando age_rating foi definida pela classificação automática (regras do banco), false quando alguém escolheu.';

-- Idade: 18 (conteúdo adulto declarado: tipo Hentai, tags adultas da fonte, termos explícitos),
-- 16 (ecchi, gore, sangue, maduro, insinuação sexual, nudez, drogas, suicídio),
-- 14 (demais obras com algum dado), nulo (sem gêneros e sem sinopse: nada para avaliar).
CREATE OR REPLACE FUNCTION public.auto_age_rating(_kind text, _genres text[], _title text, _alt_titles text, _synopsis text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  g text := lower(array_to_string(coalesce(_genres, '{}'::text[]), '|'));
  t text := lower(concat_ws(' ', _title, _alt_titles, _synopsis));
BEGIN
  IF _kind = 'Hentai'
     OR g ~ '(^|\|)(hentai|smut|adulto|adult|\+18|18\+|er[oó]tico|porn[oô]|pornogr[aá]fico|creampie|oral|ahegao|masturba[cç][aã]o|raio-x|paizuri|netorare|ntr|pau grande|preservativo|anal|femdom|incesto|milf|bunda grande|peit[oõ]es)(\||$)'
     OR t ~ '\+18|18\+'
     OR t ~ '\m(hentai|porn[oô]\w*|pornogr\w*|orgasm\w*|estupr\w*|incest\w*|milf|bdsm|p[eê]nis|vagin\w*|sexo expl[ií]cito)\M' THEN
    RETURN '18';
  END IF;
  IF g ~ '(^|\|)(ecchi|gore|sangue|maduro)(\||$)'
     OR t ~ '\m(sexual\w*|transa(r|ndo|m|ram)?|nudez|seios|er[oó]tic\w*|lux[uú]ria|prostitu\w*|drogas|canibal\w*|suic[ií]d\w*)\M'
     OR t ~ '\msexo\M(?! (oposto|masculino|feminino))' THEN
    RETURN '16';
  END IF;
  IF g <> '' OR coalesce(btrim(_synopsis), '') <> '' THEN
    RETURN '14';
  END IF;
  RETURN NULL;
END;
$$;

-- Gêneros a partir do título e da sinopse (até 5, sempre da lista oficial), para obras que chegam sem gênero.
CREATE OR REPLACE FUNCTION public.auto_genres(_title text, _alt_titles text, _synopsis text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce((array_agg(r.genre ORDER BY r.ord))[1:5], '{}'::text[])
  FROM (VALUES
    (1, 'Murim', '\mmurim\M'),
    (2, 'Artes Marciais', 'artes? marcia(l|is)|\mkung ?fu\M'),
    (3, 'Cultivo', '\mcultiv(o|ador\w*|a[cç][aã]o)\M'),
    (4, 'Regressão', '\mregress\w*|voltou (no|ao) (tempo|passado)|segunda chance'),
    (5, 'Reencarnação', '\mreencarn\w*|\mrenasc\w*'),
    (6, 'Isekai', '\misekai\M|outro mundo|mundo diferente|transportad[oa] para'),
    (7, 'Sistema', '\msistema\M'),
    (8, 'Dungeon', '\mdungeons?\M|\mmasmorras?\M'),
    (9, 'Zumbis', '\mzumbis?\M'),
    (10, 'Vampiros', '\mvampir\w*'),
    (11, 'Escolar', '\mescola\M|\mcol[eé]gio\M|ensino m[eé]dio|\mestudantes?\M'),
    (12, 'Magia', '\mmagia\M|\mm[aá]gic[oa]s?\M|\mmagos?\M|\mfeiticeir\w*|\mbruxa\w*'),
    (13, 'Demônios', '\mdem[oô]ni\w*'),
    (14, 'Romance', '\mromance\M|\mapaixon\w*|\mnamor\w*|\mcasament\w*|\mnoiv[oa]s?\M|\mamor\M'),
    (15, 'Comédia', '\mcom[eé]dia\M|\mengra[cç]ad\w*|\mhil[aá]ri\w*'),
    (16, 'Terror', '\mterror\M|\mhorror\M|\massombr\w*|\mfantasmas?\M'),
    (17, 'Mistério', '\mmist[eé]ri\w*|\mdetetive\w*|\minvestiga\w*'),
    (18, 'Vilã', '\mvil[aã]\M'),
    (19, 'Sobrevivência', '\msobreviv\w*'),
    (20, 'Apocalipse', '\mapocal[ií]p\w*'),
    (21, 'Ação', '\mca[cç]ador\w*|\mhunters?\M|\mbatalha\w*|\mlutar?\M|\mcombate\w*|\mguerreir\w*'),
    (22, 'Fantasia', '\mdrag(ão|ões|ao|oes)\M|\melf[oa]s?\M|\mreino\M|\mimp[eé]rio\M|\mduque\w*|\mprincesa\w*'),
    (23, 'Esportes', '\mfutebol\M|\mbasquete\M|\mv[oô]lei\M|\mboxe\M|\mbeisebol\M'),
    (24, 'Video Games', '\mrealidade virtual\M|\mvrmmo\w*|\mmmorpg\M|\mgamer\M'),
    (25, 'Hentai', '\mhentai\M'),
    (26, 'Ecchi', '\mecchi\M'),
    (27, 'Harem', '\mhar[eé]m\M')
  ) AS r(ord, genre, pattern)
  WHERE lower(concat_ws(' ', _title, _alt_titles, _synopsis)) ~ r.pattern;
$$;

CREATE OR REPLACE FUNCTION public.series_auto_classify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  rating text;
BEGIN
  IF coalesce(array_length(NEW.genres, 1), 0) = 0 THEN
    NEW.genres := public.auto_genres(NEW.title, NEW.alt_titles, NEW.synopsis);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.age_rating IS NULL THEN
      NEW.age_rating := public.auto_age_rating(NEW.kind, NEW.genres, NEW.title, NEW.alt_titles, NEW.synopsis);
      NEW.age_rating_auto := NEW.age_rating IS NOT NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.age_rating IS NOT NULL AND NEW.age_rating IS DISTINCT FROM OLD.age_rating THEN
    -- Idade escolhida (painel, classificação aprovada, etiqueta +18 da fonte): fica fixa.
    NEW.age_rating_auto := false;
  ELSIF NEW.age_rating IS NULL OR NEW.age_rating_auto THEN
    -- Sem idade, idade automática com dados novos, ou pedido para voltar ao automático
    -- (age_rating_auto = true ou idade vazia): calcula de novo. Sem dados, mantém a idade que já tinha.
    rating := public.auto_age_rating(NEW.kind, NEW.genres, NEW.title, NEW.alt_titles, NEW.synopsis);
    IF rating IS NOT NULL THEN
      NEW.age_rating := rating;
      NEW.age_rating_auto := true;
    ELSIF NEW.age_rating IS NULL THEN
      NEW.age_rating_auto := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS series_auto_classify ON public.series;
CREATE TRIGGER series_auto_classify
  BEFORE INSERT OR UPDATE OF kind, genres, title, alt_titles, synopsis, age_rating, age_rating_auto ON public.series
  FOR EACH ROW
  EXECUTE FUNCTION public.series_auto_classify();

-- Classificar não é atualizar a obra: idade e gêneros não fazem a obra subir em "Capítulos novos".
DROP TRIGGER IF EXISTS series_touch ON public.series;
CREATE TRIGGER series_touch
  BEFORE UPDATE ON public.series
  FOR EACH ROW
  WHEN ((to_jsonb(OLD) - 'views' - 'updated_at' - 'age_rating' - 'age_rating_auto' - 'genres') IS DISTINCT FROM (to_jsonb(NEW) - 'views' - 'updated_at' - 'age_rating' - 'age_rating_auto' - 'genres'))
  EXECUTE FUNCTION public.touch_updated_at();

-- Painel: classifica as obras pendentes (e, com _all, recalcula as idades automáticas).
-- Só administradores; devolve quantas obras ganharam gêneros e quantas tiveram a idade definida ou trocada.
CREATE OR REPLACE FUNCTION public.auto_classify_series(_all boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  generos integer;
  idades integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Somente administradores podem classificar obras.';
  END IF;
  UPDATE public.series SET genres = genres
  WHERE cardinality(genres) = 0 AND cardinality(public.auto_genres(title, alt_titles, synopsis)) > 0;
  GET DIAGNOSTICS generos = ROW_COUNT;
  WITH calc AS (
    SELECT id, public.auto_age_rating(kind, genres, title, alt_titles, synopsis) AS rating
    FROM public.series
    WHERE age_rating IS NULL OR (_all AND age_rating_auto)
  )
  UPDATE public.series s SET age_rating = s.age_rating
  FROM calc
  WHERE calc.id = s.id AND calc.rating IS NOT NULL AND calc.rating IS DISTINCT FROM s.age_rating;
  GET DIAGNOSTICS idades = ROW_COUNT;
  RETURN jsonb_build_object('generos', generos, 'idades', idades);
END;
$$;
REVOKE ALL ON FUNCTION public.auto_classify_series(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_classify_series(boolean) TO authenticated;

-- Cópia do estado anterior das obras que o preenchimento abaixo pode mudar, para reverter se preciso.
-- Fica num schema próprio, fora da API do site (sem acesso para visitantes e contas).
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC;
CREATE TABLE IF NOT EXISTS backup.series_0059 AS
  SELECT id, age_rating, genres, now() AS saved_at
  FROM public.series
  WHERE age_rating IS NULL OR cardinality(genres) = 0;

-- Obras que já estão no site: gêneros vazios e idades ausentes.
UPDATE public.series SET genres = genres
WHERE cardinality(genres) = 0 AND cardinality(public.auto_genres(title, alt_titles, synopsis)) > 0;
UPDATE public.series SET age_rating = age_rating
WHERE age_rating IS NULL AND public.auto_age_rating(kind, genres, title, alt_titles, synopsis) IS NOT NULL;
