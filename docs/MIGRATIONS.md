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
