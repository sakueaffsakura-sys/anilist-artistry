# Corrigir "A API apresentou um erro interno" (MediocreScan)

## Causa encontrada
O endereço antigo da API (back2.mediocrescan.com) saiu do ar: não responde mais, e o servidor do site recebe erro 530 em todas as chamadas, incluindo a fila e a sincronização automática. A chave nova está certa: no endereço novo, api.mediocretoons.net, a mesma chamada responde 200 com obras.

## O que será feito
1. Trocar o endereço da API pelo novo (api.mediocretoons.net) nas consultas do servidor e nos links de imagens de obras que usam o endereço antigo (/media/obras).
2. Adicionar um reserva automático: se um endereço falhar com 530 ou ficar sem resposta, tentar o outro antes de mostrar erro. Assim a próxima mudança de endereço não derruba tudo.
3. Melhorar a mensagem de erro 530: em vez de "erro interno", mostrar "servidor da MediocreScan fora do ar/mudou de endereço".
4. Testar até voltar:
   - chamar /obras/home e recentes pelo servidor do site e confirmar 200;
   - "Testar conexão" no painel;
   - acompanhar os registros da fila e da sincronização no próximo ciclo para confirmar que pararam os 530.
5. Rodar os testes da MediocreScan e atualizar a lista de endereços permitidos nos testes.

## Detalhes técnicos
- `src/lib/mediocre-api.server.ts`: `API` passa a ser uma lista `[api.mediocretoons.net, back2.mediocrescan.com]`, com fallback em 530/erro de rede; o espaçamento entre chamadas e a pausa em bloqueio continuam como estão.
- `src/lib/mediocre-api.ts`: `MEDIA` passa para o host novo. O CDN (cdn.mediocrescan.com) continua igual: ele está no ar, porque responde 404 na raiz.
- Atualizar a regra MediocreScan em `src/lib/AGENTS.md` com o host novo.
- Nada será publicado automaticamente.
