# Google Analytics no site + login ainda mais fiel ao HTML

## 1. Google Analytics
- Usar o código já salvo (GOOGLE_ANALYTICS_MEASUREMENT_ID) para registrar visitas em todo o site.
- Registra a primeira página e cada troca de página.
- Não registra nada no painel admin, para não misturar acessos da equipe com os dos leitores.
- Se o código não estiver configurado, o site funciona normalmente sem rastreamento.

## 2. Tela de login copiada do HTML
- Comparar a tela atual com o HTML enviado (textos, espaçamentos, tamanhos, cores dos campos, abas, botões e separador "ou com e-mail").
- Ajustar: abas Entrar/Criar conta, título "Bem-vindo de volta", subtítulo, botões sociais lado a lado, separador, campos arredondados com ícones e botão laranja. Também a chamada "Comic, mangá, shoujo e novel em português." embaixo da frase do painel de capas.
- Continuam de fora os itens que o site ainda não tem: Discord, "Manter conectado" e "Esqueci minha senha".

## Detalhes técnicos
- Uma função de servidor pública lê o ID de medição dentro do handler (o ID de medição é público por natureza). O carregamento do gtag.js fica em um componente só do navegador montado no root, com `page_view` a cada mudança de rota pelo roteador e as rotas `/admin` ignoradas.
- Login: apenas `src/routes/auth.tsx` e as classes no `src/styles.css`, usando os tokens do tema. O fluxo de autenticação não muda.
- Verificação: capturas desktop/mobile do login e conferir no navegador que a requisição do Analytics é enviada.
