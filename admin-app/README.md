# Estúdio Better Mangá (APK de administração)

App Android para publicar no Better Mangá as obras da MediocreScan. O celular busca na API (pelo IP dele,
que não está bloqueado) e envia ao site pelo endpoint `/api/public/mediocre-ingest`.

- **Entrar:** e-mail e senha da conta de administrador do site, ou um código de envio gerado no painel
  (admin/mediocre → "Gerar código da automação"), para quem entra no site com o Google.
- **Chave da MediocreScan:** colada no app; fica só no celular e vai somente para a MediocreScan.
- **Pedidos à API:** durante o envio, no máximo 1 pedido por minuto a `api.mediocretoons.net` (as páginas no
  CDN não contam). Quando a lista de capítulos da obra já traz o UUID, o app vai direto às páginas sem pedir o
  capítulo à API.
- **Ritmo:** uma obra por vez até o último capítulo, 5 capítulos por envio, no máximo 5 capítulos a cada 1 min 12 s
  contados do começo do lote (quando buscar o lote pela API já levou mais que isso, o próximo sai sem espera extra;
  antes contava do fim do lote e perdia ~20% do tempo).
  Quando a MediocreScan recusa (403/429), espera 1, 2, 5, 10 e depois 15 min entre tentativas (até 12 seguidas).
  Falha de conexão é tentada de novo com esperas crescentes (8 vezes, ~22 min) em vez de pular o capítulo; cada
  pedido tem tempo máximo (45 s na MediocreScan, 2 min no site). Uma página recusada isolada no CDN fica para
  depois; várias seguidas contam como bloqueio. Parar no meio guarda o ponto na fila do site, e a obra é retomada primeiro.
- **Motor nativo (no celular):** o envio roda no serviço em primeiro plano do Android (`android-src/EnvioEngine.java`,
  mesma lógica do `www/engine.js`), não na tela. Continua com o app minimizado, com a tela apagada e mesmo se o
  Android fechar a tela do app. Mantém CPU e Wi-Fi acordados, mostra contagem regressiva na notificação e avisa no
  fim. Se o Android encerrar o processo, o serviço é recriado e continua o trabalho guardado; ao abrir o app, a tela
  busca os eventos que perdeu (número de sequência) e, se o envio foi cortado há menos de 15 min, continua sozinho.
  Enquanto envia, os pedidos da tela à API entram na mesma fila de 1 por minuto. A sessão renovada pelo serviço volta
  para a tela (o token de renovação muda a cada uso). No Android 14+ o serviço é de "uso especial" (sem o limite de
  6 h por dia da sincronização de dados do Android 15). No navegador, o `engine.js` envia pela tela.

- **Painel e modo automático:** a primeira aba (Painel) mostra o cartão do modo automático, os números da fila,
  dos pedidos e dos capítulos enviados hoje (contados no celular), as próximas obras da fila e a atividade recente.
  Ligado, o automático (`EnvioEngine.runAuto`, trabalho `{type:"auto"}` no serviço) fica rodando e decide sozinho:
  fila do site (pedidos de leitores na frente; a fila é relida depois de cada obra) → obras do site que aparecem em
  `/obras/atualizadas-recentes` com novidade desde a última olhada → até 4 obras por ciclo das que estão há mais
  tempo sem conferir. A cada 20 min também liga pedidos de leitores quando só uma obra da busca tem exatamente o mesmo
  título (até 2 buscas por ciclo) e, se marcado, põe na fila obras novas das listas (até 20). Sem nada para enviar,
  espera; obras escolhidas no app enquanto ele roda entram na fila e o acordam (`wakeJob`). Sem internet, site em
  manutenção ou recusas seguidas da MediocreScan, espera 15 min e tenta de novo (`Retryable`) em vez de desligar;
  chave recusada ou sessão encerrada desligam. Uma obra que falha 2 vezes fica para depois. Se o Android fechar o
  app com o automático ligado, ele volta sozinho (serviço recriado ou ao abrir o app).
- **Visual:** mesma identidade do site (tinta, papel, laranja; Sora nos títulos e Manrope no texto, carregadas
  do Google Fonts, com fonte do sistema sem internet). O cartão do automático é um quadro de mangá (borda de papel,
  sombra laranja, retícula no canto) com a obra da vez (capa, de onde veio: fila/pedido, atualizada ou conferência,
  barra, "faltam ~N min" pelo ritmo medido) e a etapa do ciclo marcada. O Painel mostra fila, pedidos, capítulos de
  hoje e um gráfico dos últimos 7 dias (contados no celular em `bm-estudio-dias`). A obra mostra fatos (formato,
  status, capítulos, último, ID) e a barra de capítulos no site; a fila é numerada; "No site" mostra capítulos,
  leituras e nota; pedidos mostram quantos leitores pediram e as observações como balões de fala.
- **Automático, mais esperto:** com "Obras novas primeiro com 10 capítulos" (ligado por padrão), obras novas da fila
  recebem os primeiros 10 capítulos e voltam para o fim da fila (`finish` com `defer`), para o catálogo crescer
  rápido; pedidas por leitores e obras pela metade vão inteiras; quando todas as novas têm os 10, o resto vem na
  ordem da fila. Com fila grande, alterna uma obra da fila e uma obra do site atualizada na MediocreScan. Condições
  (Ajustes): só no Wi-Fi, só carregando; sempre espera sem internet ou com bateria abaixo de 15% fora do carregador
  (`auto-hold`), entre lotes e entre obras, sem desligar. Obras que falham 2 vezes ficam 6 h de lado. Mudar opção com
  ele ligado religa sozinho. `EnvioBoot` religa o automático guardado quando o celular reinicia ou o APK é atualizado.
- **Sempre ligado (1.45):** o automático vem ligado e só desliga se o admin desligar (Painel ou Parar da notificação).
  Erro que precisa do admin (chave recusada, sessão encerrada) vira espera "Precisa de você" com nova tentativa a cada
  30 min; o trabalho "auto" só sai do celular quando o admin desliga. `EnvioWatch` (JobScheduler, a cada 15 min, só com
  internet, persistente) religa o serviço se o Android o encerrou; `EnvioBoot` também usa o vigia.
- **Obras do site atualizadas:** a lista `/obras/atualizadas-recentes` é olhada a cada 10 min (obras novas e pedidos a
  cada 30 min); `check` devolve `latest` (último capítulo publicado de cada obra no site) e a obra só é conferida se a
  MediocreScan mostra capítulo depois desse (sem números, usa a assinatura da lista). Ordem: pedidas/pela metade →
  atualizadas → primeira passada das novas → resto → conferência.
- **Revisão das obras do site (1.50, pedida pelo dono):** ao ligar o automático, antes da fila, ele lista as obras do
  site vindas da MediocreScan (`site_list`, filtro "mediocre", páginas de 30), tira as que estão na fila (`check.queued`;
  a fila cuida delas logo depois) e confere cada uma com `sendWork` (1 pedido à API por obra; manda os capítulos que
  faltam). Ordem: as que ainda saem antes das "Completo", as mais lidas primeiro; obra que a lista "atualizadas" já
  mostrou com capítulo novo passa na frente. O andamento fica guardado no celular (`EnvioStore` "review") a cada obra:
  revisão cortada (app fechado, celular desligado, opção mudada) continua de onde parou se começou há menos de 12 h.
  Uma revisão terminada há menos de 1 h não se repete ao religar; abrir o app com o automático rodando pede uma
  (`Estudio.reviewJob`, a tela pede no máximo a cada 30 min) e o botão "Revisar obras" do Painel força. Ligado direto,
  revisa de novo a cada 12 h, e a conferência de rotina fica parada nas 6 h depois de uma revisão. Eventos:
  `review-scan`, `review-start` {total, done, queued, resumed}, `review-progress` {done, total, news, added},
  `review-done` {checked, news, added, failed}, `review-skip`; `auto-pick` traz `review`/`reviewTotal`. Na revisão,
  obra conferida sem capítulo novo não entra na atividade nem em "Hoje". Opção em Ajustes: "Revisar as obras do site
  ao ligar" (`review`, ligada por padrão).
- **Ritmo (Ajustes → Velocidade), escolhido pelo dono:** "Ciclo de 15" (padrão desde a 1.52, pedido em 16/11) pega 15
  capítulos de uma vez, manda ao site e pausa 2 min (contados do fim do lote). Os quatro números (capítulos por lote até
  30, espera entre lotes, lotes por ciclo, pausa) são editáveis e vão na configuração do serviço (`config.cycle`; a tela
  migra quem tinha lotes de 5 com `cycle.v` 2); o ciclo continua entre obras e depois de reabrir. O site recebe no máximo
  5 capítulos por pedido (`INGEST_MAX_CHAPTERS`), então o lote vai ao site em pedidos de 5, um logo depois do outro
  (`postChapters`). Dentro do lote os pedidos à API saem a cada 2 s; fora do lote (obra, listas), a cada 10 s. As
  páginas de cada capítulo (CDN) baixam numa thread à parte (`fetchGroup`, conexão própria `cdnHttp`) enquanto o
  próximo capítulo pede à API, sem mudar o intervalo da API (lote ~30% mais curto no teste com 1,5 s por resposta).
  Recusa da API (429/403) no meio do ciclo encolhe os próximos lotes de 5 em 5 (15 → 10 → 5, evento `batch-size`) e
  cada 1 h sem recusa devolve 5. O evento `progress` traz `batch`, `batchMs` e `fetchMs` (notificação e Painel mostram
  quanto levou o último lote). "Segura" é o ritmo antigo (1 pedido/min, 5 capítulos a cada 1 min 12 s).
- **Ajustes e Histórico** são telas: Ajustes tem as opções do automático, conta/chave/site e bateria; Histórico agrupa
  por dia com filtros (enviados, avisos, pedidos) e o resumo de hoje. "Enviadas hoje" no Painel mostra as capas
  (registros em `bm-estudio-envios`) e o ritmo em capítulos por hora. A fila mostra o total real (`queueTotal`) e
  quantos capítulos faltam nas obras já começadas.
- **Abas:** Painel, Explorar (Destaques, Atualizadas, Novas, Com IA, Para você, Listas, Leitura da MediocreScan),
  Buscar, Fila e No site. Pedidos dos leitores e configurações ficam no topo.

## Como o APK é gerado
O workflow `.github/workflows/estudio-apk.yml` compila o app a cada mudança em `admin-app/` na `main` e
publica o arquivo na release **estudio-apk** do repositório. Os builds em branches `apk-*` só testam.

A chave de assinatura (`keystore/estudio.jks`) fica no repositório para que cada versão nova instale por
cima da anterior. O repositório é privado; se um dia ficar público, gere uma chave nova e guarde-a como
segredo do GitHub.

## Painel
Baseado no MediocreScan Reader: abas Início, Recentes (todas / com IA), Novas, Para você (recomendações,
listas e leitura) e Buscar (nome ou ID); página da obra com selos IA/Oficial/Novel só quando a API confirma,
gêneros, sinopse e capítulos; leitor de imagens, texto de novel (A−/A+) e blocos mistos; visualizador de JSON
com a chave trocada por [REDACTED]. Cada obra mostra se já está publicada no site ou na fila, e pode ser
publicada ou atualizada dali.

## Envio interrompido e histórico
Se o app fechar no meio de um envio (atualização do APK, Android encerrando, app removido dos recentes), ao
abrir de novo ele avisa e oferece **Continuar**: a fila do site guarda a obra e os capítulos que faltam. O
histórico de envios fica salvo no celular (Configurações → Histórico de envios) com o motivo de cada parada.

## Capítulos
Na página da obra, cada capítulo mostra **No site ✓** quando o número já está publicado; os outros têm o
botão **Enviar** ao lado. Capítulos escolhidos vão de 5 em 5 com a mesma espera do envio completo, e os que já
estão no site são pulados sem baixar nada (o site também ignora repetidos em vez de contar erro).

## Obras no site
A aba **No site** lista as obras do Better Mangá (todas, publicadas, rascunhos ou vindas da MediocreScan),
com busca por título. Em cada obra dá para publicar ou voltar a rascunho, fixar nas atualizações, colocar
no destaque da home, mudar o status, mostrar/ocultar ou excluir capítulos, buscar capítulos novos na
MediocreScan e excluir a obra (pede para digitar EXCLUIR). Tudo passa pelo endpoint de envio, que só
aceita administradores.

A API da MediocreScan é chamada só em `https://api.mediocretoons.net` (mesmos caminhos de antes).

## Envio em segundo plano
Durante um envio o app liga um serviço do Android com notificação fixa (obra atual, barra de capítulos e
botão **Parar**), segura o processo acordado e mantém o app trabalhando minimizado ou com a tela apagada.
Na primeira vez ele pede para ignorar a economia de bateria; sem isso alguns celulares param o envio com a
tela apagada. Código em `android-src/` (copiado pelo `scripts/patch-android.mjs`).

## Arquivos
- `www/parse.js` — leitura tolerante das respostas (mesmos casos dos testes do MediocreScan Reader).
- `www/engine.js` — consultas, fila e ritmo de envio (testável sem celular).
- `www/app.js`, `www/index.html`, `www/style.css` — telas.
- `scripts/patch-android.mjs` — versão do app e tela acesa durante o uso.
