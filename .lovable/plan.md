# MediocreScan: busca por nome, novas listas e pedidos por nome

## O que foi confirmado na API (testes só de leitura)
- `/obras/buscar?string=NOME` pesquisa de verdade por nome (ex.: "pico" retorna 10 obras). Outros nomes de parâmetro são ignorados.
- `/obras/adicionados-recentes` lista as obras adicionadas há pouco, 20 por vez, e pagina com `offset`.
- `/obras/ranking` traz o ranking (24 obras).

## O que será feito
1. **Pedidos adicionam obras por nome:** ao fazer um pedido, o site pesquisa o título na MediocreScan pela busca nova, em vez de olhar só a home e as recentes. Se houver exatamente uma obra com o mesmo nome, ela entra na fila de publicação calma, que já existe. Se houver várias parecidas ou nenhuma, o pedido fica pendente como hoje.
2. **Painel MediocreScan, aba "Buscar obra":** campo para pesquisar por nome, com resultados em cartões que já mostram o check (já publicada) ou o X azul (enviar para a fila).
3. **Novas abas no painel:** "Adicionadas recentes" com páginas anterior/próxima e "Ranking", com os mesmos botões de enviar e publicar todas.
4. A detecção de obras já publicadas, a fila de uma obra e um capítulo por vez e as pausas em bloqueio continuam iguais.
5. Testes: novas regras de caminhos (busca limitada a 80 caracteres e só pelos parâmetros permitidos), mais um teste de correspondência exata de título nos pedidos. Depois, testar busca, abas e um pedido real por nome, sem publicar nada além do pedido testado.

## Detalhes técnicos
- `src/lib/mediocre-api.ts`: novas operações `buscar` (query `string`), `adicionados` (offset em múltiplos de 20) e `ranking` em `MEDIOCRE_OPERATIONS`/`mediocrePath`, todas com caminho fixo na lista de permitidos. As três também valem para o público, sem token exposto.
- `src/lib/mediocre-import.server.ts`: a busca de candidatos chama `/obras/buscar?string=` primeiro e as listas antigas ficam de reserva; só aceita uma correspondência exata após `titleKey`.
- `src/routes/_authenticated/admin/mediocre.tsx` + `MediocreViews.tsx`: novas abas e campo de busca com espera de digitação.
- Atualizar a regra MediocreScan em `AGENTS.md` (agora existe busca por nome).
