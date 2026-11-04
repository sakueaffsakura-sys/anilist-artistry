# Outro caminho para puxar da MediocreScan (ponte no seu cPanel)

## Situação confirmada
- A MediocreScan bloqueia o servidor do site já no primeiro pedido ("IP bloqueado."), mas aceita a mesma chave quando o pedido sai de outro lugar.
- Não dá para buscar direto pelo navegador do administrador: a API não permite pedidos vindos de outro site.
- O servidor de imagens (CDN) aceita qualquer origem, mas a lista de capítulos só vem da API.

Conclusão: o único caminho que funciona é fazer os pedidos saírem de outro servidor. Você já tem hospedagem cPanel, então ela vira uma "ponte".

## O que será feito
1. **Arquivo ponte pronto (`mediocre-ponte.php`)** para você enviar ao seu cPanel, em qualquer pasta pública. Ele:
   - só aceita pedidos com a senha da ponte;
   - só busca nos dois endereços da MediocreScan (API e CDN), sempre com GET, em caminhos validados;
   - repassa a chave da MediocreScan sem guardar nem mostrar;
   - devolve a resposta e o código de erro como vieram.
2. **Painel MediocreScan → nova caixa "Ponte":** campo do endereço da ponte, botão para gerar a senha (copiar para o arquivo) e "Testar ponte".
3. **Uso automático:** com a ponte configurada, todos os pedidos (painel, vitrine, pedidos por nome, fila e correções) passam por ela. Se a ponte cair, o site tenta o caminho direto uma vez. O ritmo calmo (1,5 s entre pedidos, um capítulo por vez) e as pausas em bloqueio continuam.
4. **Passo a passo em português** no próprio painel: onde enviar o arquivo, onde colar a senha e como testar.
5. Testes: validação dos caminhos que a ponte aceita e escolha entre ponte e caminho direto.

## O que você vai precisar fazer
- Enviar o arquivo pelo Gerenciador de Arquivos do cPanel.
- Colar a senha gerada no arquivo (uma linha no topo).
- Colar o endereço do arquivo no painel e clicar "Testar ponte".

Se a MediocreScan também bloquear o IP do cPanel, a ponte não resolve. Nesse caso, só uma liberação feita por eles.

## Detalhes técnicos
- Migration: `mediocre_settings` + `relay_url text`, `relay_secret text` (mesma tabela, só acessível pelo servidor; o painel grava por função admin).
- `src/lib/mediocre-api.server.ts`: `mediocreGet` monta `relay_url?host=api|cdn&path=...`, com cabeçalhos `X-Relay-Key` e `X-Mediocre-Auth`. Cai para o caminho direto em erro de rede/5xx da ponte. O token nunca vai na URL.
- PHP com cURL, timeout 15 s, limite de 8 MB, regex do path igual ao validador atual, sem seguir redirecionamentos.
- O arquivo fica em `public/downloads/mediocre-ponte.php` para baixar pelo painel; a senha não fica no arquivo publicado.
- Registrar a regra em `src/lib/AGENTS.md`.
