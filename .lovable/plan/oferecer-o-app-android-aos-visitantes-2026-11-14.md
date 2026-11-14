# Oferecer o app Android aos visitantes

O painel já permite subir o APK (Painel → Versões Android). Falta o visitante ver a opção de baixar.

## Banco de dados
O banco está religando agora (os créditos voltaram). Antes de mexer, confirmo que ficou ativo e abro a home e uma obra para garantir que o site voltou.

## O que o visitante vai ver
- **No celular Android:** um aviso pequeno no rodapé da tela na primeira visita: "Baixe o app Better Mangá — versão X" com botões "Baixar" e "Agora não". Fechado, não volta por 7 dias.
- **Não aparece** no iPhone, no computador, dentro do próprio app, no modo de emergência, na manutenção nem no painel.
- **Página "/app":** sempre disponível, com nome da versão, novidades (notas que você escreveu no painel), botão "Baixar APK" e o passo a passo para instalar ("permitir fontes desconhecidas"). Fica linkada no menu e no rodapé do site.
- Se nenhuma versão estiver publicada no painel, nada aparece e a página "/app" diz que o app chega em breve.
- O botão sempre baixa a versão publicada mais recente que você subiu.

## Detalhes técnicos
- Reaproveita `/api/public/version` (já devolve a versão publicada e um link assinado temporário do APK); sem tabela nova nem migration.
- Componente `AppDownloadPrompt` montado uma vez no root, client-only, detecta Android pelo user agent e ignora a WebView do app (marca já usada pelo app Capacitor); dispensa guardada em localStorage lida em `useEffect`.
- Rota pública `src/routes/app.tsx` com head próprio, incluída no sitemap.
- Teste em `tests/` para a regra de exibição (Android sim, iPhone/computador/app não, dispensa de 7 dias).
