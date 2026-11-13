# Estúdio Better Mangá (APK de administração)

App Android para publicar no Better Mangá as obras da MediocreScan. O celular busca na API (pelo IP dele,
que não está bloqueado) e envia ao site pelo endpoint `/api/public/mediocre-ingest`.

- **Entrar:** e-mail e senha da conta de administrador do site, ou um código de envio gerado no painel
  (admin/mediocre → "Gerar código da automação"), para quem entra no site com o Google.
- **Chave da MediocreScan:** colada no app; fica só no celular e vai somente para a MediocreScan.
- **Pedidos à API:** durante o envio, no máximo 1 pedido por minuto a `api.mediocretoons.net` (as páginas no
  CDN não contam). Quando a lista de capítulos da obra já traz o UUID, o app vai direto às páginas sem pedir o
  capítulo à API.
- **Ritmo:** uma obra por vez até o último capítulo, 5 capítulos por envio, 1 min 12 s de espera antes dos próximos 5.
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
