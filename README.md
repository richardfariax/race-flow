# Race Flow

Jogo de corrida multiplayer cartoon, 100% no navegador. Física de veículo via Rapier (raycast vehicle), render 3D toon com react-three-fiber.

## Status: Fase 0 — Fundação

- [x] Carro dirigível com física crível (suspensão, drift com freio de mão, capota se exagerar)
- [x] Pista de teste circular com muros, rampa e obstáculos dinâmicos
- [x] Câmera de perseguição, HUD de velocidade
- [x] Input abstraído (teclado; touch/gamepad nas próximas fases)
- [ ] Fase 1: multiplayer (Colyseus), contas (Supabase), Drift Challenge, loja/garagem, landing page

## Estrutura

```
race-flow/
  web/      # frontend do jogo (Vite + React + TS + R3F + Rapier)
  server/   # (Fase 1) servidor autoritativo Colyseus
```

## Rodar local

Requisitos: Node 20+.

```bash
cd web
npm install
npm run dev
```

Abra http://localhost:5173. Controles: **WASD/setas** dirigir, **Espaço** freio de mão, **R** reposicionar.

## Build e checagem de tipos

```bash
cd web
npm run build      # tsc + vite build → web/dist
npm run typecheck
```

## Deploy (frontend → Vercel)

1. Suba o repositório para o GitHub.
2. Na Vercel: **New Project** → importe o repo → **Root Directory = `web`** (framework Vite é detectado automaticamente; `vercel.json` já força SPA fallback).
3. Deploy. Sem variáveis de ambiente na Fase 0.

## Variáveis de ambiente

Nenhuma na Fase 0. A partir da Fase 1 (documentadas em `.env.example`, nunca commitadas com valores):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase (frontend)
- `VITE_GAME_SERVER_URL` — WebSocket do servidor Colyseus

## Decisões de design (Fase 0)

- **Rapier `DynamicRayCastVehicleController`**: caminho testado para física de carro divertida no browser; rodas são raios com suspensão, não colliders.
- **Tração traseira + freio de mão que derruba grip lateral traseiro**: base do drift que vira pontuação na Fase 1.
- **Tudo procedural (sem assets 3D externos)**: low-poly + `MeshToonMaterial` com gradient de 4 tons; paleta vibrante.
- **TypeScript 5.9 (não 7.x)**: a série 7 é a reescrita nova; evitada por risco de incompatibilidade de tooling sem ganho aqui.
- **Convidado/conta, economia server-side, anti-cheat**: Fase 1 — nada de economia existe ainda, então nada a proteger.
