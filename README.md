# Race Flow

Jogo de corrida multiplayer cartoon, 100% no navegador. Física de veículo via Rapier (raycast vehicle), render 3D toon com react-three-fiber, servidor autoritativo Colyseus, contas/economia no Supabase.

## Status: Fase 1 — MVP online

- [x] **Fase 0**: carro dirigível (suspensão, drift, capotamento), pista de teste, câmera, HUD
- [x] Corrida online 2–8 jogadores (3 voltas, grid, countdown, pódio) com predição local + interpolação de remotos
- [x] Drift Challenge (2min, pontuação ângulo × velocidade × tempo com combo) — pontuado **no servidor**
- [x] Checkpoints, voltas e resultado decididos no servidor; anti-teleporte/velocidade com `correction`
- [x] Contas (Supabase Auth) + modo convidado sem atrito; landing page com "Jogar agora"
- [x] Loja/garagem: 3 carros (classes C/B/A) com física real distinta; compra via RPC validada no banco
- [x] Leaderboard simples (melhor tempo por piloto) na landing
- [x] **Fase 2 (parcial)**: tuning de performance (6 categorias com trade-offs, muda a física de verdade), PR + matchmaking por classe (servidor recalcula do banco e expulsa classe mentida), lobby privado por código com largada do anfitrião
- [ ] Fase 2 (restante): Time Trial + ghost, desafios diários, amigos, livery/cosméticos

### Modelo de física do carro (pós-playtest)

Tração traseira limitada por μ×carga no eixo: pedir mais força do que o pneu segura não empina — **patina** (burnout na arrancada, giro visual extra, traseira levemente solta). Centro de massa rebaixado por lastro no chassi. Grip lateral no padrão do raycast vehicle (`frictionSlip` ≈ 10.5 — valores baixos fazem o carro "arar" reto): curvas normais têm direção normal; **drift é deliberado**, via freio de mão (derruba o grip lateral traseiro) ou powerslide de aceleração.

## Estrutura

```
race-flow/
  web/       # frontend (Vite + React + TS + R3F + Rapier + @colyseus/sdk)
  server/    # servidor de jogo autoritativo (Colyseus 0.17, roda com tsx)
  shared/    # catálogo de carros, pista/checkpoints, protocolo (importado por ambos)
  supabase/  # schema.sql (tabelas, RLS, RPCs de economia)
```

## Rodar local

Requisitos: Node 20+.

```bash
# terminal 1 — servidor de jogo
cd server && npm install && npm run dev   # ws://localhost:2567

# terminal 2 — frontend
cd web && npm install && npm run dev      # http://localhost:5173
```

Sem nenhuma variável de ambiente: funciona em **modo convidado** (multiplayer completo, sem persistência de moedas). Controles: **WASD/setas**, **Espaço** freio de mão, **R** desvirar o carro.

Para testar multiplayer sozinho: abra duas abas. `NET.minPlayers = 1` em `shared/protocol.ts` permite corrida solo em dev (suba para 2 em produção).

## Supabase (contas + economia) — opcional em dev

1. Crie um projeto no [supabase.com](https://supabase.com) (free tier).
2. SQL Editor → cole e execute `supabase/schema.sql`.
3. `web/.env` (copie de `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. `server/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service role fica SÓ no servidor).

Segurança da economia (não negociável): saldo/carros/resultados têm RLS; cliente só lê. Compra passa por `buy_car()` (SECURITY DEFINER, valida preço/saldo/posse no banco). Crédito de corrida passa por `apply_race_result()`, com `EXECUTE` revogado de `anon`/`authenticated` — só o service role (servidor de jogo) chama. Colunas `coins/xp/level` estão fora do grant de UPDATE do cliente.

## Deploy

| Peça | Onde | Como |
|---|---|---|
| Frontend | Vercel (free) | Import do repo, **Root Directory = `web`**, env `VITE_GAME_SERVER_URL=wss://<seu-app>.onrender.com` + as `VITE_SUPABASE_*` |
| Servidor | Render (free web service) | Root Directory = `server`, Build `npm install`, Start `npm start`, env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| Banco/Auth | Supabase (free) | `supabase/schema.sql` |

⚠️ Free tier do Render tem **spin-down**: a primeira conexão após inatividade leva ~1min (a UI avisa o jogador). Sempre-ligado ≈ US$7/mês (Render/Railway pagos). Fly.io não tem mais free tier para contas novas. Servidor é single-region no MVP — latência fora da região do deploy será maior (documentado, não resolvido).

## Arquitetura de rede (decisão declarada)

Cliente simula o próprio carro (Rapier local = predição imediata, sem input lag) e envia pose a 20Hz. O servidor **não re-simula a física** no MVP — ele valida sanidade (deslocamento máximo plausível pro carro/intervalo; rejeição → `correction` que o cliente acata) e é a única autoridade sobre checkpoints, voltas, tempos, drift score, resultado e moedas. Carros remotos são interpolados com ~120ms de atraso e **não colidem** entre si (colisão com autoridade dividida geraria disputas injustas; re-simulação server-side é o upgrade natural da Fase 2+).

## Testes executados (automatizados, via bot Node + servidor real)

- Corrida: lobby → countdown → racing → finished; 3 voltas contadas no servidor com tempos por volta; resultado com posição/moedas.
- Anti-cheat: teleporte de ~40m rejeitado (exatamente 1 `correction`), corrida segue normal depois.
- Drift: score acumula só derrapando (yaw ≠ trajetória), combo cresce até o teto, resultado com moedas.
- Sala privada: criada com código, amigo entra por `joinById`, NÃO auto-inicia após o lobby normal, largada só quando o anfitrião manda `start`.
- Typecheck estrito + build de produção de `web/` e `server/`.

## Não testado (declarado)

- Gameplay 3D em runtime (sandbox sem WebGL): os novos valores de grip/tração/lastro seguem a referência do raycast vehicle, mas precisam de playtest seu — me diga como ficou a sensação de curva/drift.
- RPC `upgrade_car` num Supabase real (validada por leitura; se você já aplicou o schema antes, rode só o bloco novo `upgrade_car` no SQL Editor).
- Fluxo Supabase real (signup → trigger de perfil → compra → crédito pós-corrida): schema não foi aplicado num projeto real; RPCs/RLS validados por leitura, não por execução.
- Deploy Vercel/Render (precisa das suas contas).
- Mobile/touch (input abstraído, implementação touch é Fase 2) e gamepad.
- Corrida com 3+ jogadores simultâneos e comportamento sob latência real.

## Variáveis de ambiente

Documentadas em `web/.env.example` e `server/.env.example`. Nenhum segredo commitado.
