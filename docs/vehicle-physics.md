# Física veicular — Race Flow

Documento técnico da dirigibilidade do carro local. Cobre a arquitetura, o loop
físico, suspensão, pneus, drift, assistências, motor/transmissão, superfícies,
telemetria e — o mais importante no dia a dia — **como calibrar sem
desestabilizar**.

> Escopo: descreve o que existe hoje no código. Onde algo ainda é _roadmap_
> (não implementado), está marcado como tal. Nada aqui é inventado: os valores
> citados vêm de `shared/cars.ts` e `web/src/game/vehicleTuning.ts`.

---

## 1. Stack e como o carro se move

- **Linguagem:** TypeScript.
- **Render:** Three.js via `@react-three/fiber` (Next.js 15 / React 19).
- **Física:** Rapier (`@react-three/rapier` + `@dimforge/rapier3d-compat`).
- **Multiplayer:** Colyseus (servidor autoritativo) + Supabase.

O carro local é um **`RigidBody` dinâmico** dirigido pelo
**`DynamicRayCastVehicleController` do Rapier** (raycast vehicle, estilo Bullet).
O movimento é **físico de verdade** — forças, torques e impulsos — não
manipulação de transform. Alterar posição/rotação diretamente só acontece em
_reset_, _teleporte_ e _resync_ de rede.

### Limitação importante do modelo de pneu

O `DynamicRayCastVehicleController` calcula as forças de pneu **internamente**
com um modelo simplificado (rigidez de atrito longitudinal/lateral por roda). Ele
**não expõe** slip ratio, curva Pacejka nem um círculo de fricção configurável.
Por isso, o comportamento "simcade" (aderência progressiva, drift, perda de grip)
é obtido **por cima** do controller, com:

- `frictionSlip` e `sideFrictionStiffness` por roda (modulados em tempo real);
- torques e impulsos de assistência aplicados ao chassi (drift, yaw, anti-roll).

Um modelo Pacejka/brush "de verdade" (§7 da spec original) exigiria **substituir
o controller** por forças de pneu próprias — decisão deliberadamente adiada
(ver §16, _roadmap_).

---

## 2. Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `web/src/game/Vehicle.tsx` | Núcleo: controller Rapier, direção, drift, freios, aero, estabilidade, coleta de telemetria. |
| `web/src/game/vehicleTuning.ts` | **Config central tipada** (`BASE`) + `PHYSICS_TIMESTEP`. Todos os parâmetros globais de dirigibilidade. |
| `web/src/game/telemetry.ts` | Singleton mutável de telemetria (sem re-render). |
| `web/src/ui/DebugOverlay.tsx` | Painel de debug (**⌘K**). |
| `web/src/state/debugStore.ts` | Toggle do painel de debug (dev only). |
| `shared/cars.ts` | Parâmetros **por carro**: massa, grip, geometria, drivetrain. |
| `shared/tuning.ts` | Tuning de peças (motor, turbo, pneus, suspensão, peso, câmbio). |
| `shared/drivetrain.ts` | Motor + câmbio automático (curva de torque, marchas, embreagem). |
| `shared/braking.ts` | Freio de serviço e freio de mão. |
| `shared/vehicleDrive.ts` | Intenção de condução (W/S → acelerar/frear/ré/coast). |
| `shared/track.ts` | Centerline, altura/normal do asfalto, `isOnRoad`. |
| `web/src/game/FollowCamera.tsx` | Câmera de perseguição. |
| `web/src/input/input.ts` | Camada de input (teclado hoje; gamepad/touch são extensões). |

Regra de ouro: **parâmetro global de dirigibilidade** vai em `vehicleTuning.ts`;
**parâmetro por carro** vai em `shared/cars.ts`. Nada de número mágico solto na
lógica.

---

## 3. Loop físico

Configurado em `PlayPage.tsx`: `<Physics timeStep={PHYSICS_TIMESTEP}>` com
`PHYSICS_TIMESTEP = 1/60`.

O `<Physics>` do Rapier já garante o que a física estável exige:

- **Passo fixo** (60 Hz) — a dirigibilidade não muda com o FPS.
- **Acumulador de tempo** — passos são consumidos em blocos fixos.
- **Clamp de `dt`** — `clamp(dt, 0, 0.5 s)` protege contra troca de aba / travadas
  (sem espiral de processamento).
- **Interpolação visual** entre estados físicos (render desacoplado da física).

A lógica do veículo roda em `useBeforePhysicsStep` (um passo físico), e a parte
visual/telemetria em `useFrame` (um frame de render). O passo usa `world.timestep`
como `dt` — todos os impulsos são escalados por `dt`, então o comportamento é
independente de FPS.

> **120 Hz?** Possível trocar `PHYSICS_TIMESTEP` para `1/120` (melhora
> estabilidade em alta velocidade), mas **dobra o custo** e os ganhos de drift
> foram calibrados a 60 Hz — exige recalibração com o painel de debug. Só faça
> com drive-test.

---

## 4. Escala do mundo

**1 unidade ≈ 1 metro.** Massas e dimensões são ~SI:

- Raio de roda: 0,29–0,34 m · Entre-eixos: ~2,4–2,8 m · Massa: 840–1725 kg.

⚠️ **Cuidado:** nem tudo é SI. Estes são **unidades internas do raycast vehicle
do Rapier**, calibradas na simulação — **não** aplique valores reais:

- `brakeForce` (42–74) — impulso de freio por roda, **não** Newtons.
- `suspensionStiffness` (58–100) — **não** N/m.
- `frictionSlip` (8–11), `sideFrictionStiffness`, e todos os ganhos de drift.

Ou seja: os "valores de referência" clássicos (mola 28.000–40.000 N/m etc.) **não
se aplicam diretamente** a este projeto.

---

## 5. Chassi e centro de massa

Dois `CuboidCollider` (em `Vehicle.tsx`):

- **Superior** (~18% da massa) — corpo do carro.
- **Lastro baixo e chato** (~82% da massa) em `ballastY = -(chassisHalf.y + 0.28)`
  — puxa o centro de massa para baixo, reduzindo empino e capotamento.

O deslocamento longitudinal do CoM vem de `comBiasZ` por carro (motor dianteiro
vs traseiro). A transferência de peso é **física** (via suspensão), reforçada por
PDs de anti-dive/anti-squat/anti-wheelie no passo.

---

## 6. Suspensão

Suspensão independente por roda via raycast vehicle. Parâmetros em `vehicleTuning.ts`
(`BASE`) e `cars.ts` (`suspensionStiffness`):

| Parâmetro | Valor | Efeito |
|---|---|---|
| `suspensionRest` | 0,52 | comprimento em repouso |
| `maxSuspensionTravel` | 0,16 m | curso útil (batente de mergulho) |
| `suspensionCompression` | 5,4 | amortecimento de compressão |
| `suspensionRelaxation` | 5,8 | amortecimento de retorno |
| `frontSuspensionMul` / `rearSuspensionMul` | 1,05 / 1,0 | rigidez relativa por eixo |
| `maxSuspensionForce` | `mass × 12` | teto da mola (batente rígido) |

A carga vertical por roda (para telemetria e sensação) é lida de
`controller.wheelSuspensionForce(i)`.

> _Roadmap:_ barra estabilizadora / anti-roll explícito por eixo configurável.
> Hoje o anti-capotamento vem do lastro baixo + estabilização alinhada à normal
> do asfalto (§9).

---

## 7. Pneus, slip e forças

O controller resolve as forças de pneu. O que o código **modula** em cima:

- **`frictionSlip` traseiro** cai com freio de mão (`handbrakeSlipFactor = 0.12`,
  quase lock) e no _hold_ de drift (traseira escorrega, mas não zera).
- **`sideFrictionStiffness`** traseiro interpola para `handbrakeSideFriction`
  (por carro) durante o drift; dianteiro ganha `driftFrontGripMul = 1.14` (a
  frente responde enquanto a traseira desliza).

Slip medido (em `Vehicle.tsx`), numericamente estável perto de 0:

```
signedSlip = atan2(velocidadeLateral, velocidadeLongitudinal)   // com sinal
slipAngle  = atan2(|lateral|, |longitudinal| + 0.5)             // magnitude, só acima de 2 m/s
```

Forças por roda expostas para telemetria: `wheelForwardImpulse` (longitudinal) e
`wheelSideImpulse` (lateral).

> _Roadmap:_ elipse de fricção explícita — hoje o acoplamento
> tração×curva emerge do controller + assistências, não de um limite
> `(Fx/Xmax)² + (Fy/Ymax)² ≤ 1`.

---

## 8. Direção

Previsível e progressiva (`vehicleTuning.ts`):

- **Sensível à velocidade:** `steerSpeedFalloff = 0.078` reduz o ângulo máx. com a
  velocidade; em alta ainda entra `highSpeedDamp`. Base de lock por carro em
  `maxSteerRad` (0,40–0,52 rad).
- **Teclado (on/off) rampado:** `steerInputRate = 2.85` (virar) e
  `steerReturnRate = 4.4` (retorno self-aligning, mais rápido). Nunca alterna
  instantaneamente esquerda↔direita.
- **Corte em derrapagem:** `steerSlipCutAngle = 0.38` reduz o lock quando o carro
  já está de lado (evita oversteer em curva normal).

> _Roadmap:_ deadzone/expo/curva de resposta de gamepad e gatilhos analógicos
> (a camada `InputSource` já está pronta para receber isso sem tocar na física).

---

## 9. Drift e assistências

O drift **não** é rotação artificial: é consequência de grip traseiro reduzido +
transferência de peso + torque, com assistências moderadas para ficar acessível.

Estados (leitura/telemetria; **não** dirigem a física):
`GRIP → DRIFT_ENTRY → DRIFT → DRIFT_RECOVERY`, mais `AIRBORNE` e `RESETTING`.

Fluxo:

1. **Entrada** (`driftEntryGain`): freio de mão trava a traseira (só eixo
   traseiro) e abre o ângulo na direção do volante — sem rodar instantaneamente.
2. **Sustentação** (`driftHold` 0..1): ao soltar o freio de mão, o _hold_ mantém a
   traseira leve. O **acelerador** controla quanto a traseira abre
   (`driftLatSustain`, `driftVelCarry`); o **contra-esterço** controla o ângulo.
3. **Assistências** (PD, com teto):
   - `driftCounterKp/Kd` — segura o ângulo de deslize com contra-esterço + gás.
   - `driftYawKp/Kd` — PD de guinada (o volante pede _rotação_, não ângulo
     absoluto).
   - `driftSteerAuthority = 0.4` — limita a autoridade do volante (lock cheio ≠
     spin).
   - Caps: `maxDriftSlipAtSpeed` (ângulo máx. por velocidade) e `maxYawAtSpeed`
     (teto de guinada) impedem rotação descontrolada, **sem** virar trilho: erros
     grandes ainda rodam o carro.
4. **Recuperação** (`driftHoldDecay`): soltar o gás / endireitar / frear traz o
   grip de volta progressivamente (com histerese, sem chicote).

O torque total de assistência aplicado por passo é somado em `assistYaw`
(telemetria) — útil para ver se a assistência está "dirigindo sozinha" (não deve).

Estabilização alinhada ao terreno: um torque anti-roll (`stabP`, `stabD`) alinha o
carro à **normal do asfalto** (`surfaceAt`), não ao eixo Y do mundo — o carro
acompanha o relevo sem capotar em meio-fio.

---

## 10. Motor e transmissão (`shared/drivetrain.ts`)

- Curva de torque por RPM (sobe até o pico, cai suave até o corte).
- Câmbio **automático** (up/downshift por RPM/velocidade), com cooldown e duração
  de troca.
- **Embreagem** patina na largada (o motor sobe de giro antes das rodas).
- Freio-motor leve em coast (`engineBrakeFactor`).
- Força na roda = torque × marcha × final × eficiência ÷ raio.
- `driveBias` por carro: 0 = RWD, 1 = FWD, ~0.4 = AWD.

> _Roadmap:_ diferencial LSD/aberto/travado configurável e distribuição de torque
> entre eixos por preset. Hoje o split é fixo por `driveBias`.

---

## 11. Freios (`shared/braking.ts`)

- **Serviço (S):** 4 rodas, `frontBrakeBias = 0.58`, reforço em baixa velocidade,
  alívio perto do batente de mergulho (`frontCompression`).
- **Freio de mão (Espaço):** só eixo traseiro; trava as rodas (lock + fumaça) e
  abre o drift, sem transformar o carro em pião.
- **Freio-motor:** ver §10.

---

## 12. Aerodinâmica

Hoje: **arrasto** apenas — `speedDragForce = rolling + Cd·v²` (`dragCoeff` por
carro), aplicado contra a velocidade; calibra a vmax.

> _Roadmap:_ **downforce** proporcional a v² aplicado em posição coerente
> (sem esconder problemas de aderência).

---

## 13. Superfícies

`shared/track.ts` distingue asfalto de fora-da-pista:

- `isOnRoad(x,z)` — asfalto + zebra; fora disso, `offRoadEngineFactor` e
  `offRoadBrakeFactor` reduzem tração/freio.
- Cada roda detecta sua superfície individualmente (telemetria `wheel.onRoad`) —
  duas rodas na grama já produzem assimetria.
- Fumaça/poeira muda de cor conforme asfalto vs terra.

> _Roadmap:_ tabela por superfície (asfalto seco/molhado, grama, terra, cascalho,
> meio-fio) com multiplicador de aderência, rolamento, som e partículas por tipo.

---

## 14. Telemetria e painel de debug

Ative com **⌘K** (Cmd/Ctrl+K), **só em desenvolvimento** — em produção o
componente é um no-op (não monta nem escuta teclas). O painel (`DebugOverlay.tsx`)
mostra, em tempo real: FPS, frequência da física, velocidade (km/h e m/s), marcha,
RPM, acelerador/freio/freio-de-mão, ângulo de direção (roda e input), slip angle,
drift angle, yaw rate, drift hold, torque de assistência, estado, rodas no solo, e
por roda: carga, compressão, força longitudinal e lateral.

Custo: a coleta só roda com o painel aberto (`useDebugStore.getState().enabled`) —
**zero overhead** em produção.

> **Wireframe de colliders:** foi intencionalmente **removido** do toggle. O
> `<Physics debug>` do Rapier redesenha _todos_ os colliders por frame, incluindo
> o trimesh da pista inteira (Nürburgring de 5 km) — isso trava o jogo ao abrir.
> O painel numérico é leve e abre instantâneo. Se precisar ver colliders no
> futuro, use um toggle separado ciente do custo.

Fonte dos dados: singleton `telemetry` (escrito no `useFrame` do `Vehicle`,
lido pelo overlay via rAF ~12 Hz).

---

## 15. Como criar um novo preset

Ainda **não** há sistema de presets nomeados (ARCADE/SIMCADE/DRIFT). O caminho
atual para variar a sensação é por **carro** (`shared/cars.ts`) e por **tuning**
(`shared/tuning.ts`). Para um preset global no futuro, o encaixe natural é:

1. Transformar `BASE` (em `vehicleTuning.ts`) de `const` único em um `Record` de
   presets `{ ARCADE, SIMCADE, DRIFT }`, mantendo a mesma forma tipada.
2. Selecionar o preset ativo por estado (ex.: `debugStore`/`gameStore`) e passá-lo
   ao `Vehicle`.
3. Manter `SIMCADE` como padrão.

Enquanto isso não existe, calibre pelos parâmetros abaixo.

---

## 16. Como calibrar sem desestabilizar

Mude **um** parâmetro por vez, com o painel de debug aberto, e teste os 5
cenários (reta, freada, slalom, curva longa, drift). Guia por sintoma:

| Sintoma | Parâmetro | Direção |
|---|---|---|
| Roda fácil demais ao iniciar drift | `driftSteerAuthority`, `maxYawAtSpeed` (base) | reduzir |
| Traseira "presa", não drifta | `handbrakeSideFriction` (por carro), `handbrakeSlipFactor` | reduzir |
| Sensação de gelo no drift | `driftCounterKp`, `driftFrontGripMul` | aumentar leve |
| Assistência "dirige sozinha" | `driftYawKp`, `driftCounterKp` | reduzir |
| Oversteer em curva normal | `steerSlipCutAngle` | reduzir |
| Direção nervosa em alta | `steerSpeedFalloff`, `highSpeedSteerGain` | aumentar |
| Freada empina / mergulha demais | `brakePitchKp/Kd`, `frontBrakeBias` | ajustar |
| Capota em meio-fio | `stabP`/`stabD`, altura do lastro (`ballastY`) | aumentar / abaixar |
| Grip geral | `frictionSlip` (por carro) | ajustar |

**Não** faça: forças ilimitadas, alterar transform para esconder problema de
física, criar objetos por frame, depender de FPS, silenciar erros.

---

## 17. Roadmap (etapas de "feel" — exigem drive-test)

Mudam a sensação do carro e precisam de calibração dirigindo:

1. **Downforce** moderado (§12).
2. **Tabela por superfície** com multiplicadores de aderência por roda (§13).
3. **Acoplamento estilo elipse de fricção** sobre motor/freio/lateral (§7).
4. **LSD** e distribuição de torque por preset (§10).
5. **Controle no ar** (reduzir forças de pneu, limitar rotação, impacto estável).
6. **Presets** nomeados (§15) e ajustes de câmera/efeitos.

Cada item deve entrar em iteração isolada, validando `typecheck`/`lint`/`build` e
com você dirigindo para calibrar.
