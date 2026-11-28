# Duplicadas (app Android)

App separado do Estúdio que procura **obras duplicadas na MediocreScan** e aponta **sinopses zuadas e capas
quebradas** (aba Problemas). Não envia nada ao site.

- **Procura em segundo plano (nov. 2026, pedido do dono: "continuar rodando mesmo após fechar"):** no celular o
  trabalho demorado roda no motor nativo `android-src/DupEngine.java` (Java puro, testado por
  `test/DupEngineTest.java` no GitHub antes do build), dentro do serviço em primeiro plano `DupBgService`
  ("uso especial", notificação com andamento e botão Parar, trava de energia e de Wi-Fi). Ele lê o catálogo
  (completo ou só as obras novas a cada 6 h), os detalhes de todas as obras e confere as capas, e continua com o app
  fechado; o vigia `DupBgWatch` (JobScheduler, 15 min com internet) religa ou acorda, e `DupBgBoot` religa depois de
  reiniciar o celular ou atualizar o app. O app manda um plano (`bgStart`: token, ritmo, filas com as suspeitas e
  quase suspeitas primeiro, títulos para o aviso de duplicada nova) e junta os resultados numerados que o motor
  guardou em `files/dupbg/res-*.jsonl` (`bgPull` a cada 2–5 s com o app aberto; guarda o catálogo e confirma com
  `bgAck` no máximo a cada 30 s, ao ir para trás e ao terminar). A procura de duplicadas e de problemas roda no app.
  Eficiência: ritmo da API que se ajusta (começa no "Começar com", acelera 0,1 s a cada 25 acertos até o "Acelerar
  até"; recusa = mais devagar por 24 h e espera 1, 2, 5, 10, 15 min, depois 30 min, sem desistir; sem internet
  espera e tenta de novo), capas em paralelo (1–6 linhas, 0,25 s entre começos, pausa geral se o servidor de imagens
  pedir calma) ao mesmo tempo que os detalhes, listas de capítulos trocadas pelo tamanho (`__len_capitulos`).
  Avisos: "Conferência completa" e "Possível duplicada nova" (obra nova com o mesmo título normalizado). No
  navegador (testes) a tela lê sozinha, como antes.

- **Pedidos (1.3+):** no celular passam pelo plugin nativo `DupHttp` (`android-src/DupHttpPlugin.java`, o mesmo
  caminho do Estúdio: HttpURLConnection sem o User-Agent do navegador, só para `https://api.mediocretoons.net/`). A
  1.2 usava o `CapacitorHttp` e o dono relatou que não puxava nada. Se o plugin faltar, cai no `CapacitorHttp` e, no
  navegador, no `fetch`. Ajustes → "Ver diagnóstico" mostra os últimos 20 pedidos (status, caminho, tempo, via e o
  começo da resposta; nunca o token) e "Copiar diagnóstico" copia para mandar.
- **Procurar sozinho (padrão ligado, em 4 etapas):** ao abrir o app, ao salvar o token, quando a internet
  volta e no horário marcado (`dup-auto-next`: 15 min se a leitura parou no meio ou faltam capas ou detalhes, senão
  6 h; 30 min depois de um erro). 1) Catálogo: continua a leitura parada (ou relê tudo a cada 3 dias), senão só lê o começo das
  listas até repetir (`readRecent`); se a busca geral não serviu, completa pela busca por letra. 2) Suspeitas: lê os
  detalhes de até 400 obras dos grupos. 3) Capas: confere as capas das suspeitas e mais 300 de todas por procura (as
  mais novas primeiro; "Capas por procura"). O plugin `DupHttp.cover` baixa a imagem (só da MediocreScan, sem o token,
  com Referer do site, até 8 MB), abre no Android e devolve só status, tipo, bytes, largura, altura, variação de
  brilho e o dHash de 64 bits (`coverInfo`, `coverHash`); 0,8 s entre capas; sem resposta tenta de novo nas próximas
  procuras e só na 3ª vez registra. 4) Detalhes: sinopse, nomes alternativos e autores de mais 250 obras ainda sem
  detalhes (as mais novas primeiro) até completar o catálogo. Os interruptores ficam em Ajustes → Automação. Cada procura entra no Histórico (`dup-history`); grupos ainda não vistos aparecem em "Novas"
  (`dup-seen`).
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
  digitação, um título começando com o outro, palavras-chave raras em comum (peso por raridade), mesmo arquivo de
  capa, mesma imagem de capa (dHash a até 5 bits; 10 = "muito parecida"; hash repetido em mais de 3 obras é capa
  padrão e não conta), sinopse igual/quase igual (trechos de 3 palavras e palavras em comum; obras com 3+ palavras
  raras da sinopse em comum também são comparadas) e número de capítulos parecido. Números diferentes no título (2,
  II, temporada 3) e formatos diferentes (novel × quadrinho) baixam a nota. Notas: 90+ certeza alta, 70+ provável,
  55+ talvez. Cada grupo sugere qual manter (`keepOf`: mais capítulos, depois a sem problema grave de capa ou
  sinopse, depois a mais antiga no site). "Não é duplicada" guarda os pares dispensados no celular.
- **Precisão (pedido do dono):** baixam a nota: formatos diferentes (−35, novel × quadrinho fica em "talvez"), marca
  de história paralela/especial ou de outra língua num título só (−20), sinopses longas na mesma língua sem quase
  nada em comum (−15 com o mesmo título, −25 com título parecido), autores sem nenhuma palavra em comum (−15 se o
  título não for o mesmo; só aviso se for) e capas bem diferentes quando só o título é parecido (−8). Mesmo autor
  soma 3. Sinopse repetida em 3+ obras (texto padrão) e capa vazia, lisa ou padrão não contam como sinal. Grupos só
  juntam pares de 70+; um par "talvez" vira grupo à parte (um por obra de fora), sem encadear grupos.
- **Problemas** (`findProblems` em `www/dup.js`): sinopse (só das obras com detalhes ou com sinopse na lista):
  vazia, de enfeite ("sem sinopse", "em breve"…), só símbolos, igual ao título, letras quebradas (Ã©, â€™, n?o),
  restos de código (entidades escapadas, BBCode; tags HTML só se menos de 20 % das sinopses usam HTML), link ou
  propaganda, créditos da scan, outra língua (inglês, espanhol, coreano, japonês, chinês; o título não conta), curta,
  cortada no meio, frase repetida, toda em maiúsculas, muitos símbolos, igual à de outra obra (sem ser cópia da mesma
  obra, continuação ou adaptação) ou texto padrão em 3+ obras. Capa: sem capa, não abre (4xx/5xx), sem resposta
  (3 tentativas), devolve página em vez de imagem, arquivo estragado, vazia (≤ 16 px ou uma cor só), pequena
  (< 150×200), quase sem imagem, deitada (banner), enorme (> 8 MB), fora da MediocreScan e imagem padrão em 5+ obras
  de títulos diferentes. Para não acusar à toa: se 60 %+ das capas conferidas falham, é bloqueio do servidor e vira
  aviso; se a maioria das obras com detalhes vem sem sinopse, "Sem sinopse" não é acusado. "Conferir de novo" relê
  a obra; "Ignorar" guarda no celular (`dup-ok`).
- **Sinopse na análise (nov. 2026):** além do texto igual ou parecido, os nomes próprios raros da sinopse
  (personagens, lugares; maiúscula no meio da frase, fora do título, usados por poucas obras) são sinal e
  candidato: 3+ em comum = 88, 2 = 76, vale entre línguas ("Sung Jinwoo" em português e em inglês). Várias pessoas
  raras em cada sinopse e nenhuma em comum = "Personagens diferentes" (−15/−20). Cada par traz `parts` (como a nota
  foi feita) e `desc` (trechos, palavras e nomes em comum); `near` lista quase suspeitas (35+ sem detalhes) para
  ler primeiro.
- **Blocos (nov. 2026, pedido do dono):** cada grupo é um bloco com caixinha de seleção; com algum selecionado
  aparece a barra "Copiar" (links de todas, só as para apagar, ou relatório) e "Deletar" (com confirmação). Os
  deletados saem da lista e não voltam (`dup-deleted`, os pares entram como dispensados) e ficam no filtro
  "Apagados", de onde dá para restaurar ou copiar. Nada é apagado no site.
- **Links (1.6+, pedido do dono):** cada obra mostra o link `https://mediocrescan.com/obra/{id}` (toque abre no
  navegador); "Copiar links" e o relatório levam título + link; os filtros aceitam um link colado.
- **Tema preto e papel de parede (1.8+, pedido do dono):** fundo preto (também nas barras do Android, via
  `styles.xml` no `patch-android.mjs`), cartões translúcidos. Cartão "Papel de parede": escolhe uma imagem da galeria
  (`<input type="file">`), reduz para no máximo 1800 px em JPEG e guarda no IndexedDB (`wallpaper`); "Escurecer"
  (0–90 %) e "Desfocar" (0–20 px) ficam nos ajustes (`wpDim`, `wpBlur`).
- **Telas:** navegação embaixo. Painel (token no primeiro uso, cartão da procura com as faixas Catálogo, Detalhes e
  sinopses, Capas, ritmo e previsão, aviso para liberar a bateria e os avisos, números que contam, níveis, novas
  desde a última vez, histórico e ferramentas manuais), Duplicadas (blocos com a nota em anel, 2 obras lado a
  lado com capa, link e "Manter"; 3+ uma por linha; motivos em etiquetas; "Ver detalhes da nota e as sinopses" com
  a conta da nota e as duas sinopses com as palavras e nomes em comum marcados; filtros Todas/Novas/níveis/Apagados;
  ordenar por nota, novas, obras ou capítulos; seleção, copiar e deletar), Problemas (filtros Todos/Graves/Sinopse/Capa, trecho da
  sinopse, medidas da capa, conferir de novo, ignorar, relatório), Catálogo (busca por palavra-chave, com etiqueta de
  duplicada e de problema) e Ajustes (token, automação, análise, papel de parede, diagnóstico e dados).
- **Animações:** as chapas do nome "respiram" fora de registro enquanto procura; o painel aparece em sequência ao
  abrir; troca de aba desliza; listas entram em cascata; números contam; a nota enche o anel; faixa ativa com
  brilho correndo; seleção, barra de ações, folha de escolhas e avisos deslizam; bloco deletado sai de lado. Tudo
  desliga com "reduzir movimento".
- **Build:** `.github/workflows/duplicadas-apk.yml` (Capacitor 7, plugin `DupHttp`, tela acesa) publica
  `duplicadas.apk` na release `duplicadas-apk`, assinado com a mesma chave do Estúdio.
