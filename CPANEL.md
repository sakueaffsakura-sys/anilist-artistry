# Publicar no cPanel (Setup Node.js App)

1. No seu computador (Node.js 22): `npm install` e depois `npm run build:cpanel`.
   Isso cria a pasta `.output/`.
2. Envie para a pasta do app no cPanel: `.output/`, `app.cjs` e `package.json`.
3. Em **Setup Node.js App**: versão Node 22 (mínimo 20), *Application startup file* = `app.cjs`.
4. Em *Environment variables* adicione:
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (mesmos valores do arquivo `.env`, sem o prefixo VITE_)
   - `SUPABASE_SERVICE_ROLE_KEY` e `LOVABLE_API_KEY`: não ficam disponíveis fora da Lovable.
     Sem eles, narração por IA, mídia de manutenção e funções de administrador que dependem deles não funcionam.
5. Clique em **Restart**.
