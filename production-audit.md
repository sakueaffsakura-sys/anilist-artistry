# Auditoria de preparação — continuação

O site ainda não está declarado pronto para produção. Nenhum dado será apagado e não haverá publicação automática.

| ID | Área | Problema | Severidade | Arquivo | Impacto | Solução | Teste |
|---|---|---|---|---|---|---|---|
| IMP-01 | Importação | Redirects automáticos sem revalidar destino; hostname não garante IP público | ALTO | src/lib/novel-import.functions.ts | Acesso indevido a destinos internos | Allowlist exata no servidor e redirects manuais validados | URLs maliciosas e redirect para destino proibido |
| IMP-02 | Importação | Sem timeout; resposta inteira lida antes de truncar | ALTO | src/lib/novel-import.functions.ts | Memória e tempo excessivos | Prazo total de 10 segundos e leitura de no máximo 3 MB | Resposta lenta e stream acima do limite |
| IMP-03 | Importação | Sem verificação de Content-Type | MÉDIO | src/lib/novel-import.functions.ts | Processamento de resposta imprópria | Aceitar somente HTML | Resposta não HTML |
| IMG-01 | Imagens | Links assinados de um a dez anos | ALTO | src/lib/comments.ts e painel de imagens | Acesso duradouro; correção ingênua pode quebrar imagens salvas | Guardar caminhos estáveis e renovar links de até 24h | Pendente |
| ADM-01 | Permissões | Primeiro admin usa SELECT seguido de INSERT | ALTO | src/lib/staff.functions.ts | Disputa na criação do primeiro admin | Operação atômica revisável no banco | Pendente |

## Escopo desta etapa

Corrigir e testar IMP-01, IMP-02 e IMP-03 sem importar/publicar capítulos nem tocar nos dados existentes. O único domínio inicialmente permitido é mediocrescan.com (e www.mediocrescan.com), origem já solicitada pelo proprietário. Novos domínios exigem alteração explícita na configuração do servidor; não aceitar domínio enviado pelo navegador como autorização.

## Verificações ainda pendentes

- Limitação persistente de frequência por administrador (não substituir por contador em memória).
- Uploads: limite de 5 MB, MIME, dimensões, cotas e autorização no armazenamento.
- Renovação de URLs assinadas sem quebrar conteúdo existente.
- Primeiro administrador atômico, RLS/grants e credenciais de mídia.
- Qualidade geral, testes autenticados, backup e confirmação escrita/teste da hospedagem cPanel.