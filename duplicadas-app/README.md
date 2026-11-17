# Duplicadas (app Android)

App separado do Estúdio que só procura **obras duplicadas na MediocreScan**. Não envia nada ao site.

- **Pedidos (1.3+):** no celular passam pelo plugin nativo `DupHttp` (`android-src/DupHttpPlugin.java`, o mesmo
  caminho do Estúdio: HttpURLConnection sem o User-Agent do navegador, só para `https://api.mediocretoons.net/`). A
  1.2 usava o `CapacitorHttp` e o dono relatou que não puxava nada. Se o plugin faltar, cai no `CapacitorHttp` e, no
  navegador, no `fetch`. Ajustes → "Ver diagnóstico" mostra os últimos 20 pedidos (status, caminho, tempo, via e o
  começo da resposta; nunca o token) e "Copiar diagnóstico" copia para mandar.
- **Procurar sozinho (padrão ligado):** ao abrir o app, ao salvar o token e a cada 6 h com o app aberto: continua a
  leitura parada (ou relê tudo a cada 3 dias), senão só lê o começo das listas até repetir (`readRecent`); se a busca
  geral não serviu, completa pela busca por letra uma vez por leitura; procura as duplicadas e confere até 400
  suspeitas na API.
- **Token:** o dono cola o token da API na tela (fica só no celular, em `localStorage`, nunca no repositório).
  "Testar token" lê a primeira página das atualizadas.
- **Leitura do catálogo** (`www/api.js`): 1 pedido de cada vez, intervalo ajustável (padrão 2,5 s); recusa ou
  queda espera 1, 2, 5, 10 e 15 min; 401 para na hora. Ordem: busca sem texto (`/obras/buscar?string=&pagina=N`,
  se a API devolver páginas com total), lista de adicionadas (`?offset=` de 20 em 20) e de atualizadas (de 30 em 30),
  parando quando a página vem vazia ou só repete obras. Na página 2 de cada lista descobre como a API pagina
  (`offset`, `pagina`, `page`, `offset+limit`, `skip`) e guarda em `cat.pagers`. Resposta em formato desconhecido:
  procura a maior lista de objetos com `obr_id`/`obr_nome` em qualquer lugar. Busca por cada letra e número; se a
  API exigir 2 letras, usa pares comuns. O catálogo fica no
  IndexedDB e a leitura continua de onde parou. "Conferir as suspeitas" lê `/obras/{id}` só das obras dos grupos
  (nomes alternativos, sinopse, formato, capítulos).
- **Detector** (`www/dup.js`, sem tela, testável em Node): compara cada obra só com as que dividem uma palavra-chave
  pouco comum, a mesma capa ou o mesmo começo de título. Sinais: título igual (com/sem acentos, artigos e palavras de
  formato como manhwa, novel, colorido, IA), nome alternativo igual, mesmas palavras em outra ordem, erro de
  digitação, um título começando com o outro, palavras-chave raras em comum (peso por raridade), mesma capa, sinopse
  igual/parecida e mesmo número de capítulos. Números diferentes no título (2, II, temporada 3) e formatos diferentes
  (novel × quadrinho) baixam a nota. Notas: 90+ certeza alta, 70+ provável, 55+ talvez. "Não é duplicada" guarda os
  pares dispensados no celular.
- **Links (1.6+, pedido do dono):** cada obra mostra o link `https://mediocrescan.com/obra/{id}` (toque abre no
  navegador); "Copiar links" e o relatório levam título + link; os filtros aceitam um link colado.
- **Telas:** Análise (token, catálogo, procurar, conferir, ajustes), Duplicadas (grupos com motivos, filtros, copiar
  IDs e relatório) e Catálogo (busca por palavra-chave em todas as obras lidas).
- **Build:** `.github/workflows/duplicadas-apk.yml` (Capacitor 7, HTTP nativo via `CapacitorHttp`, tela acesa) publica
  `duplicadas.apk` na release `duplicadas-apk`, assinado com a mesma chave do Estúdio.
