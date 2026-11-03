# Por que parou de publicar

## O que os registros do servidor mostram
Desde cerca de 19:10, toda chamada à MediocreScan volta com a mesma resposta da própria API: **"IP bloqueado." (403)**.
- O token não é o problema: a API não reclama do token, ela bloqueou o endereço do servidor do Better Mangá.
- O bloqueio veio logo depois de uma rajada de pedidos. Às 19:00 houve dezenas de pedidos no mesmo segundo, com várias respostas "muitos pedidos" (429), e às 19:10 vieram uns 20 pedidos seguidos ao publicar. A API classificou isso como abuso e bloqueou o IP.
- Mesmo bloqueado, o site continua tentando: a cada clique ou atualização automática chegam mais pedidos, o que pode prolongar o bloqueio.

O site não tem como contornar um IP bloqueado. Quem libera é a MediocreScan.

## O que vou mudar
1. **Detectar "IP bloqueado"** e, assim que ele aparecer, pausar **todas** as chamadas à API por 30 minutos. Isso vale para o painel, a publicação, a vitrine e a atualização automática. Durante a pausa nenhum pedido sai, e o site usa as cópias já salvas.
2. **"Publicar todas" para no primeiro bloqueio**, em vez de seguir obra por obra recebendo erro, e avisa quantas obras ficaram por fazer.
3. **Aviso claro no painel**: "A MediocreScan bloqueou o IP do servidor. Volta a tentar às HH:MM." O aviso vem com um botão "Tentar agora", que faz um único teste.
4. **Menos pedidos por publicação**: os capítulos de uma obra deixam de ser buscados em grupos de 4 e passam a ser buscados um por vez, com pausa maior (cerca de 1 s) entre pedidos durante a publicação em lote.

## O que você precisa fazer
Como a API é sua, peça à MediocreScan para liberar o servidor do Better Mangá. Pode ser liberando o IP ou aceitando a chave de liberação `X-BetterManga-Key`, que já pode ser salva no painel. Sem essa liberação, o bloqueio pode voltar a qualquer volume maior de publicação.

## Detalhes técnicos
- `src/lib/mediocre-api.server.ts`: identificar o 403 com `message` "IP bloqueado" como `IP_BLOCKED` e gravar `mediocre_settings.blocked_until = now()+30min`. `mediocreGet` lê `blocked_until` (que vem junto com o token, sem consulta extra) e retorna `IP_BLOCKED` sem fazer o fetch enquanto a pausa estiver ativa. `API_GAP_MS` sobe para 1000 em importações.
- `src/lib/mediocre-import.server.ts`: os capítulos passam a ser importados em sequência, e o erro `IP_BLOCKED` é propagado para interromper o lote.
- `src/lib/mediocre-api.functions.ts`: o status do token passa a informar `blockedUntil`, e "Testar conexão" limpa a pausa e faz um único pedido.
- `src/routes/_authenticated/admin/mediocre.tsx`: banner de bloqueio com horário, botão "Tentar agora" e "Publicar todas" interrompido ao receber `IP_BLOCKED`.
- Teste: a mensagem "IP bloqueado" é classificada como bloqueio.
