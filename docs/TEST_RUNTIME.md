# Aceitação Android 2.17

Não publicar o APK 2.17 antes da correção do site e da migration de anúncios revisada e aplicada. Não ativar manutenção, publicar releases fictícias ou apagar dados para testar.

## Atualização obrigatória

1. Com um APK real e autorizado publicado, abrir `/api/public/version` sem sessão. Esperado: HTTP 200, `Cache-Control: no-store`, versão mais recente e `apk_download_url` preenchido.
2. Abrir `/api/public/version?version_code=<código anterior ao mínimo>`. Esperado: HTTP 200 e `update_required = true`.
3. Repetir com código igual ao mínimo e superior. Esperado: `update_required = false`.
4. Abrir o link assinado sem sessão administrativa. Confirmar download do APK correto; link expira em uma hora. Não registrar o token em relatórios.
5. Código inválido (0, negativo, decimal, texto ou maior que 2147483647): HTTP 400.
6. No painel, desmarcar a atualização obrigatória e informar mínimo superior à versão; ao tentar enviar um APK válido, confirmar mensagem de validação e ausência de upload.
7. Conferir status OK no painel e aviso em falha 503; verificar novamente após publicação/ocultação.

O teste `tests/app-version-response.test.ts` executa o handler com clientes simulados, confirma assinatura pelo cliente privilegiado e proíbe uso do cliente público no Storage. Não substitui download de um APK real.

## Manutenção

- `/api/public/maintenance` sem sessão: HTTP 200, somente projeção pública.
- Upload existente aceita MP4 de até 1 GiB, usa TUS e grava `media_kind = video` e `media_path = backgrounds/<id>.mp4` após envio completo e salvamento administrativo.
- Validar com administrador e vídeo autorizado sem substituir o fundo atual sem confirmação. Aceitação por código/testes não comprova upload real nem autoplay com áudio.

## Anúncios — bloqueado

O anexo `0042_ad_counter.sql` não foi recebido. Não inventar seu conteúdo ou contratos RPC, nem regenerar tipos antes de aplicar o original revisado.

Após recebimento e aplicação: testar funções reais `ad_state`, `ad_record_read` e `ad_ack_ad` com os argumentos do SQL. Verificar cinco leituras sem anúncio, anúncio antes da sexta e da décima primeira, reabertura sem contagem duplicada, falha de carregamento sem registrar leitura, isolamento entre contas e permissões. Regra VIP deve ser conferida no SQL original; não decidir por inferência.

## Estado desta rodada

- Banco consultado em 2026-10-12: nenhuma release; download/atualização obrigatória com release real pendentes.
- Colunas legadas `min_apk_version`, `latest_apk_version`, `apk_download_url` ausentes de `maintenance_settings`.
- Não houve mudança de dados, políticas, vídeo nem publicação do site/APK.