# Remover confirmação de e-mail no cadastro

## Objetivo
Novos usuários entram direto após criar a conta, sem precisar confirmar o e-mail.

## Mudança
- Desativar a confirmação de e-mail na autenticação do backend (Lovable Cloud), mantendo cadastro por e-mail e senha.
- Verificar se a tela de cadastro/login (`src/routes/auth.tsx`) ainda mostra algum aviso de "confirme seu e-mail" e ajustar o texto se necessário.

## Observações
- Sem confirmação, qualquer e-mail (mesmo inválido) cria conta imediatamente.
- Contas já existentes não são afetadas.
