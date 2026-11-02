# Fazer o som dos Reels funcionar

## O que muda para você
- Ao tocar no botão de som, o vídeo que está na tela passa a tocar com áudio na hora.
- A escolha (com som ou sem som) vale para todos os vídeos, inclusive ao rolar para o próximo.
- Se o navegador bloquear o som, o vídeo continua tocando sem som e aparece um aviso "Toque para ativar o som".

## Detalhes técnicos
- Em `src/routes/_authenticated/reels.tsx`, no `AutoVideo`, o som hoje só é controlado pelo atributo `muted` do React, que nem sempre atualiza no elemento de vídeo. Vou definir `el.muted` e `el.volume = 1` direto num `useEffect` sempre que a opção mudar.
- Quando o som for ativado, chamar `el.play()` no mesmo toque, para o navegador aceitar o áudio. Se `play()` falhar, voltar para sem som e mostrar o aviso.
- Pausar os outros vídeos para não tocarem dois áudios ao mesmo tempo, e aplicar a opção atual ao vídeo que entra na tela.
- Testar no navegador: o botão muda `muted` para falso e o vídeo continua tocando.
