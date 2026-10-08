# Better Mangá no cPanel

## Requisitos da hospedagem

- **Setup Node.js App / Passenger**, com Node.js **22.12 ou superior**. Um plano somente PHP não executa este site.
- Domínio com HTTPS e aplicativo instalado na raiz do domínio, não numa subpasta.
- Conexões HTTPS de saída para o banco, arquivos, AniList e serviços de voz.
- Confirme com o provedor os limites de memória, tempo de execução e tráfego. Prepare os arquivos no computador para não consumir a memória do plano durante a compilação.

## 1. Preparar fora do editor Lovable

Exporte o código. No computador com Node.js 22.12+:

```sh
npm install
npm run build:cpanel
```

O comando funciona também no Windows. A pasta `.output/` deve conter `server/index.mjs` e `public/`. O editor Lovable mantém seu próprio destino; arquivos gerados aqui não são uma versão Node para cPanel.

### Banco atual ou banco próprio

A preparação não muda a conexão deste projeto nem transfere dados. Para manter o banco atual, preserve as variáveis públicas já configuradas. Recursos que exigem credenciais administrativas da Lovable não podem ser copiados para o cPanel.

Para usar um banco próprio na cópia exportada, antes de preparar os arquivos configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores públicos desse banco. O endereço usado no navegador e no servidor deve apontar para o mesmo banco. É necessário migrar separadamente tabelas, funções, políticas, contas e arquivos; um banco vazio não faz o site funcionar. Não execute o SQL de criação em um banco existente sem revisar as migrações.

## 2. Enviar os arquivos

Envie para a pasta do aplicativo, fora de `public_html` quando possível:

- Toda a pasta `.output/`, inclusive arquivos ocultos e `public/`.
- `app.cjs`.
- `scripts/cpanel-runtime.cjs` e `scripts/check-cpanel.cjs`.
- `package.json`.

Não envie `.git`, arquivos de segredos ou o `node_modules` do computador. Preserve as dependências que Nitro colocar dentro de `.output/server/`. Não basta enviar HTML e imagens: o servidor Node também é obrigatório.

## 3. Configurar o aplicativo

Em **Setup Node.js App**, selecione Node.js 22.12+, modo **Production**, pasta do aplicativo e **Application startup file = app.cjs**.

Adicione nas variáveis do aplicativo:

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL` | Endereço do mesmo banco usado ao preparar a versão |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública desse banco |
| `SUPABASE_SERVICE_ROLE_KEY` | Somente credencial administrativa do seu banco próprio; nunca uma chave pública |
| `FISH_AUDIO_API_KEY` | Opcional: sua chave Fish Audio e saldo de API para Rudeus |
| `NOVEL_IMPORT_ALLOWED_HOSTS` | Opcional: lista de hosts de importação autorizados, conforme a configuração existente |

Guarde credenciais privadas apenas nas variáveis do aplicativo, nunca em arquivos públicos ou em variáveis `VITE_`. As credenciais administrativas e a chave gerenciada Lovable não são exportáveis. Sem elas, algumas ações administrativas, Cloudinary e mídia privada de manutenção não funcionarão ao manter o banco atual. A voz do aparelho continua disponível; Fish Audio depende de chave própria e saldo.

Não fixe `PORT` ou `NITRO_PORT`: mantenha o valor escolhido pela hospedagem. Depois clique em **Restart**. Se o cPanel oferecer um terminal, com as variáveis do aplicativo carregadas execute:

```sh
npm run check:cpanel
```

## 4. Verificar antes de trocar o domínio

Teste entrada e recarga da home, catálogo, detalhes, leitor, login, painel, uploads e manutenção. No serviço de autenticação do banco próprio, configure o endereço HTTPS final e as URLs permitidas de retorno. A integração Google atual é vinculada à Lovable e não está validada em hospedagem externa.

Não use regras de redirecionamento de SPA para substituir o servidor: as páginas e funções precisam chegar ao aplicativo Node. Não exponha arquivos de configuração em `public_html`.

**Estado:** preparação e validações locais não comprovam a instalação no provedor. Nada é enviado, publicado ou migrado automaticamente por esses comandos.
