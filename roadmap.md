# Tarefas

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
