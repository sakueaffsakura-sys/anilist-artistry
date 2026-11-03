# Visual novo e completo para todo o painel admin

Objetivo: dar a todas as 16 páginas do painel (visão geral, obras, nova obra, edição, novels, home, gêneros, imagens, molduras, selos, contas, pedidos, suporte, manutenção, app, MediocreScan) um visual único, bonito e detalhado, mantendo o tema laranja sobre azul quase preto e sem mudar nenhuma função, permissão ou dado.

## O que vai mudar visualmente

1. **Estrutura do painel (menu e topo)**
   - Menu lateral com ícones grandes, grupos com títulos, item ativo com brilho laranja e indicador lateral, recolher/expandir no desktop.
   - Barra superior fixa com caminho da página, busca rápida de páginas, atalho para o site e avatar da conta.
   - Menu móvel em gaveta com os mesmos grupos.

2. **Cabeçalho de cada página**
   - Bloco com ícone, título, descrição curta, contadores e botões principais à direita (ex.: "Nova obra", "Classificar com IA").

3. **Componentes padronizados do painel**
   - Cartões com borda suave, brilho sutil e sombra; cartões de indicador com número grande, ícone e variação.
   - Tabelas/listas com linhas alternadas, miniaturas de capa, selos de status coloridos (publicada, rascunho, erro, na fila).
   - Barras de ferramentas de filtros/busca com campos arredondados.
   - Estados vazios ilustrados com ícone e texto, estados de carregamento com esqueletos, erros com botão de tentar novamente.
   - Seções de formulário em blocos com título, ajuda e separação clara (edição de obra, manutenção, app, home).

4. **Ajustes por página**
   - Visão geral: grade bento com indicadores, atividade recente e atalhos.
   - Obras/Novels: lista em cartões ou tabela com capa, tipo, idade, capítulos e ações.
   - Edição de obra: abas visuais (Dados, Capítulos, Importação) com painel lateral de capa/banner.
   - MediocreScan: fila com linha do tempo de progresso, cartões de obra com selos enviar/publicada.
   - Contas, pedidos, suporte: listas com avatares, selos de papel/status e filtros.
   - Manutenção, app, gêneros, imagens, molduras, selos, home: formulários em blocos e prévias destacadas.

5. **Responsivo e acessível**: celular sem rolagem lateral, foco visível, animações respeitando movimento reduzido.

## Detalhes técnicos
- Novas classes `admin-*` e tokens semânticos em `src/styles.css` (sem cores fixas); fontes Sora/Manrope mantidas.
- Componentes compartilhados novos em `src/components/admin/` (PageHeader, StatCard, Panel, Toolbar, EmptyState, StatusBadge, DataList) reutilizados pelas páginas.
- `AdminShell.tsx` reescrito; páginas em `src/routes/_authenticated/admin/*` recebem apenas troca de estrutura visual, sem tocar consultas, servidor ou permissões.
- Verificação: build, `bun test`, capturas desktop e celular das páginas principais.
