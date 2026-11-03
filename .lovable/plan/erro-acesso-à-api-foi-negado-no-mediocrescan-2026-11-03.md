# Erro "Acesso à API foi negado" no MediocreScan

## O que descobri (testado agora)
- O token que você mandou **funciona**: testei direto daqui e a API devolveu as obras, os capítulos e as páginas normalmente.
- Esse mesmo token **já está salvo** no painel (salvo às 15:18).
- Mesmo assim, o site publicado recebe **"acesso negado" em 100% das chamadas** na última hora (86 tentativas), inclusive depois de salvar o token novo.
- Conclusão: **o problema não é o token nem o código do Better Mangá**. A proteção do MediocreScan (Cloudflare) passou a bloquear os pedidos que vêm do servidor onde o Better Mangá está hospedado. Isso explica o "começou depois de uma atualização": a mudança foi do lado do MediocreScan.
- Por isso as obras importadas hoje (ex.: Auto-Admiração, Como me atrevo, você) ficaram com **0 capítulos**.
- Fazer pelo navegador também não dá: o MediocreScan não permite chamadas vindas de outros sites.

## Como resolver de verdade (do lado do MediocreScan)
Como a API é sua, no painel do Cloudflare do MediocreScan, para o endereço da API (back2):
- Liberar o acesso de servidores (desligar "Bot Fight Mode" / regra de bloqueio para a API), **ou**
- Criar uma regra que deixe passar pedidos com um cabeçalho secreto que o Better Mangá vai enviar.

## O que vou mudar no site
1. **Cabeçalho secreto opcional:** campo no "Configuração do token" para guardar uma chave de liberação; o site envia ela em toda chamada, para você criar a regra no Cloudflare.
2. **Mensagem clara:** quando o bloqueio for do Cloudflare (e não token vencido), o painel avisa "MediocreScan bloqueou o servidor do site" em vez de "token inválido".
3. **Pausar atualização automática** quando houver bloqueio, tentando de novo só a cada 1 hora, para não gerar centenas de pedidos negados.
4. **Botão "Testar conexão"** no painel, que mostra se o token e o acesso estão OK.
5. **Completar capítulos faltando:** quando o acesso voltar, as obras que ficaram com 0 capítulos são completadas pela atualização automática.

## Aviso de segurança
Os tokens que você colou aqui ficaram visíveis no chat. Depois que tudo funcionar, gere um token novo e cole só na caixa do painel.

## Detalhes técnicos
- Logs do Worker: `[mediocre] api 403` em todas as chamadas; sandbox com o mesmo token: 200 em `/obras/home`, `/obras/20791`, `/capitulos/591398` e CDN JSON. OPTIONS sem cabeçalhos CORS.
- `mediocreGet`: distinguir 403 com corpo HTML/`cf-ray` (bloqueio WAF) de 401 JSON; novo código `BLOCKED`.
- `mediocre_settings`: coluna `bypass_header` (service-role only), enviada como `X-BetterManga-Key`.
- Sync job: guardar `blocked_until` e sair cedo enquanto bloqueado; priorizar séries com `source_mediocre_id` e 0 capítulos.
