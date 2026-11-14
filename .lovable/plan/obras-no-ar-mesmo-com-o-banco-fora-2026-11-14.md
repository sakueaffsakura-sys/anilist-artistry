# Obras no ar mesmo com o banco fora

## 1. Religar o banco (bloqueado agora)
O banco continua pausado por falta de créditos do Lovable Cloud. Assim que o dono ou um administrador do espaço de trabalho adicionar créditos, eu religo o banco, abro a home e uma obra para confirmar que o site voltou, e só então sigo com o resto. Sem créditos, nada disso pode ser testado de verdade.

## 2. Cópia de segurança no GitHub
- A automação que já roda no GitHub a cada hora ganha um passo novo: baixa do site todas as obras publicadas e todos os capítulos (textos das novels e endereços das páginas) e salva numa área separada do repositório, só para a cópia.
- Envia apenas o que mudou desde a última cópia, para ser rápido e leve.
- O site entrega essa lista só para quem tiver um código de cópia gerado no painel (guardado como segredo no GitHub, igual ao código de envio atual).
- No painel aparece "Última cópia: data/hora, N obras, N capítulos".

## 3. Modo de emergência no site
Quando o banco não responder:
- O site não mostra mais "This page didn't load"; carrega a home, catálogo, página da obra e leitor a partir da cópia do GitHub.
- A leitura fica liberada sem conta, só durante a queda. Uma faixa avisa: "Modo de emergência: favoritos, histórico, comentários e login voltam quando o sistema normalizar."
- Ficam desligados: login, perfis, favoritos, histórico, comentários, pedidos, Reels, painel.
- Perfis infantis não existem nesse modo, então obras +16 e +18 ficam escondidas na emergência para não liberar conteúdo adulto sem conta.
- Quando o banco volta, tudo retorna ao normal sozinho (conta e perfil obrigatórios de novo).

## Limitações
- Páginas de capítulos guardadas no armazenamento do próprio site caem junto com o banco; só aparecem as que vêm da MediocreScan ou de outros endereços externos. Posso, numa etapa futura, copiar essas imagens também, mas ocupa muito espaço no GitHub.
- A cópia pode estar até cerca de 1 hora atrasada.
- Obras em rascunho nunca entram na cópia.

## Detalhes técnicos
- Rota `src/routes/api/public/backup-export.ts`: exige código de cópia (hash em tabela com RLS admin, mesmo padrão dos códigos de ingestão), pagina obras publicadas e capítulos publicados por `updated_at`, sem dados de usuários.
- Passo em `.github/workflows/mediocre-automacao.yml` (ou workflow próprio `obras-copia.yml`) que grava `obras/index.json`, `obras/<id>.json` e `capitulos/<id>.json` num branch `copia-obras`.
- Servidor do site lê a cópia via GitHub (token só no servidor, secret novo) com cache em memória; helper `src/lib/fallback-catalog.server.ts`.
- `maintenance.server.ts` e o `beforeLoad` da raiz passam a falhar aberto com sinalização "banco indisponível"; gates de `_authenticated` liberam apenas rotas de leitura quando o modo de emergência está ativo, filtrando `age_rating` 16/18.
- Consultas de catálogo/obra/leitor recebem fallback para a cópia quando a chamada ao banco falha.
- Testes em `tests/` para: filtro de idade na emergência, falha aberta da manutenção e retorno ao modo normal.
- Regra técnica registrada em AGENTS.md; nada é publicado automaticamente.
