# Vitrine MediocreScan + adição automática pelos pedidos

## O que você vai ganhar
1. **Vitrine pública "MediocreScan Obras"** dentro do Better Mangá, em `/mediocre`. Ela tem as abas Início, Recentes, Com IA e Buscar por ID, a página da obra com a lista de capítulos e um leitor de capítulo (imagens em sequência, texto, ou os dois na ordem original). Também tem Ver/Copiar/Baixar JSON.
   - Fica em `/mediocre/...` porque `/obra/...` já são as páginas das obras do Better Mangá.
   - O aviso de rodapé sobre os direitos do conteúdo aparece em todas as páginas.
2. **Adição automática pelos pedidos:** quando um leitor faz um pedido em `/pedidos`, o site procura o título na MediocreScan. Se encontrar exatamente o mesmo nome (principal ou alternativo), cria a obra no Better Mangá com capa, sinopse, gêneros e capítulos. O pedido é marcado como atendido e o leitor é avisado, pelo mesmo aviso que já existe hoje.
   - Se não encontrar, ou se houver dúvida entre duas obras, o pedido fica pendente para o administrador, como hoje.
   - A trava contra obras duplicadas continua valendo: se o título já existir, nada é criado de novo.
3. O painel do administrador (`/admin/mediocre`) ganha um botão "Adicionar ao Better Mangá" para fazer o mesmo à mão.

## Limites que você precisa saber
- **A API não tem busca por nome.** A procura só olha as obras das listas Início, Recentes e Com IA. Obras antigas que não aparecem nessas listas não serão encontradas automaticamente. Se você souber de um endereço de busca da API, eu uso.
- **Só endpoints públicos:** a vitrine não usa os de leitura pessoal, notificações, comentários e outros que você listou.
- **Capítulos:** as páginas são lidas a partir do JSON do capítulo informado pela própria API, sem adivinhar endereços. Se um capítulo não tiver esse JSON, ele é pulado e anotado no pedido.
- O token continua só no servidor. Nada é chamado direto do navegador para a MediocreScan.

## Etapas
1. Ampliar a consulta segura do servidor com as operações `capitulo`, `conteudo_capitulo` e `thumbs_capitulos`, e liberar as operações públicas para visitantes, com limite de uso. A rota pessoal de capítulos do usuário continua só para administradores.
2. Criar os leitores de dados (lista de obras, obra, capítulo, conteúdo) com testes para cada formato de JSON citado.
3. Criar as páginas da vitrine pública, com carregamento, vazio, erro, "Tentar novamente", busca com espera e cache.
4. Criar o importador "obra da MediocreScan → Better Mangá", reaproveitando a importação de capítulos por JSON que já existe.
5. Ligar o importador ao envio do pedido: depois de salvar, o servidor tenta atender sozinho e devolve "Adicionada!" ou "Pedido enviado".
6. Testar no navegador: cartões reais, obra, capítulo, um pedido real de teste (que não será apagado) e a conferência de que o token não aparece no site.

## Detalhes técnicos
- Continuo usando `createServerFn` do TanStack, e não uma Edge Function do Supabase (é a regra do projeto). A proteção é a mesma: lista fixa de caminhos, IDs inteiros positivos, UUID só aceito se vier dos metadados do capítulo, apenas GET, `redirect: manual`, tempo limite e limite de tamanho.
- As operações públicas usam uma função de servidor sem login. A gravação no catálogo usa uma função autenticada: no pedido, roda como o leitor e grava com acesso privilegiado só depois de validar o pedido dele. No botão do painel, exige administrador.
- O conteúdo do capítulo vira `chapters.pages` (imagens) ou `chapters.content` (texto/novel). Os capítulos são gravados em sequência; uma obra nova só é criada se a trava de títulos (`work_title_claims`) aceitar.
- Cada obra criada guarda o ID de origem na MediocreScan. Isso precisa de uma pequena alteração no banco: uma coluna `source_mediocre_id` em `series`, para não importar a mesma obra duas vezes.
