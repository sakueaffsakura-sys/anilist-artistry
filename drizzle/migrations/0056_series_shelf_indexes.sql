-- Índices das prateleiras da página inicial e das ordens do catálogo.
-- Sem eles o banco contava os capítulos de todas as obras publicadas antes de ordenar e cortar a lista:
-- Lançamentos (mais novas), Rankings (mais lidas) e Atualizados Recentes (fixadas primeiro) passavam do
-- limite de 3 s dos visitantes sem conta e voltavam com erro 500. Só cria índices: nenhum dado é alterado.
CREATE INDEX IF NOT EXISTS idx_series_pub_created ON public.series USING btree (created_at DESC) WHERE published;
CREATE INDEX IF NOT EXISTS idx_series_pub_views ON public.series USING btree (views DESC) WHERE published;
CREATE INDEX IF NOT EXISTS idx_series_pub_pinned_updated ON public.series USING btree (pinned DESC, updated_at DESC) WHERE published;
CREATE INDEX IF NOT EXISTS idx_series_pub_title ON public.series USING btree (title) WHERE published;
