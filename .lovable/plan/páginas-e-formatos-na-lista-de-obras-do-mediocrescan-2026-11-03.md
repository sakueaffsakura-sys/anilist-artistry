# Páginas e formatos na lista de obras do MediocreScan

## O que foi confirmado na API (teste só de leitura)
- `/obras/atualizados?...` não existe (responde "ID da obra inválido"), então não vou usar esse endereço.
- `/obras/atualizadas-recentes` aceita:
  - `formato=N`, que filtra por formato. Por exemplo, formato 4 tem 1.361 obras em 46 páginas e formato 1 tem 35 obras.
  - `offset=30`, `offset=60`… para trocar de página (30 obras por página).
- `pagina=2` e `page=2` são ignorados pela API. A página real é calculada assim: offset = (página − 1) × 30.
- Sem formato, a lista tem 18.800 obras em 627 páginas.

## O que muda no painel (aba "Atualizadas recentemente")
- Seletor de **formato**: Todos, 1, 2, 3, 4, 5… com o número digitável.
- Navegação de páginas: Anterior, "Página X de Y", Próxima e um campo para ir direto a uma página.
- O total de obras e de páginas vem da própria API.
- Os ícones de publicada (✓) ou nova (X azul), o envio individual e o botão "Publicar todas" continuam funcionando, mas valem só para a página aberta.
- As páginas já vistas ficam guardadas por 5 minutos, para não repetir pedidos e evitar novo bloqueio da API.
- Se a API recusar uma página, aparece a mensagem de erro e as outras abas continuam funcionando.

## Detalhes técnicos
- `src/lib/mediocre-api.ts`: `MediocreRequest` ganha os campos opcionais `formato` (1–50) e `pagina` (1–1000), validados em `parseMediocreRequest`. Em `mediocrePath`, `recentes` passa a montar `/obras/atualizadas-recentes?formato=F&offset=(p-1)*30`; sem esses campos, o endereço continua igual ao atual. Um helper `extractPagination` lê `pagination`.
- `src/lib/mediocre-api.server.ts`: a chave do cache já inclui o caminho, então cada página fica salva separadamente.
- `src/routes/_authenticated/admin/mediocre.tsx`: guarda formato e página no estado, inclui os dois na `queryKey` e mostra os controles de paginação só na aba de recentes.
- Testes em `tests/mediocre-api.test.ts`: o caminho com offset, a rejeição de página/formato inválidos e o caminho padrão sem mudança.
- A vitrine pública `/mediocre` e a sincronização automática não mudam.
