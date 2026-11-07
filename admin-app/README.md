# Estúdio Better Mangá (APK de administração)

App Android para publicar no Better Mangá as obras da MediocreScan. O celular busca na API (pelo IP dele,
que não está bloqueado) e envia ao site pelo endpoint `/api/public/mediocre-ingest`.

- **Entrar:** e-mail e senha da conta de administrador do site, ou um código de envio gerado no painel
  (admin/mediocre → "Gerar código da automação"), para quem entra no site com o Google.
- **Chave da MediocreScan:** colada no app; fica só no celular e vai somente para a MediocreScan.
- **Pedidos à API:** durante o envio, no máximo 1 pedido por minuto a `api.mediocretoons.net` (as páginas no
  CDN não contam). Quando a lista de capítulos da obra já traz o UUID, o app vai direto às páginas sem pedir o
  capítulo à API.
- **Ritmo:** uma obra por vez até o último capítulo, 5 capítulos por envio, 1 min 12 s de espera antes dos próximos 5 e
  pausa de 1 minuto quando a API trava (para depois de 5 travamentos seguidos). Falha de conexão é tentada
  de novo 3 vezes (20 s entre elas) em vez de pular o capítulo. Parar no meio guarda o ponto na
  fila do site, e a obra é retomada primeiro.

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
