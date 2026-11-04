# Atualizar a publicação MediocreScan com os endereços novos do arquivo

Do arquivo enviado, só uso o que serve para encontrar e publicar obras. Login, notificações, leituras, fórum, planos, favoritos e o resto ficam de fora.

## Endereços novos que entram
- **Busca de obras** (`/obras/buscar`): o pedido de um leitor passa a procurar a obra pelo nome direto na API. Hoje só compara com as listas Início/Recentes, porque achávamos que não existia busca.
- **Adicionados recentes** (`/obras/adicionados-recentes`): nova aba no painel MediocreScan com as obras recém-cadastradas, com os mesmos botões de enviar e de fila.
- **Ranking** (`/obras/ranking`): nova aba com as obras mais populares, para enviar ou pôr na fila.
- Os endereços de obra, capítulos e páginas que já usamos continuam iguais.

## Painel
- Na aba Busca, digitar um nome e ver os resultados com o selo de "já publicada" ou "enviar".
- As duas novas abas usam a fila calma de sempre: uma obra por vez e um capítulo por minuto.

## Teste
1. Antes de mexer no código, chamar cada endereço novo só para leitura, para descobrir os parâmetros certos (nome do campo de busca, paginação, formato) e o formato da resposta.
2. Depois de implementar, rodar os testes e conferir o painel no navegador com a sua conta admin: busca, as duas abas novas e colocar uma obra na fila (sem publicar em massa).
3. Se a MediocreScan ainda estiver bloqueando o servidor (IP bloqueado), aviso e paro sem insistir.

## Detalhes técnicos
- `src/lib/mediocre-api.ts`: novas operações `buscar`, `adicionados_recentes` e `ranking` na lista permitida, com caminho fixo, parâmetros validados (texto da busca limitado e sanitizado, página numérica) e nome de cache próprio.
- `src/lib/mediocre-import.server.ts`: casamento de pedidos usa primeiro `buscar` e mantém o título exato normalizado com resultado único; as listas antigas ficam como reserva.
- `src/routes/_authenticated/admin/mediocre.tsx`: abas e campo de busca reaproveitando os cartões existentes.
- Testes em `tests/mediocre-api.test.ts` para os caminhos e a validação; atualizar a regra do MediocreScan em `AGENTS.md` (agora a API tem busca).
