# Desenvolvimento

Como subir o Race Flow na sua máquina e o que o projeto usa por baixo.

## Pré-requisitos

- Node.js 20+
- npm

Supabase é opcional em local: sem ele o jogo roda em modo convidado (sem conta, ranking ou economia persistente).

## Subir em dois terminais

```bash
# 1 — servidor de jogo (Colyseus)
cd server
cp .env.example .env   # opcional
npm install
npm run dev            # ws://localhost:2567
```

```bash
# 2 — cliente
cd web
cp .env.example .env   # opcional
npm install
npm run dev            # http://localhost:3000
```

Abra o endereço do Next.js e jogue. O cliente aponta para `ws://localhost:2567` por padrão.

### Variáveis (só se for usar conta / ranking)

**web/.env**

| Variável | Função |
|----------|--------|
| `NEXT_PUBLIC_GAME_SERVER_URL` | WebSocket do servidor (`ws://localhost:2567`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon |

**server/.env**

| Variável | Função |
|----------|--------|
| `PORT` | Porta do Colyseus (padrão `2567`) |
| `SUPABASE_URL` | Mesmo projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (só no servidor) |

Schema SQL: `supabase/schema.sql` — aplique no SQL Editor do projeto se for persistir dados.

## Estrutura

```
web/       cliente (Next.js + React + Three.js)
server/    sala autoritativa (Colyseus)
shared/    regras e specs compartilhadas (carros, pista, protocolo)
supabase/  schema e RPCs
docs/      documentação
```

## Stack

### Cliente (`web/`)

| Peça | Uso |
|------|-----|
| React 19 + Next.js 15 (App Router) + TypeScript | UI, rotas e bundling |
| React Three Fiber + Three.js | cena 3D |
| Rapier (`@react-three/rapier`) | física do veículo |
| Colyseus SDK | multiplayer em tempo real |
| Supabase JS | auth e dados do jogador |
| Zustand | estado de jogo / HUD |
| Tailwind CSS 4 + shadcn/ui | interface |

### Servidor (`server/`)

| Peça | Uso |
|------|-----|
| Colyseus | salas, sync de estado, validação |
| Express (via Colyseus) | HTTP/WebSocket |
| Supabase (service role) | creditar corrida, tuning, perfil |

### Compartilhado (`shared/`)

Catálogo de carros, drivetrain, freio, pista, tuning, desafios e protocolo de rede — o mesmo código no cliente e no servidor, para a física e as regras não divergirem.

### Infra opcional

- **Supabase** — Auth, Postgres, RLS e RPCs  
- Deploy típico: cliente em Vercel, servidor em Render (ou equivalente)

## Scripts úteis

```bash
cd web && npm run build      # build de produção
cd web && npm run typecheck
cd web && npm run lint
cd server && npm run typecheck
```

## Licença / contribuição

Projeto pessoal. PRs e issues são bem-vindos; mantenha mudanças focadas e tipadas.
