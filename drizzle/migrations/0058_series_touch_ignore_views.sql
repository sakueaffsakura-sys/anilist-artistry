-- Abrir um capítulo soma 1 em series.views. O gatilho series_touch trocava updated_at a cada
-- atualização, então cada leitura faria a obra subir em "Capítulos novos" e "Atualizadas" como se
-- tivesse capítulo novo. Agora o gatilho só roda quando muda algo além de views/updated_at; quem
-- grava updated_at de propósito (importações, painel) continua igual.
DROP TRIGGER IF EXISTS series_touch ON public.series;
CREATE TRIGGER series_touch
  BEFORE UPDATE ON public.series
  FOR EACH ROW
  WHEN ((to_jsonb(OLD) - 'views' - 'updated_at') IS DISTINCT FROM (to_jsonb(NEW) - 'views' - 'updated_at'))
  EXECUTE FUNCTION public.touch_updated_at();
