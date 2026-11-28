-- 0067: Tradutor de Obras -> Better Mangá.
-- O site de tradução do administrador (Tradutor de Obras) envia obras e capítulos já traduzidos.
-- O painel (/admin/tradutor) gera um código de ligação; o Tradutor chama a RPC tradutor_envio com ele.
-- As páginas ficam no armazenamento público do Tradutor; aqui só os links são guardados (como os do CDN da MediocreScan).

CREATE TABLE IF NOT EXISTS public.tradutor_codigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  works_received integer NOT NULL DEFAULT 0,
  chapters_added integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0
);
REVOKE ALL ON public.tradutor_codigos FROM anon, authenticated;
GRANT SELECT ON public.tradutor_codigos TO authenticated;
GRANT UPDATE (revoked_at) ON public.tradutor_codigos TO authenticated;
GRANT ALL ON public.tradutor_codigos TO service_role;
ALTER TABLE public.tradutor_codigos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read tradutor codes" ON public.tradutor_codigos;
CREATE POLICY "Admins read tradutor codes" ON public.tradutor_codigos FOR SELECT TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS "Admins revoke tradutor codes" ON public.tradutor_codigos;
CREATE POLICY "Admins revoke tradutor codes" ON public.tradutor_codigos FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin'))) WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin')));

-- Obra do Tradutor que deu origem à obra do site (uma para uma; reenviar atualiza a mesma).
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS source_tradutor_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS series_source_tradutor_id_key ON public.series (source_tradutor_id) WHERE source_tradutor_id IS NOT NULL;

-- Código novo (o painel mostra uma vez; guardamos só o hash). Só administradores.
CREATE OR REPLACE FUNCTION public.tradutor_gerar_codigo()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_codigo text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem ligar o Tradutor de Obras.' USING ERRCODE = '42501';
  END IF;
  v_codigo := 'bm_' || encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.tradutor_codigos (token_hash, created_by)
  VALUES (encode(sha256(convert_to(v_codigo, 'UTF8')), 'hex'), auth.uid());
  RETURN v_codigo;
END $$;
REVOKE ALL ON FUNCTION public.tradutor_gerar_codigo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tradutor_gerar_codigo() TO authenticated;

-- Resumo de uma obra do site para o Tradutor.
CREATE OR REPLACE FUNCTION public.tradutor_serie_json(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', s.id, 'slug', s.slug, 'titulo', s.title, 'publicada', s.published, 'tipo', s.kind,
    'status', s.status, 'capa', s.cover_url, 'capitulos', s.chapter_count_total, 'publicados', s.chapter_count,
    'ligada', s.source_tradutor_id IS NOT NULL)
  FROM public.series s WHERE s.id = p_id
$$;
REVOKE ALL ON FUNCTION public.tradutor_serie_json(uuid) FROM PUBLIC, anon, authenticated;

-- Porta de entrada do Tradutor (chamada sem conta, com o código de ligação).
-- Ações: status | consultar {obra} | buscar {titulo, alternativos} ou {busca} | obra {...} | capitulos {...} | desligar
-- Erros de dados voltam como {ok:false, erro}; código inválido ou revogado vira erro HTTP.
CREATE OR REPLACE FUNCTION public.tradutor_envio(p_codigo text, p_acao text, p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Páginas só do armazenamento público do Tradutor de Obras (projeto hrafsdtarqqtvcqnvukb, bucket "publicas").
  c_pagina constant text := '^https://hrafsdtarqqtvcqnvukb\.supabase\.co/storage/v1/object/public/publicas/[A-Za-z0-9/_.-]{1,250}(\?v=[A-Za-z0-9_-]{1,40})?$';
  c_tipos constant text[] := ARRAY['Manga','Manhwa','Manhua','Webtoon','One-shot','Doujinshi','HQ','Comic','Comic2','Shoujo','Shoujo2','Yaoi','Yuri','Hentai','English'];
  c_status constant text[] := ARRAY['Em andamento','Completo','Hiato','Cancelado'];
  v_cod public.tradutor_codigos%ROWTYPE;
  d jsonb := CASE WHEN jsonb_typeof(p_dados) = 'object' THEN p_dados ELSE '{}'::jsonb END;
  v_obra uuid;
  v_serie public.series%ROWTYPE;
  v_titulo text; v_alt text; v_sinopse text; v_capa text; v_tipo text; v_status text; v_generos text[];
  v_busca text; v_base text; v_slug text; n integer;
  v_iguais jsonb;
  v_cap jsonb; v_num numeric; v_tit text; v_pags jsonb; v_ex public.chapters%ROWTYPE;
  v_publicar boolean; v_substituir boolean;
  v_add integer := 0; v_upd integer := 0; v_pul jsonb := '[]'::jsonb; v_novas integer := 0;
  v_res jsonb;
BEGIN
  IF p_codigo IS NULL OR p_codigo !~ '^bm_[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Código de ligação inválido. No painel do Better Mangá, abra Tradutor de Obras e ligue de novo.' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_cod FROM public.tradutor_codigos WHERE token_hash = encode(sha256(convert_to(p_codigo, 'UTF8')), 'hex');
  IF NOT FOUND OR v_cod.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'A ligação com o Better Mangá foi desfeita. No painel do Better Mangá, abra Tradutor de Obras e ligue de novo.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_cod.created_by, 'admin') THEN
    RAISE EXCEPTION 'A conta que fez a ligação não é mais administradora do Better Mangá.' USING ERRCODE = '42501';
  END IF;

  BEGIN
    IF p_acao = 'status' THEN
      v_res := jsonb_build_object('ok', true,
        'admin', (SELECT coalesce(nullif(btrim(p.display_name), ''), p.username) FROM public.profiles p WHERE p.id = v_cod.created_by),
        'obras', (SELECT count(*) FROM public.series WHERE source_tradutor_id IS NOT NULL),
        'capitulos', v_cod.chapters_added,
        'ligado_em', v_cod.created_at);

    ELSIF p_acao = 'desligar' THEN
      UPDATE public.tradutor_codigos SET revoked_at = now() WHERE id = v_cod.id;
      v_res := jsonb_build_object('ok', true);

    ELSIF p_acao = 'consultar' THEN
      v_obra := (d->>'obra')::uuid;
      SELECT * INTO v_serie FROM public.series WHERE source_tradutor_id = v_obra;
      IF NOT FOUND THEN
        v_res := jsonb_build_object('ok', true, 'serie', NULL, 'numeros', '[]'::jsonb, 'do_tradutor', '[]'::jsonb, 'publicados', '[]'::jsonb);
      ELSE
        v_res := jsonb_build_object('ok', true, 'serie', public.tradutor_serie_json(v_serie.id),
          'numeros', coalesce((SELECT jsonb_agg(c.number ORDER BY c.number) FROM public.chapters c WHERE c.series_id = v_serie.id), '[]'::jsonb),
          'publicados', coalesce((SELECT jsonb_agg(c.number ORDER BY c.number) FROM public.chapters c WHERE c.series_id = v_serie.id AND c.published), '[]'::jsonb),
          'do_tradutor', coalesce((SELECT jsonb_agg(c.number ORDER BY c.number) FROM public.chapters c WHERE c.series_id = v_serie.id
            AND CASE WHEN jsonb_typeof(c.pages) = 'array' AND jsonb_array_length(c.pages) > 0
              THEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.pages) x WHERE jsonb_typeof(x) <> 'string' OR (x #>> '{}') !~ c_pagina)
              ELSE false END), '[]'::jsonb));
      END IF;

    ELSIF p_acao = 'buscar' THEN
      v_busca := lower(btrim(coalesce(d->>'busca', '')));
      IF v_busca <> '' THEN
        v_res := jsonb_build_object('ok', true, 'obras', coalesce((
          SELECT jsonb_agg(public.tradutor_serie_json(t.id)) FROM (
            SELECT s.id FROM public.series s
            WHERE position(v_busca IN lower(s.title)) > 0 OR position(v_busca IN lower(coalesce(s.alt_titles, ''))) > 0
            ORDER BY s.title LIMIT 12) t), '[]'::jsonb));
      ELSE
        v_res := jsonb_build_object('ok', true, 'obras', coalesce((
          SELECT jsonb_agg(public.tradutor_serie_json(s.id) ORDER BY s.title) FROM public.series s
          WHERE s.id IN (SELECT unnest(c.series_ids) FROM public.work_title_claims c
            WHERE c.title_key = ANY (public.work_title_keys(left(coalesce(d->>'titulo', ''), 200), left(coalesce(d->>'alternativos', ''), 1000))))), '[]'::jsonb));
      END IF;

    ELSIF p_acao = 'obra' THEN
      v_obra := (d->>'obra')::uuid;
      IF v_obra IS NULL THEN RAISE EXCEPTION 'Obra do Tradutor não informada.'; END IF;
      v_titulo := btrim(coalesce(d->>'titulo', ''));
      IF char_length(v_titulo) < 1 OR char_length(v_titulo) > 200 THEN RAISE EXCEPTION 'O título precisa ter de 1 a 200 letras.'; END IF;
      v_alt := nullif(btrim(coalesce(d->>'alternativos', '')), '');
      IF char_length(v_alt) > 1000 THEN RAISE EXCEPTION 'Títulos alternativos longos demais (máximo 1000 letras).'; END IF;
      v_sinopse := nullif(btrim(coalesce(d->>'sinopse', '')), '');
      IF char_length(v_sinopse) > 5000 THEN RAISE EXCEPTION 'Sinopse longa demais (máximo 5000 letras).'; END IF;
      v_capa := nullif(btrim(coalesce(d->>'capa', '')), '');
      IF v_capa IS NOT NULL AND (char_length(v_capa) > 1000 OR v_capa !~ '^https://[^\s"''<>]+$') THEN RAISE EXCEPTION 'Link da capa inválido.'; END IF;
      v_tipo := coalesce(nullif(btrim(coalesce(d->>'tipo', '')), ''), 'Comic');
      IF NOT v_tipo = ANY (c_tipos) THEN RAISE EXCEPTION 'Formato desconhecido: %.', v_tipo; END IF;
      v_status := coalesce(nullif(btrim(coalesce(d->>'status', '')), ''), 'Em andamento');
      IF NOT v_status = ANY (c_status) THEN RAISE EXCEPTION 'Situação desconhecida: %.', v_status; END IF;
      SELECT coalesce(array_agg(g ORDER BY primeira), ARRAY[]::text[]) INTO v_generos FROM (
        SELECT left(btrim(x), 40) g, min(o) primeira
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(d->'generos') = 'array' THEN d->'generos' ELSE '[]'::jsonb END) WITH ORDINALITY AS e(x, o)
        WHERE btrim(x) <> '' GROUP BY 1) t;
      v_generos := v_generos[1:20];

      SELECT * INTO v_serie FROM public.series WHERE source_tradutor_id = v_obra FOR UPDATE;
      IF FOUND THEN
        IF coalesce((d->>'atualizar')::boolean, false) THEN
          UPDATE public.series SET title = v_titulo, alt_titles = v_alt, synopsis = coalesce(v_sinopse, synopsis),
            cover_url = coalesce(v_capa, cover_url), kind = v_tipo, status = v_status,
            genres = CASE WHEN cardinality(v_generos) > 0 THEN v_generos ELSE genres END, updated_at = now()
          WHERE id = v_serie.id;
        END IF;
        v_res := jsonb_build_object('ok', true, 'criada', false, 'ligada', false, 'serie', public.tradutor_serie_json(v_serie.id));
      ELSIF nullif(d->>'serie', '') IS NOT NULL THEN
        -- Juntar com uma obra que já está no site.
        SELECT * INTO v_serie FROM public.series WHERE id = (d->>'serie')::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Essa obra não existe mais no Better Mangá.'; END IF;
        IF v_serie.source_tradutor_id IS NOT NULL AND v_serie.source_tradutor_id <> v_obra THEN
          RAISE EXCEPTION 'Essa obra do Better Mangá já está ligada a outra obra do Tradutor.';
        END IF;
        UPDATE public.series SET source_tradutor_id = v_obra,
          cover_url = CASE WHEN coalesce(btrim(cover_url), '') = '' THEN v_capa ELSE cover_url END,
          synopsis = CASE WHEN coalesce(btrim(synopsis), '') = '' THEN v_sinopse ELSE synopsis END
        WHERE id = v_serie.id;
        v_novas := 1;
        v_res := jsonb_build_object('ok', true, 'criada', false, 'ligada', true, 'serie', public.tradutor_serie_json(v_serie.id));
      ELSE
        -- Obra nova: antes, as que já usam o mesmo nome (o gatilho de títulos duplicados barraria).
        SELECT jsonb_agg(public.tradutor_serie_json(s.id) ORDER BY s.title) INTO v_iguais FROM public.series s
        WHERE s.id IN (SELECT unnest(c.series_ids) FROM public.work_title_claims c
          WHERE c.title_key = ANY (public.work_title_keys(v_titulo, v_alt)));
        IF v_iguais IS NOT NULL THEN
          v_res := jsonb_build_object('ok', false, 'conflito', v_iguais,
            'erro', 'Já existe obra com esse título (ou título alternativo) no Better Mangá.');
        ELSE
          v_base := btrim(regexp_replace(translate(lower(v_titulo),
            'áàâãäåāéèêëēíìîïīóòôõöøōúùûüūçñýÿ', 'aaaaaaaeeeeeiiiiiooooooouuuuucnyy'), '[^a-z0-9]+', '-', 'g'), '-');
          v_base := btrim(left(v_base, 72), '-');
          IF v_base = '' THEN v_base := 'obra-' || left(replace(v_obra::text, '-', ''), 8); END IF;
          v_slug := v_base; n := 1;
          WHILE EXISTS (SELECT 1 FROM public.series WHERE slug = v_slug) LOOP
            n := n + 1;
            v_slug := v_base || '-' || n;
            IF n > 60 THEN v_slug := v_base || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6); EXIT; END IF;
          END LOOP;
          INSERT INTO public.series (slug, title, alt_titles, synopsis, cover_url, kind, status, genres, published, created_by, source_tradutor_id)
          VALUES (v_slug, v_titulo, v_alt, v_sinopse, v_capa, v_tipo, v_status, v_generos, false, v_cod.created_by, v_obra)
          RETURNING * INTO v_serie;
          v_novas := 1;
          v_res := jsonb_build_object('ok', true, 'criada', true, 'ligada', false, 'serie', public.tradutor_serie_json(v_serie.id));
        END IF;
      END IF;

    ELSIF p_acao = 'capitulos' THEN
      v_obra := (d->>'obra')::uuid;
      SELECT * INTO v_serie FROM public.series WHERE source_tradutor_id = v_obra FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Envie a obra antes dos capítulos.'; END IF;
      v_publicar := coalesce((d->>'publicar')::boolean, false);
      v_substituir := coalesce((d->>'substituir')::boolean, false);
      IF jsonb_typeof(d->'capitulos') <> 'array' OR jsonb_array_length(d->'capitulos') NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION 'Envie de 1 a 20 capítulos por vez.';
      END IF;
      FOR v_cap IN SELECT x FROM jsonb_array_elements(d->'capitulos') x LOOP
        v_num := (v_cap->>'numero')::numeric;
        IF v_num IS NULL OR v_num < 0 OR v_num > 100000 OR v_num <> round(v_num, 2) THEN
          RAISE EXCEPTION 'Número de capítulo inválido: %.', coalesce(v_cap->>'numero', 'vazio');
        END IF;
        v_tit := left(nullif(btrim(coalesce(v_cap->>'titulo', '')), ''), 150);
        v_pags := v_cap->'paginas';
        IF jsonb_typeof(v_pags) <> 'array' OR jsonb_array_length(v_pags) NOT BETWEEN 1 AND 500 THEN
          RAISE EXCEPTION 'O capítulo % precisa ter de 1 a 500 páginas.', v_num;
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pags) x WHERE jsonb_typeof(x) <> 'string' OR (x #>> '{}') !~ c_pagina) THEN
          RAISE EXCEPTION 'O capítulo % tem página fora do armazenamento do Tradutor de Obras.', v_num;
        END IF;
        SELECT * INTO v_ex FROM public.chapters WHERE series_id = v_serie.id AND number = v_num;
        IF FOUND THEN
          IF NOT v_substituir THEN
            v_pul := v_pul || jsonb_build_object('numero', v_num, 'motivo', 'já está no site');
          ELSIF jsonb_typeof(v_ex.pages) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_ex.pages) x WHERE jsonb_typeof(x) <> 'string' OR (x #>> '{}') !~ c_pagina) THEN
            v_pul := v_pul || jsonb_build_object('numero', v_num, 'motivo', 'já está no site com páginas de outra fonte');
          ELSE
            UPDATE public.chapters SET pages = v_pags, title = coalesce(v_tit, title), published = published OR v_publicar WHERE id = v_ex.id;
            v_upd := v_upd + 1;
          END IF;
        ELSE
          INSERT INTO public.chapters (series_id, number, title, pages, published) VALUES (v_serie.id, v_num, v_tit, v_pags, v_publicar);
          v_add := v_add + 1;
        END IF;
      END LOOP;
      IF v_publicar AND NOT v_serie.published AND v_add + v_upd > 0 THEN
        UPDATE public.series SET published = true WHERE id = v_serie.id;
      END IF;
      v_res := jsonb_build_object('ok', true, 'adicionados', v_add, 'atualizados', v_upd, 'pulados', v_pul,
        'serie', public.tradutor_serie_json(v_serie.id));

    ELSE
      RAISE EXCEPTION 'Ação desconhecida: %.', coalesce(p_acao, 'vazia');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.tradutor_codigos SET errors = errors + 1, last_used_at = now() WHERE id = v_cod.id;
    RETURN jsonb_build_object('ok', false, 'erro', CASE
      WHEN SQLSTATE = '22P02' THEN 'Dado em formato inválido (' || SQLERRM || ').'
      WHEN SQLSTATE = '23505' THEN 'Já existe obra com esse título (ou título alternativo) no Better Mangá.'
      ELSE SQLERRM END);
  END;

  UPDATE public.tradutor_codigos SET last_used_at = now(), works_received = works_received + v_novas,
    chapters_added = chapters_added + v_add WHERE id = v_cod.id;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.tradutor_envio(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tradutor_envio(text, text, jsonb) TO anon, authenticated;