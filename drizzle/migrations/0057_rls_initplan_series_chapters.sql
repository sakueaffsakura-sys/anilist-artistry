-- As regras de acesso de obras e capítulos chamavam maintenance_access_allowed() e has_role() uma vez
-- por linha. Com o "(select ...)" o Postgres calcula cada uma uma vez por consulta (o resultado não
-- depende da linha), e contar os capítulos para o painel cai de ~5,4 s para ~0,4 s. Mesmas regras:
-- só muda quando a função é calculada. Nomes, comandos, papéis e tipo (restritiva/permissiva) ficam iguais.
ALTER POLICY maintenance_restriction ON public.chapters
  USING ((select public.maintenance_access_allowed()))
  WITH CHECK ((select public.maintenance_access_allowed()));
ALTER POLICY maintenance_restriction ON public.series
  USING ((select public.maintenance_access_allowed()))
  WITH CHECK ((select public.maintenance_access_allowed()));
ALTER POLICY "staff read all chapters" ON public.chapters
  USING ((select public.has_role((select auth.uid()), 'admin'::app_role)) OR (select public.has_role((select auth.uid()), 'uploader'::app_role)));
ALTER POLICY "staff read all series" ON public.series
  USING ((select public.has_role((select auth.uid()), 'admin'::app_role)) OR (select public.has_role((select auth.uid()), 'uploader'::app_role)));
