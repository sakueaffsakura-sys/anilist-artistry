# Duplicadas (app Android)

App separado do Estúdio que só procura **obras duplicadas na MediocreScan**. Não envia nada ao site.

- **Token:** o dono cola o token da API na tela (fica só no celular, em `localStorage`, nunca no repositório).
  "Testar token" lê a primeira página das atualizadas.
- **Leitura do catálogo** (`www/api.js`): 1 pedido de cada vez, intervalo ajustável (padrão 2,5 s); recusa ou
  queda espera 1, 2, 5, 10 e 15 min; 401 para na hora. Ordem: busca sem texto (`/obras/buscar?string=&pagina=N`,
  se a API devolver páginas com total), lista de adicionadas (`?offset=` de 20 em 20) e de atualizadas (de 30 em 30),
  parando quando a página vem vazia ou só repete obras. Opcional: busca por cada letra e número. O catálogo fica no
  IndexedDB e a leitura continua de onde parou. "Conferir as suspeitas" lê `/obras/{id}` só das obras dos grupos
  (nomes alternativos, sinopse, formato, capítulos).
- **Detector** (`www/dup.js`, sem tela, testável em Node): compara cada obra só com as que dividem uma palavra-chave
  pouco comum, a mesma capa ou o mesmo começo de título. Sinais: título igual (com/sem acentos, artigos e palavras de
  formato como manhwa, novel, colorido, IA), nome alternativo igual, mesmas palavras em outra ordem, erro de
  digitação, um título começando com o outro, palavras-chave raras em comum (peso por raridade), mesma capa, sinopse
  igual/parecida e mesmo número de capítulos. Números diferentes no título (2, II, temporada 3) e formatos diferentes
  (novel × quadrinho) baixam a nota. Notas: 90+ certeza alta, 70+ provável, 55+ talvez. "Não é duplicada" guarda os
  pares dispensados no celular.
- **Telas:** Análise (token, catálogo, procurar, conferir, ajustes), Duplicadas (grupos com motivos, filtros, copiar
  IDs e relatório) e Catálogo (busca por palavra-chave em todas as obras lidas).
- **Build:** `.github/workflows/duplicadas-apk.yml` (Capacitor 7, HTTP nativo via `CapacitorHttp`, tela acesa) publica
  `duplicadas.apk` na release `duplicadas-apk`, assinado com a mesma chave do Estúdio.
