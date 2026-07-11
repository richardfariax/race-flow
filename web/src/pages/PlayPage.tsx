import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import type { GameMode } from '@shared/protocol';
import { carOrStarter } from '@shared/cars';
import { useAuth } from '../lib/auth';
import { useGameStore, type SpawnPose } from '../state/gameStore';
import { NetSession } from '../net/network';
import { GameScene } from '../game/GameScene';
import { HUD } from '../ui/HUD';

const PRACTICE_SPAWN: SpawnPose = { x: 50, y: 1.2, z: 0, yaw: 0 };

function fmtMetric(mode: string, metric: number): string {
  if (mode === 'drift') return `${metric.toLocaleString('pt-BR')} pts`;
  const m = Math.floor(metric / 60000);
  const s = Math.floor((metric % 60000) / 1000);
  const c = Math.floor((metric % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export function PlayPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { nick, selectedCarId, token, isGuest } = useAuth();

  const modeParam = params.get('mode') ?? 'circuit';
  const online = modeParam === 'circuit' || modeParam === 'drift';
  const car = useMemo(() => carOrStarter(selectedCarId), [selectedCarId]);

  const connection = useGameStore((s) => s.connection);
  const connectionError = useGameStore((s) => s.connectionError);
  const phase = useGameStore((s) => s.phase);
  const spawn = useGameStore((s) => s.spawn);
  const results = useGameStore((s) => s.results);
  const mySessionId = useGameStore((s) => s.mySessionId);
  const resetGame = useGameStore((s) => s.resetGame);

  const sessionRef = useRef<NetSession | null>(null);
  const attempt = useRef(0);

  useEffect(() => {
    if (!online) {
      resetGame();
      useGameStore.getState().setMode('practice');
      useGameStore.getState().setSpawn(PRACTICE_SPAWN);
      return;
    }
    const session = new NetSession();
    sessionRef.current = session;
    void session.join(modeParam as GameMode, { nick, carId: car.id, token });
    return () => {
      session.leave();
      resetGame();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeParam, attempt.current]);

  const ready = spawn !== null && (!online || connection === 'connected');

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {ready && (
        <Canvas shadows dpr={[1, 2]} camera={{ fov: 55, position: [58, 5, -12], near: 0.1, far: 500 }}>
          <color attach="background" args={['#8ed6f0']} />
          <fog attach="fog" args={['#a9e2f5', 120, 380]} />
          <Suspense fallback={null}>
            <Physics timeStep={1 / 60}>
              <GameScene car={car} spawn={spawn} online={online} />
            </Physics>
          </Suspense>
        </Canvas>
      )}
      <HUD online={online} />

      {/* conectando (free tier do Render tem cold start ~1min) */}
      {online && connection === 'connecting' && (
        <div className="overlay">
          <div className="spin" />
          <h2>Conectando ao servidor...</h2>
          <p style={{ color: 'var(--muted)', maxWidth: 420 }}>
            Se o servidor estava dormindo (plano gratuito), a primeira conexão pode levar até um
            minuto. Segura o volante aí.
          </p>
        </div>
      )}

      {online && connection === 'error' && (
        <div className="overlay">
          <h2>Não deu pra conectar 😕</h2>
          <p style={{ color: 'var(--muted)' }}>{connectionError}</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn"
              onClick={() => {
                attempt.current++;
                resetGame();
                void sessionRef.current?.leave();
                const session = new NetSession();
                sessionRef.current = session;
                void session.join(modeParam as GameMode, { nick, carId: car.id, token });
              }}
            >
              Tentar de novo
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/play?mode=practice')}>
              Treino livre (offline)
            </button>
            <Link className="btn btn-ghost" to="/">
              Voltar
            </Link>
          </div>
        </div>
      )}

      {online && connection === 'connected' && phase === 'lobby' && (
        <div className="overlay transparent">
          <h2 style={{ textShadow: '2px 2px 0 #1a1a2e' }}>Aguardando pilotos...</h2>
        </div>
      )}

      {results && (
        <div className="overlay">
          <div className="results-panel">
            <h2 style={{ marginTop: 0 }}>
              {results.mode === 'drift' ? '🌀 Resultado do Drift' : '🏁 Resultado da corrida'}
            </h2>
            <table className="lb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Piloto</th>
                  <th>{results.mode === 'drift' ? 'Pontos' : 'Tempo'}</th>
                  <th>Moedas</th>
                </tr>
              </thead>
              <tbody>
                {results.entries.map((e) => (
                  <tr
                    key={e.sessionId}
                    style={e.sessionId === mySessionId ? { outline: '2px solid var(--accent)' } : undefined}
                  >
                    <td>{e.position}</td>
                    <td>
                      {e.nick}
                      {e.sessionId === mySessionId ? ' (você)' : ''}
                    </td>
                    <td>{fmtMetric(results.mode, e.metric)}</td>
                    <td>+{e.coins} 🪙</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isGuest && (
              <p style={{ color: 'var(--accent)', fontSize: 14 }}>
                Você está como convidado — crie uma conta na página inicial para guardar essas
                moedas.
              </p>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center' }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 16, padding: '12px 22px' }}
                onClick={() => {
                  attempt.current++;
                  sessionRef.current?.leave();
                  resetGame();
                  const session = new NetSession();
                  sessionRef.current = session;
                  void session.join(modeParam as GameMode, { nick, carId: car.id, token });
                }}
              >
                Correr de novo
              </button>
              <Link className="btn btn-ghost" to="/">
                Menu
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
