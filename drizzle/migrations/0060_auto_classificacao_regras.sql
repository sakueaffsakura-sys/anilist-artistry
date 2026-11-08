-- Classificação automática (0059), regras ampliadas: termos em inglês (muitas sinopses vêm assim),
-- sinais de conteúdo maduro que passavam como 14 (roupa íntima, súcubo, motel, desejo carnal...) e
-- mais gêneros reconhecidos (Aventura, Fantasia, Ficção Científica, Super-heróis, Crime...).
-- Só muda as funções de regra; o gatilho e a função do painel continuam os da 0059.

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
     OR t ~ '\m(hentai|porn\w*|orgasm\w*|estupr\w*|rap(e|ed|es|ing)|incest\w*|milf|bdsm|p[eê]nis|vagin\w*|masturba\w*|creampie|ahegao|paizuri)\M'
     OR t ~ 'sexo expl[ií]cito|explicit sex' THEN
    RETURN '18';
  END IF;
  IF g ~ '(^|\|)(ecchi|gore|sangue|maduro)(\||$)'
     OR t ~ '\m(sexual\w*|sexy|transa(r|ndo|m|ram)?|nudez|nud(e|es|ity)|naked|seios|breasts?|boobs|er[oó]tic\w*|lux[uú]ria|lust(ful)?|prostitu\w*|drogas|drugs|canibal\w*|cannibal\w*|suic[ií]d\w*|carna(l|is)|fetich\w*|fetish\w*|lewd|motel|bitch\w*|vadias?|s[uú]cub\w*|succub\w*|calcinhas?|lingerie|underwear|panties)\M'
     OR t ~ 'roupas? [ií]ntimas?|escort services?|servi[cç]os? de acompanhantes|garotas? de programa|call girls?'
     OR t ~ '\msexo\M(?! (oposto|masculino|feminino))'
     OR t ~ '(?<!opposite )(?<!same )(?<!same-)\msex\M(?! ed\M)' THEN
    RETURN '16';
  END IF;
  IF g <> '' OR coalesce(btrim(_synopsis), '') <> '' THEN
    RETURN '14';
  END IF;
  RETURN NULL;
END;
$$;

-- Gêneros a partir do título e da sinopse (até 5, na ordem abaixo, sempre da lista oficial).
CREATE OR REPLACE FUNCTION public.auto_genres(_title text, _alt_titles text, _synopsis text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce((array_agg(r.genre ORDER BY r.ord))[1:5], '{}'::text[])
  FROM (VALUES
    (1, 'Murim', '\mmurim\M'),
    (2, 'Artes Marciais', 'artes? marcia(l|is)|\mkung ?fu\M|\mmartial arts?\M'),
    (3, 'Cultivo', '\mcultiv(o|ador\w*|a[cç][aã]o)\M|\mcultivat\w*'),
    (4, 'Regressão', '\mregress\w*|voltou (no|ao) (tempo|passado)|segunda chance|second chance|back in time'),
    (5, 'Reencarnação', '\mreencarn\w*|\mrenasc\w*|\mreincarnat\w*|\mreborn\M|\mrebirth\M|acord(a|ou|ar) no corpo'),
    (6, 'Isekai', '\misekai\M|outro mundo|mundo diferente|transportad[oa] para|another world|(dentro|preso|presa) (de|do|da|em|no|na) (um |uma )?(jogo|romance|livro|novel)|ca(i|í|iu) (em|no|dentro de) (um )?(jogo|romance|livro)'),
    (7, 'Viagem no Tempo', 'viage(m|ns) no tempo|\mtime travel\w*'),
    (8, 'Sistema', '\msistema\M|status window'),
    (9, 'Dungeon', '\mdungeons?\M|\mmasmorras?\M'),
    (10, 'Zumbis', '\mzumbis?\M|\mzombies?\M'),
    (11, 'Vampiros', '\mvampir\w*'),
    (12, 'Escolar', '\mescola\M|\mcol[eé]gio\M|ensino m[eé]dio|\mestudantes?\M|\mschool\w*|\mclassmates?\M|colegas de (classe|turma)|\muniversit[aá]ri\w*|\mcollege\M|\macademia\M|\macademy\M'),
    (13, 'Magia', '\mmagia\M|\mm[aá]gic[oa]s?\M|\mmagos?\M|\mfeiticeir\w*|\mbruxa\w*|\mmagic\w*|\mmages?\M|\mwizards?\M|\mwitch\w*|\msorcer\w*'),
    (14, 'Demônios', '\mdem[oô]ni\w*|\mdemons?\M|\mdemonic\M|\ms[uú]cub\w*|\msuccub\w*'),
    (15, 'Romance', '\mromance\M|\mapaixon\w*|\mnamor\w*|\mcasament\w*|\mnoiv[oa]s?\M|\mamor\M|\mrelacionamento\w*|\mlove\M|\mlovers?\M|\mrelationships?\M|\mgirlfriend\M|\mboyfriend\M|\mmarriage\M'),
    (16, 'Comédia', '\mcom[eé]dia\M|\mengra[cç]ad\w*|\mhil[aá]ri\w*|\mcomedy\M|\mfunny\M|\mhilarious\M'),
    (17, 'Terror', '\mterror\M|\mhorror\M|\massombr\w*|\mfantasmas?\M|\mghosts?\M'),
    (18, 'Mistério', '\mmist[eé]ri\w*|\mdetetive\w*|\minvestiga\w*|\mmyster\w*|\mdetective\w*'),
    (19, 'Vilã', '\mvil[aã]\M|\mvillainess\M'),
    (20, 'Sobrevivência', '\msobreviv\w*|\msurviv\w*'),
    (21, 'Apocalipse', '\mapocal[ií]p\w*|\mapocalyp\w*|fim do mundo|\mcat[aá]strofe\w*'),
    (22, 'Super-heróis', 'super-?her[oó]i\w*|super-?humanos?|superhero\w*|super-?humans?'),
    (23, 'Ação', '\mca[cç]ador\w*|\mhunters?\M|\mbatalha\w*|\mlutar?\M|\mcombate\w*|\mguerreir\w*|\mespadachim\w*|\mespadas?\M|\mguerras?\M|\mbattles?\M|\mfight\w*|\mswords?\w*|\mwarriors?\M|\mwar\M'),
    (24, 'Aventura', '\maventur\w*|\madventur\w*|\mjornada\M|\mjourney\M'),
    (25, 'Fantasia', '\mfantasia\M|\mfantasy\M|\mdrag(ão|ões|ao|oes)\M|\mdragons?\M|\melf[oa]s?\M|\melves\M|\mreino\M|\mimp[eé]rio\M|\mduque\w*|\mduke\M|\mprincesa\w*|\mcavaleir\w*|\mknights?\M'),
    (26, 'Ficção Científica', 'fic[cç][aã]o cient[ií]fica|\msci-?fi\M|science fiction|\mrob[oô]s?\M|\mrobots?\M|\malien[ií]gena\w*|\maliens?\M|nave espacial|\mspaceships?\M'),
    (27, 'Crime', '\mcrimes?\M|\mcriminos\w*|\mm[aá]fia\w*|\mgangues?\M|\mgangs?\M|\myakuza\M'),
    (28, 'Histórico', '\mdinastia\M|\mdynasty\M|\mjoseon\M|\mfeudal\M|\msamurais?\M'),
    (29, 'Esportes', '\mfutebol\M|\mbasquete\M|\mv[oô]lei\M|\mboxe\M|\mbeisebol\M|\msports?\M|\mfootball\M|\msoccer\M|\mbasketball\M|\mvolleyball\M|\mbaseball\M|\mboxing\M|corridas? de cavalos|\mhorse ?rac\w*|\matleta\w*|\mathlet\w*'),
    (30, 'Video Games', '\mrealidade virtual\M|\mvrmmo\w*|\mmmorpg\M|\mgamer\M|virtual reality|\mvideo ?games?\M|jogo de (celular|rpg|videogame)'),
    (31, 'Gastronomia', '\mculin[aá]ri\w*|\mchef\M|\mcooking\M|\mcozinheir\w*|\mgastronom\w*'),
    (32, 'Música', '\mm[uú]sic(a|as|o|os)\M|\mcantor(a|es|as)?\M|\midols?\M|\mmusic\w*'),
    (33, 'Sobrenatural', '\msobrenatura\w*|\msupernatural\M|\mesp[ií]ritos?\M|\mspirits?\M|\myokai\M|\mexorcis\w*'),
    (34, 'Mecha', '\mmechas?\M|rob[oô]s? gigantes?|giant robots?'),
    (35, 'Hentai', '\mhentai\M'),
    (36, 'Ecchi', '\mecchi\M|roupas? [ií]ntimas?|\mcalcinhas?\M|\mlingerie\M|\munderwear\M|\mpanties\M|fan ?service'),
    (37, 'Harem', '\mhar[eé]m\M')
  ) AS r(ord, genre, pattern)
  WHERE lower(concat_ws(' ', _title, _alt_titles, _synopsis)) ~ r.pattern;
$$;

-- Cópia do estado anterior das obras que o recálculo abaixo pode mudar (idade automática ou sem gênero).
CREATE TABLE IF NOT EXISTS backup.series_0060 AS
  SELECT id, age_rating, age_rating_auto, genres, now() AS saved_at
  FROM public.series
  WHERE age_rating_auto OR cardinality(genres) = 0;

-- Aplica as regras novas: gêneros vazios primeiro (a idade usa os gêneros), depois as idades automáticas.
UPDATE public.series SET genres = genres
WHERE cardinality(genres) = 0 AND cardinality(public.auto_genres(title, alt_titles, synopsis)) > 0;
UPDATE public.series SET age_rating = age_rating
WHERE (age_rating IS NULL OR age_rating_auto)
  AND public.auto_age_rating(kind, genres, title, alt_titles, synopsis) IS NOT NULL
  AND public.auto_age_rating(kind, genres, title, alt_titles, synopsis) IS DISTINCT FROM age_rating;
