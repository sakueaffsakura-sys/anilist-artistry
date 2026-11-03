# Painel admin: mais animações e visual único

Objetivo: deixar o painel com identidade própria e cheio de detalhes animados, mantendo o laranja sobre azul quase preto e sem mudar funções, permissões ou dados.

## Animações
- Entrada da página em cascata: topo, cartões e linhas aparecem um após o outro.
- Topo da página com fundo animado: brilho laranja que se move devagar, grade de pontos sutil e faixa luminosa passando pela borda.
- Ícone da página com anel pulsante e leve flutuação.
- Menu lateral: indicador do item ativo desliza entre itens; ícones crescem e brilham ao passar o mouse.
- Cartões e linhas: elevação, borda com brilho em degradê seguindo o mouse e capas com zoom suave.
- Botões principais com reflexo que atravessa ao passar o mouse.
- Números da visão geral contando do zero até o valor.
- Carregamento com brilho deslizante; selos de status com ponto pulsante.
- Tudo desligado para quem prefere menos movimento.

## Layout mais único
- Fundo do painel com textura de grão leve e duas manchas de luz em cantos opostos.
- Menu com cabeçalho em vidro, marca com contorno luminoso e rodapé com relógio/data e status "online".
- Topo da página em estilo "capa de revista": título grande, linha decorativa inclinada (tracinhos laranja, igual à identidade do site) e mini-indicadores à direita.
- Cartões com cantos recortados no estilo mangá (detalhe diagonal no canto) e cabeçalhos de seção com numeração.
- Barra de progresso fina no topo durante trocas de página.

## Detalhes técnicos
- Efeitos em CSS (`@keyframes`, `@utility`, variáveis) em `src/styles.css` com tokens semânticos; `prefers-reduced-motion` desativa tudo.
- `AdminShell.tsx`: camadas decorativas, indicador ativo, relógio, barra de progresso via estado do roteador, rastreio do mouse por variável CSS (um listener delegado, sem re-render).
- `StatCard` ganha contador animado leve com `requestAnimationFrame`.
- Verificação: testes, capturas desktop e celular de Visão geral, Obras e MediocreScan.
