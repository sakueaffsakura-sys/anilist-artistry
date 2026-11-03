# Visual novo para o site inteiro (parte pública)

Objetivo: levar a mesma identidade detalhada e animada do painel para as páginas dos leitores, mantendo o laranja sobre azul quase preto, as fontes atuais e todas as funções.

## O que muda
- **Fundo geral:** textura de grão leve e manchas de luz laranja que se movem devagar.
- **Barra superior:** efeito vidro e um brilho na barra laranja do item ativo. Uma barra fina de progresso aparece ao trocar de página.
- **Home (slide principal):** capa com leve flutuação, brilho atravessando o slide e entrada em cascata do título, dos gêneros e dos botões. Os tracinhos laranja inclinados também aparecem no slide.
- **Prateleiras e cartões de obras:** títulos de seção com tracinhos laranja. As capas sobem e ganham zoom ao passar o mouse, com brilho que segue o cursor e etiquetas mais nítidas. Os cartões entram em cascata ao aparecer.
- **Página da obra:** banner com degradê mais profundo e capa com contorno luminoso. Abas e lista de capítulos com efeito ao passar o mouse e o capítulo lido marcado.
- **Catálogo, ranking, coleção e perfis:** cartões com cantos recortados no estilo mangá, filtros em pílulas com animação e números do ranking em destaque com degradê.
- **Botões:** reflexo atravessando ao passar o mouse e leve "afundar" ao clicar.
- **Carregamento:** esqueletos com brilho deslizante no lugar do piscar.
- **Rodapé e navegação do celular:** ícone ativo com brilho e pequena animação ao tocar.
- **Leitores de mangá e de novel:** sem animações, para não atrapalhar a leitura. Só ganham pequenos acabamentos nos botões.
- Quem configurou o aparelho para menos movimento vê o site sem animações.

## Detalhes técnicos
- Efeitos em `src/styles.css` com tokens semânticos e classes `site-*`, aplicados pelas classes existentes de cartões, cabeçalho, prateleiras e detalhes. `prefers-reduced-motion` desliga tudo.
- O brilho que segue o mouse usa um único listener delegado no root, gravando variáveis CSS, sem re-render.
- Uma barra de progresso de rota no root, lendo o status do roteador.
- O cabeçalho segue sticky em CSS, sem estado de rolagem. Nenhuma consulta nova.
- Verificação: testes; capturas desktop e celular de home, obra, catálogo e ranking; leitor sem rolagem lateral.
