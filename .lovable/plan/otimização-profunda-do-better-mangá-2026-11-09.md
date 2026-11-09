# Otimização profunda do Better Mangá

## O que os visitantes reais mostram (últimos 7 dias, p75)

| Página | Problema principal | Valor | Meta |
|---|---|---|---|
| Home `/` | Layout pulando (CLS) | 0,49 | 0,1 |
| Home `/` | Resposta do servidor (TTFB) | 2,7 s | 0,8 s |
| Home `/` | Primeira pintura (FCP) | 4,3 s | 1,8 s |
| `/admin/obras` | CLS | 0,54 | 0,1 |
| `/admin/mediocre` | CLS 0,40, FCP 3,8 s, LCP 6,0 s, INP 214 ms | | |

O maior problema é a página "pulando" enquanto carrega, seguido do servidor lento na home.

## Fase 1 — Parar a página de pular (CLS)
- Reservar altura fixa para o banner de destaque, prateleiras, capas (`SeriesCard` com proporção fixa) e listas "Capítulos novos"/"Mais lidas" enquanto carregam (esqueletos com o mesmo tamanho).
- Barra superior e navegação inferior com altura fixa desde o primeiro desenho.
- Fontes Sora/Manrope com `font-display: swap` + fallback de métricas parecidas e preload só dos pesos usados.
- Admin (obras e MediocreScan): tabelas e cartões com altura reservada; contadores e abas sem trocar de tamanho ao chegar os dados.

## Fase 2 — Home mais rápida no servidor (TTFB/FCP)
- Medir quais consultas da home rodam no carregamento e juntar em menos idas ao banco (rodar em paralelo, campos mínimos).
- Cache curto (ex.: 60 s) das prateleiras públicas e cabeçalhos de cache no HTML/dados da home.
- Renderizar no servidor só o banner e a primeira prateleira; demais seções carregam depois, sem pular (Fase 1).

## Fase 3 — Imagem principal e recursos
- Preload da capa do banner com prioridade alta; demais capas `loading="lazy"` com `width/height`.
- Capas no tamanho certo (miniaturas menores nas prateleiras).
- Dividir código: painel admin, leitor e ferramentas pesadas fora do pacote inicial da home.

## Fase 4 — Painel MediocreScan
- Carregar abas sob demanda (só a aberta), listas paginadas, e mover operações pesadas para depois da interação para baixar INP.

## Verificação
- Medir antes/depois no preview com navegador (CLS e tempo de carga da home a 384 px e 1440 px).
- `bun test` completo.
- Depois de publicar, reconsultar os dados reais de visitantes em alguns dias para confirmar a melhora.

## Detalhes técnicos
- CLS: `aspect-ratio` nas capas, `min-height` nos containers das seções, esqueletos com dimensões idênticas; evitar inserir banners/avisos acima do conteúdo após hidratação.
- TTFB: auditar loaders de `src/routes/index.tsx`, usar `Promise.all`, `ensureQueryData` com `staleTime`, `Cache-Control: public, s-maxage=60, stale-while-revalidate` em leituras públicas.
- Sem mudanças de regras, dados ou visual escolhido; nada é publicado automaticamente.
