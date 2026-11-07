# Novo método de importação: "Puxar pelo meu computador"

## Problema
A MediocreScan bloqueia o endereço do servidor do site, então qualquer busca feita pelo servidor falha. A chave funciona normalmente quando a chamada parte de outro lugar, por exemplo o seu computador ou celular.

## Solução
Um assistente de importação em que o seu aparelho faz a busca na MediocreScan e envia o resultado pronto para o Better Mangá, sem passar pelo endereço bloqueado.

1. Página nova no painel: "Importar pelo meu aparelho".
2. O painel gera um código de envio temporário (vale 24 h, só para administradores).
3. Você baixa um pequeno programa auxiliar (um arquivo para Windows/Android via Termux, ou um script para o navegador da própria MediocreScan).
4. O auxiliar usa a sua chave, que fica salva só no seu aparelho, para:
   - buscar obras por nome, por ranking ou entre as recém-adicionadas;
   - ler a lista de capítulos e os endereços das imagens;
   - enviar em lotes pequenos (5 capítulos, com pausa de 1,5 s).
5. O site recebe, confere duplicatas pelo título e pelo ID MediocreScan e grava como rascunho. A publicação continua manual.
6. O painel mostra o andamento: obras recebidas, capítulos novos e erros.

As imagens continuam vindo da CDN, que não está bloqueada.

## Segurança
- A chave nunca é enviada ao site nem fica guardada no servidor.
- O código de envio é temporário, revogável e aceita apenas o formato esperado.
- Nada é publicado automaticamente.

## Detalhes técnicos
- Rota `src/routes/api/public/mediocre-ingest.ts` (POST) que valida o token de envio com hash na tabela `mediocre_ingest_tokens`, criada por migration com RLS restrita a admin; aplica limite de taxa e de tamanho do corpo.
- Reaproveita os gravadores já existentes em `mediocre-import.server.ts` (`source_mediocre_id` único, inserção de capítulos em lotes).
- Scripts auxiliares em `public/downloads/` (Node/Termux e userscript).
- Testes de validação do token, de duplicatas e de lotes.

## Observação
O token colado no chat ficou exposto. Depois disso funcionar, vale gerar um novo na MediocreScan.
