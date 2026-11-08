# Migrations do Better Mangá

## Regras de aplicação

- Migration aplicada não é editada, renomeada nem reaplicada: correções exigem uma nova migration.
- Conferir o histórico do banco e o estado do schema antes de executar SQL. A existência de um arquivo não comprova sua aplicação.
- Fazer backup antes de aplicar migrations. Não apagar dados, remover colunas ou publicar releases fictícias para testes.
- `drizzle/migrations/meta/_journal.json` registra a sequência gerenciada até 0041. Os snapshots existentes não devem ser regenerados para tabelas ainda inexistentes.
- A 0042 de anúncios foi recebida e aplicada no banco em 2026-10-12. Não executar a 0043 automaticamente antes de revisar a necessidade das colunas legadas.

## Ordem dos arquivos

Todos os nomes abaixo são relativos a `drizzle/migrations/`.

| Arquivo | Finalidade |
| --- | --- |
| 0000_create_manga_platform.sql | Estrutura inicial: perfis, papéis, obras, capítulos, favoritos, histórico, comentários e avaliações. |
| 0001_manga_storage_policies.sql | Políticas iniciais de armazenamento de mídia. |
| 0002_increment_series_views.sql | Função para incrementar visualizações de obras. |
| 0003_seed_demo_series.sql | Dados demonstrativos originais; não reaplicar em banco existente. |
| 0004_reading_status_and_lists.sql | Estado de leitura, listas, itens e seguidores. |
| 0005_profile_extras.sql | Dados adicionais de perfil, comentários e seguidores de perfis. |
| 0006_xp_system.sql | Eventos, concessão e ranking de XP. |
| 0007_protect_profile_xp.sql | Proteção contra alteração indevida de XP. |
| 0008_admin_account_management.sql | Banimento e gerenciamento administrativo de contas. |
| 0009_tighten_public_read_policies.sql | Restrições de leitura pública e de armazenamento. |
| 0010_profile_customization.sql | Personalização visual dos perfis. |
| 0011_avatar_frames.sql | Molduras de avatar. |
| 0012_input_validation.sql | Restrições de tamanho, formato e numeração. |
| 0013_reading_scroll_position.sql | Posição de rolagem no histórico de leitura. |
| 0014_comment_likes.sql | Reações em comentários. |
| 0015_chapter_reads.sql | Registro de capítulos lidos. |
| 0016_comment_likes_value.sql | Distinção entre voto positivo e negativo. |
| 0017_subscription_tiers.sql | Categoria de assinatura e proteção contra alterações indevidas. |
| 0018_fix_subscription_tier_trigger.sql | Correção do gatilho de assinatura. |
| 0019_tighten_comment_likes_and_storage_read.sql | Restrições de votos e leitura de arquivos. |
| 0020_series_in_slider.sql | Seleção administrativa de obras para o slide. |
| 0021_obra_ranking_7d.sql | Ranking de obras no período de sete dias. |
| 0022_event_badges.sql | Eventos e conquista de selos. |
| 0023_event_badges_rules.sql | Prazo e quantidade de capítulos exigidos por evento. |
| 0024_perf_indexes.sql | Índices de desempenho. |
| 0025_support_messages.sql | Mensagens de suporte. |
| 0026_tighten_comment_likes_badges_rls.sql | Contagens de votos e restrições de leitura de selos/eventos. |
| 0027_0025_comment_replies.sql | Respostas encadeadas em comentários. |
| 0028_chapter_text_content.sql | Conteúdo textual para capítulos de novels. |
| 0029_cloudinary_settings.sql | Configuração protegida de mídia. |
| 0030_maintenance_settings.sql | Configuração singleton da manutenção. |
| 0031_maintenance_content_gate.sql | Função e políticas restritivas de acesso durante manutenção. |
| 0032_maintenance_media_validation.sql | Validação de arquivos da manutenção. |
| 0033_maintenance_media_read_scope.sql | Leitura administrativa e escopo da mídia ativa de manutenção. |
| 0034_work_requests_and_notifications.sql | Pedidos de obras, atendimento e notificações. |
| 0035_expand_work_request_categories.sql | Categorias adicionais dos pedidos. |
| 0036_homepage_curated_sections.sql | Seleção das colunas da home e métricas AniList persistidas. |
| 0037_maintenance_media_one_gib.sql | Limite de mídia da manutenção de 1 GiB. |
| 0038_maintenance_tus_authorization.sql | Validação do início e conclusão de uploads resumíveis. |
| 0039_chapter_notifications.sql | Avisos de novos capítulos nas obras favoritas. |
| 0040_app_releases_and_custom_genres.sql | Releases Android, armazenamento de APKs e gêneros personalizados. |
| 0041_restrict_app_releases_downloads_to_admins.sql | Acesso direto ao bucket de APKs somente para administradores. O endpoint público assina apenas o APK publicado selecionado, no servidor. |
| 0042_ad_counter.sql | Contagem de capítulos distintos lidos para anúncios intersticiais (1 a cada 5). Tabelas `ad_reads` e `ad_counter`, RLS somente leitura da própria conta, RPCs `ad_state`, `ad_record_read` e `ad_ack_ad`. VIP (admin ou `subscription_tier` ≠ `none`) nunca recebe anúncio. Aplicada no banco em 2026-10-12. |
| 0043_apk_version_settings.sql — não aplicada | Colunas legadas de versão em `maintenance_settings`; antes chamada `0040_apk_version_settings.sql`. Não necessária para o contrato atual baseado em `app_releases`. |

## Duplicidade 0040

Em 2026-10-12, a consulta ao banco não encontrou `min_apk_version`, `latest_apk_version` nem `apk_download_url` em `public.maintenance_settings`. O arquivo legado também não aparece no journal. Foi renomeado, sem modificar seu conteúdo, de `0040_apk_version_settings.sql` para `0043_apk_version_settings.sql`, reservando 0042 para o SQL de anúncios solicitado.

Nenhum SQL foi executado nesta revisão. A consulta comprova ausência das colunas no schema atual, não substitui auditoria completa do histórico. O arquivo 0043 permanece fora do journal e não deve ser aplicado por scripts que executam todos os arquivos indiscriminadamente.

## Ordem de publicação Android 2.17

1. Implantar a correção do site que gera o link de APK com assinatura no servidor.
2. (Concluído) SQL 0042 aplicado e tipos atualizados.
3. Executar os testes reais de atualização e anúncios de `docs/TEST_RUNTIME.md`.
4. Somente após aprovação, publicar o APK 2.17 e exigir a nova versão.

Nenhum APK ou site foi publicado automaticamente.
## Classificação por IA — 2026-10-19

A 0042 já aplicada foi registrada no histórico Drizzle com seu hash, sem reexecutar SQL. A ferramenta aplicou `0043_ai_work_classification.sql` (pausa persistida e trava administrativa) e regenerou os tipos. O arquivo legado `0043_apk_version_settings.sql` permanece fora do journal e não foi executado.

## Títulos duplicados — 2026-10-19

Aplicada `0045_prevent_duplicate_work_titles.sql`: reservas atômicas internas com RLS e acesso somente privilegiado, gatilho em inserção/edição/exclusão e normalização de caixa, acentos latinos e espaços. Alternativos aceitam vírgula, ponto e vírgula, barra vertical e quebra de linha. Todos os tipos compartilham a proteção, inclusive rascunhos e importações. Os três títulos já compartilhados foram preservados; nenhuma obra foi apagada ou mesclada. Atualizações sem mudança nos nomes continuam permitidas. A migration legada de APK permaneceu fora do journal.

## MediocreScan — 2026-11-03

Aplicada `0049_series_mediocre_source.sql`: coluna `source_mediocre_id` com índice único parcial em `series`, para impedir importar a mesma obra da MediocreScan duas vezes.
| 0050_mediocre_token_and_cache.sql | Token MediocreScan salvo pelo painel e cópia das respostas da API (somente servidor). Aplicada 2026-11-03. |
| 0052_mediocre_bypass_and_block.sql | Chave de liberação Cloudflare e pausa de sincronização do MediocreScan. |

## Prateleiras da página inicial — 2026-11-07

Aplicada `0056_series_shelf_indexes.sql` e registrada no histórico Drizzle com o hash do arquivo. Antes, foram conferidos o histórico (56 registros, último 0055) e os índices de `series`: nenhum dos quatro existia.

A migration cria índices parciais em `series` (`WHERE published`) por `created_at`, `views`, `pinned` + `updated_at` e `title`. Sem eles, Lançamentos, Rankings e Atualizados Recentes contavam os capítulos de todas as obras antes de ordenar. Com o cache frio isso levava até 4,9 s, acima do limite de 3 s dos visitantes sem conta, que recebiam erro 500 e prateleiras vazias. Depois da migration: 42 ms, 91 ms e 4 ms (`EXPLAIN ANALYZE` como `anon`).

Só cria índices: nenhum dado, coluna ou política foi alterado, então não houve backup de dados. Reversão: `DROP INDEX` dos quatro índices e remoção do registro no histórico.

## Regras de acesso calculadas uma vez — 2026-11-07

Aplicada `0057_rls_initplan_series_chapters.sql` e registrada no histórico Drizzle com o hash do arquivo. Antes, conferidos o histórico (57 registros, último 0056) e as políticas de `series` e `chapters`.

As políticas `maintenance_restriction` (restritiva, todos os comandos) de `series` e `chapters`, e `staff read all series`/`staff read all chapters` (leitura da equipe), passaram a chamar `maintenance_access_allowed()` e `has_role()` dentro de `(select ...)`. Assim o Postgres calcula cada função uma vez por consulta em vez de uma vez por linha; o resultado não depende da linha. Contar os capítulos para o painel caiu de 5,4 s para 0,4 s (limite de 8 s para contas logadas), e as contagens de capítulos das prateleiras também ficam mais leves.

Nomes, comandos, papéis e tipo das políticas não mudaram; a regra em si é a mesma, só muda quando é calculada. Nenhum dado foi alterado. Conferido depois: visitante, leitor e administrador continuam vendo as mesmas contagens. Reversão: `ALTER POLICY` voltando às expressões sem `(select ...)` e remoção do registro no histórico.

## Leituras sem mexer na data de atualização — 2026-11-07

Aplicada `0058_series_touch_ignore_views.sql` e registrada no histórico Drizzle com o hash do arquivo. Antes, foram conferidos o histórico (58 registros, último 0057) e os gatilhos de `series`.

O gatilho `series_touch` passou a ter `WHEN`: só roda quando muda alguma coluna além de `views` e `updated_at`. Abrir um capítulo soma 1 em `views` e não faz mais a obra subir em "Capítulos novos" e "Atualizadas". Quem grava `updated_at` de propósito (importações, painel) continua igual, e mudar qualquer outro campo continua atualizando a data. Os dois casos foram testados numa transação desfeita antes de aplicar.

Nenhum dado foi alterado. Reversão: recriar `series_touch BEFORE UPDATE ... EXECUTE FUNCTION touch_updated_at()` sem o `WHEN` e remover o registro no histórico.

## Classificação automática das obras — 2026-11-07

Aplicada `0059_auto_classificacao.sql` e registrada no histórico Drizzle com o hash do arquivo. Antes, foram conferidos o histórico (59 registros, último 0058), os gatilhos de `series` e o `ctype` do banco (`en_US.UTF-8`, que faz `\m`/`\M` tratarem letras acentuadas como parte da palavra: "transação" não conta como "transa"). Tudo foi testado numa transação desfeita antes de aplicar: obra nova, troca de sinopse, idade escolhida, volta ao automático, recálculo pelo painel e usuário comum e visitante barrados na função.

Sem IA e sem créditos: regras fixas no próprio banco, então toda forma de criar obra (painel, AniList, novels, app, automação do GitHub, fila e sincronização da MediocreScan) passa por elas.

- `series.age_rating_auto`: `true` quando a idade foi calculada pelas regras, `false` quando alguém escolheu.
- `auto_age_rating(kind, genres, title, alt_titles, synopsis)`: 18 para tipo Hentai, etiquetas adultas (Adulto, Smut, +18, Oral, Creampie, Incesto, MILF…) ou termos explícitos; 16 para Ecchi, Gore, Sangue, Maduro, nudez, drogas ou insinuação sexual ("sexo oposto/masculino/feminino" não conta); 14 para as demais com sinopse ou gênero; vazia sem dados. Nunca L, 10 ou 12: perfis infantis não são liberados sozinhos.
- `auto_genres(title, alt_titles, synopsis)`: até 5 gêneros da lista oficial tirados do título e da sinopse, só para obras sem gênero.
- Gatilho `series_auto_classify` (antes de inserir ou de mudar `kind`, `genres`, `title`, `alt_titles`, `synopsis`, `age_rating` ou `age_rating_auto`): preenche gêneros vazios e calcula a idade. Idade automática acompanha os dados da obra; mudar a idade para um valor fixa a escolha; idade vazia ou `age_rating_auto = true` devolve às regras.
- `series_touch` passa a ignorar também `age_rating`, `age_rating_auto` e `genres`: classificar não faz a obra subir em "Capítulos novos".
- `auto_classify_series(_all)`: só administradores (RPC do painel). Preenche o que falta e, com `_all`, recalcula as idades automáticas. Devolve `{generos, idades}`.

Dados alterados: as 121 obras sem idade receberam idade automática (104 → 14, 2 → 16, 15 → 18) e 37 das 69 obras sem gênero ganharam gêneros (32 não tinham palavra reconhecida). Nenhuma idade escolhida foi tocada e nenhum `updated_at` mudou. Backup antes do preenchimento: `backup.series_0059` (121 linhas com `id`, `age_rating` e `genres` anteriores), num schema fora da API (sem acesso para `anon` e `authenticated`).

Reversão: `DROP TRIGGER series_auto_classify ON series`; restaurar `age_rating` e `genres` de `backup.series_0059` nas obras que ainda estiverem com `age_rating_auto`; recriar `series_touch` como na 0058; apagar as quatro funções; remover a coluna e o registro no histórico.

## Classificação automática: regras ampliadas — 2026-11-07

Aplicada `0060_auto_classificacao_regras.sql` e registrada no histórico Drizzle com o hash do arquivo. Antes, conferido o histórico (60 registros, último 0059) e visto o resultado numa transação desfeita (obra por obra).

Só troca as funções de regra `auto_age_rating` e `auto_genres` (o gatilho e `auto_classify_series` são os da 0059):

- Idade: termos em inglês (porn, rape, sex, nude, drugs…) e sinais de conteúdo maduro que passavam como 14 (roupa íntima, súcubo, motel, desejo carnal, garota de programa…). "opposite sex", "same-sex" e "lustre" não contam.
- Gêneros: palavras em inglês e mais gêneros oficiais (Aventura, Fantasia pela própria palavra, Viagem no Tempo, Super-heróis, Ficção Científica, Crime, Histórico, Gastronomia, Música, Sobrenatural, Mecha). Continuam no máximo 5.

Dados alterados: 23 das 32 obras ainda sem gênero ganharam gêneros, e 5 idades automáticas subiram de 14 para 16 (#TodaysUnderwearReport, Kouiu no Ga Ii, Succubus no Kuni no Hitoosu, Comprado pelo Lorde Demônio antes do Fim, The Story of Making My Bitchy Gal Sister Understand). Distribuição automática: 99 → 14, 7 → 16, 15 → 18. Idades escolhidas e `updated_at` não mudaram. Backup antes: `backup.series_0060` (121 linhas com idade, marca automática e gêneros anteriores).

Reversão: recriar as duas funções como na 0059, restaurar `age_rating` e `genres` de `backup.series_0060` nas obras que ainda estiverem com `age_rating_auto` e remover o registro no histórico.
