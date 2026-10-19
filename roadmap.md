# Tarefas
- [ ] Impedir obras duplicadas por título principal/alternativos no cadastro, edição e importação; preservar registros existentes e validar a proteção.

- [x] Corrigir espera da classificação: progresso do grupo atual, aprovação durante análise e encerramento na conclusão; 22 testes passaram e build OK, sem alterar obras nem publicar.
- [ ] Validar progresso e revisão com IA real — teste autenticado interrompido por “Not enough credits”; aguardando créditos, sem novas tentativas automáticas.

- [x] Classificação IA: comparação antes/depois, revisão de classificações existentes, justificativas e aprovação individual sem alterações automáticas; 80 testes passaram, IA real HTTP 200, computador/celular conferidos e aprovação recusou UUID inexistente com conta real, sem alterar dados nem publicar.
- [ ] Validar aprovação com gravação de uma obra real — pendente de obra autorizada para teste; comparação, explicação e recusa de conflito verificadas sem modificar conteúdos.
- [x] Selos de classificação de idade com ícone e cor por faixa (verde ao vermelho escuro) na obra, nas capas da home e rankings, nas listas e no painel; 76 testes passaram, typecheck e build OK, computador e celular conferidos sem sobreposição, sem alterar dados ou publicar.
- [x] Adicionar botão Classificar com IA junto a Nova obra; 75 testes passaram, identificação real retornou HTTP 200 e recusa de conta uploader confirmada, sem alterar obras ou publicar.

- [x] Relatório Android: edição de mínimo adicionada, diff da assinatura entregue e 70 testes passaram; nenhum APK publicado, nenhum dado alterado
- [ ] Relatório Android: excluir arquivo legado 0043 — aguarda confirmação explícita

- [x] Android 2.17: assinatura e painel ajustados, migrations documentadas, 68 testes passaram, build OK e endpoints públicos HTTP 200 sem releases; sem publicar ou alterar dados
- [ ] Android 2.17: validar painel administrativo real — conta solicitante uploader, sem administração
- [ ] Android 2.17: aplicar anúncios e regenerar tipos — bloqueado pelo anexo 0042_ad_counter.sql ausente
- [ ] Android 2.17: validar atualização com APK real publicado — bloqueado por ausência de releases e APK de teste

- [x] Reconhecer numeração TXT com ponto ou hífen nos dois painéis, com ordem numérica e proteção contra duplicados; 217 TXT enviados analisados sem erros de leitura/numeração, 13 testes passaram e build OK; nenhum capítulo publicado, imagens remotas não verificadas

- [x] Embelezar manutenção com aviso centralizado, emblema, contraste e rodapé refinado; computador e celular conferidos sem sobreposição, cinco testes passaram, build OK; mídia, áudio e permissões preservados, sem publicar ou alterar dados

- [x] Corrigir Unauthorized na manutenção: consulta pública sem depender da sessão, aviso alternativo em falhas e recusa administrativa segura; cinco testes passaram, navegador confirmou aviso com 401 simulado e sem erros, build OK; sem publicar ou alterar dados, produção ainda não verificada

- [x] Otimizar detalhes e leitor para carregar somente o conteúdo do capítulo aberto; dez testes passaram, detalhes, avanço de capítulos e novel conferidos no navegador sem erros: uma consulta de conteúdo por capítulo e nenhuma carga de todos os textos/imagens; sem publicar ou alterar conteúdos, ganho de tempo em produção ainda não medido

- [x] Mostrar APKs na navegação administrativa e melhorar manutenção; cinco testes passaram, telas reais verificadas com administrador sem salvar alterações; áudio ativou na primeira interação e retomou com mídia local de teste, sem publicar

- [ ] Corrigir endpoint de versões incompatível e validar abertura do site; concluir os três ajustes de painel pendentes

- [ ] Criar painel de versões Android com envio APK e consulta pública de atualização obrigatória; integração no APK depende do código Android
- [ ] Alinhar listagem de novels ao painel de obras, preservando editor e importação
- [ ] Criar área de gêneros adicionais e integrá-los aos seletores e catálogo
- [ ] Validar regras, permissões e telas sem publicar nem alterar conteúdos existentes

- [x] Ativar som do vídeo de manutenção com ação explícita quando o navegador bloquear áudio; sem controles de vídeo ou alterações de dados

- [ ] Adicionar importação TXT de novels com conferência, numeração, rascunho/publicação e simplificar a tela; validar sem gravar capítulos reais

- [x] Corrigir recusa indevida no início do envio de manutenção: aceitar contentLength na autorização TUS e size após conclusão; nove casos reais da regra e seis testes passaram, conta sem administração segue bloqueada com 403; mensagem diferencia sessão expirada de recusa do armazenamento
- [ ] Validar envio completo com administrador — sessão solicitante disponível tem somente papel uploader; permissões não foram alteradas, nenhuma manutenção ativada ou mídia apagada

- [x] Corrigir regra de envio de mídia de manutenção de 50 MB/5 MB para 1 GB, adicionar envio em partes com progresso e cancelamento, harmonizar tela e alinhar Atualizados Recentes; seis testes passaram e telas públicas conferidas sem ativar manutenção ou apagar dados
- [ ] Confirmar envio real de vídeo grande — precisa de sessão administrativa e arquivo real; limites e políticas conferidos, teste real não executado

- [x] Adicionar Obras populares, Em alta agora e Manhwa popular com seleção administrativa e dados automáticos do AniList; 16 testes passaram, home e escolha/ordenação/salvamento simulado conferidos, sem publicar ou apagar dados
- [ ] Confirmar gravação real das colunas e atualização completa do AniList — sessão disponível não tem papel administrativo; controle visual testado com acesso simulado sem alterar permissões

- [x] Ampliar gêneros e substituir digitação por seleção múltipla em cadastro, edição e novels; padronizar nomes nas postagens e filtros com aliases para registros antigos, sem alterar dados existentes; quatro testes e seleção/remoção no navegador passaram, gravação real não executada

- [x] Adicionar publicação de capítulos de obras por TXT numerados, sem limite artificial de seleção ou armazenamento dos TXT; cinco testes passaram, incluindo 1.001 arquivos, e painel validado com os quatro TXT enviados e gravação simulada; publicação real não executada

- [x] Ajustar inicialização e preparação do pacote para cPanel sem mudar a conexão atual
- [x] Verificar salvaguardas de inicialização com quatro testes locais e documentar requisitos e limites; conjunto de 28 testes passou, build Lovable OK, versão Node real ainda não gerada/testada
- [ ] Confirmar instalação real no cPanel — depende de acesso à hospedagem e suporte a Node.js/Passenger

- [x] Preservar imagens intercaladas na importação, prévia e leitor de novels, sem narrar URLs; cinco testes passaram e as quatro imagens do HTML enviado foram preservadas
- [x] Criar seção exclusiva de novels na home; seção, filtro e leitor ilustrado com dados simulados conferidos no navegador sem erros, build OK, sem publicar ou alterar dados existentes
- [ ] Confirmar salvamento e prévia ilustrada com conta administrativa; imagens removidas em importações antigas exigem reimportação do HTML original

- [x] Ampliar categorias no catálogo, painel e pedidos com Manhwa, Manhua, Webtoon, One-shot, Doujinshi e HQ; nove testes passaram e filtros conferidos no computador/celular, sem reclassificar obras existentes nem publicar

- [ ] Mostrar no slide somente obras ativadas no painel, sem alternativa automática
- [ ] Reduzir consultas repetidas e trabalho do carregamento da home
- [ ] Criar pedidos de obras, atendimento administrativo e notificações de publicação
- [ ] Verificar permissões e fluxo de pedidos sem excluir dados nem publicar o site

- [x] Verificar página inicial ao entrar/recarregar: obras carregaram, conexão lenta mostrou quatro áreas de carregamento, falha mostrou aviso e “Tentar novamente” recuperou as obras sem erros; sem alterar dados nem publicar

- [x] Fechar espaço acima do slide, manter barra translúcida visível e reduzir trabalho do slide fora da tela; rolagem conferida no navegador sem erros, ganho de velocidade em produção não medido

- [x] Otimizar carregamento inicial e sessões compartilhadas; consultas de catálogo na home reduzidas de 6 para 4, navegação pública conferida; teste de conta conectada e medição em produção pendentes

- [ ] Criar modo de manutenção com aviso, upload de MP4/imagem e acesso apenas de administradores
- [ ] Testar bloqueio, configuração e tela de manutenção sem controles de vídeo

- [x] Preparação para produção — corrigir importação remota: destinos autorizados, redirects, prazo e limite de resposta; sete testes passaram
- [ ] Preparação para produção — revisar imagens, URLs assinadas, primeiro administrador e permissões
- [ ] Preparação para produção — concluir qualidade, testes e confirmar hospedagem; não publicar automaticamente

- [x] Curtidas nos comentários (tabela comment_likes + botões na obra e no leitor)
- [x] Marcar capítulo como lido/não lido na lista de capítulos

- [x] Corrigir estouro e organização dos selos no perfil
- [x] Reorganizar perfil do proprietário no layout escuro elegante escolhido
- [x] Aplicar Sora e Manrope e validar desktop/celular
- [x] Copiar a barra de categorias enviada para o topo do slide
- [x] Atualizar as categorias de cadastro, edição e importação no painel
- [x] Criar modo de leitura dedicado para novels com controles de texto responsivos
- [x] Melhorar publicação de novels com editor, prévia, rascunhos e gestão de capítulos
- [x] Concluir botão Cloudinary no novo capítulo, com progresso e links automáticos; botão conferido no painel, envio real não testado
