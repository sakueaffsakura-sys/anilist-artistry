-- Transactional integration test: successful test writes are rolled back.
BEGIN;
DO $$
DECLARE first_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
 prefix text := 'duplicate-regression-' || gen_random_uuid()::text; candidate text;
BEGIN
 IF public.work_title_key('  ÁRVORE   azul ') <> 'arvore azul' THEN RAISE EXCEPTION 'Normalization failed'; END IF;
 INSERT INTO public.series(id, slug, title, alt_titles, kind) VALUES(first_id, prefix, prefix || ' Main', prefix || ' Alias; ' || prefix || ' Other', 'Manga');
 FOREACH candidate IN ARRAY ARRAY[upper(prefix || ' Main'), prefix || ' Alias', prefix || ' Other'] LOOP
  BEGIN
   INSERT INTO public.series(id, slug, title, kind) VALUES(other_id, prefix || '-duplicate', candidate, 'Novel');
   RAISE EXCEPTION 'Duplicate accepted';
  EXCEPTION WHEN unique_violation THEN
   IF SQLERRM NOT LIKE '%título alternativo%' THEN RAISE; END IF;
  END;
 END LOOP;
 BEGIN
  INSERT INTO public.series(id, slug, title, alt_titles, kind) VALUES(other_id, prefix || '-alt', prefix || ' Distinct', prefix || ' Alias', 'Manhwa');
  RAISE EXCEPTION 'Alternative collision accepted';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE '%título alternativo%' THEN RAISE; END IF;
 END;
 UPDATE public.series SET title = upper(title) WHERE id = first_id;
 INSERT INTO public.series(id, slug, title, kind) VALUES(other_id, prefix || '-unique', prefix || ' Independent', 'Manga');
 BEGIN
  UPDATE public.series SET alt_titles = prefix || ' Alias' WHERE id = other_id;
  RAISE EXCEPTION 'Edit collision accepted';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE '%título alternativo%' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;
