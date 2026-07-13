'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import type { GameMode } from '@shared/protocol';
import { carOrStarter } from '@shared/cars';
import { matchClass } from '@shared/tuning';
import { useAuth } from '../lib/auth';
import { getLivery } from '../lib/livery';
import { spawnSlot } from '@shared/track';
import { useGameStore, type SpawnPose } from '../state/gameStore';
import { NetSession } from '../net/network';
import { GameScene } from '../game/GameScene';
import { HUD } from '../ui/HUD';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const PRACTICE_SPAWN: SpawnPose = spawnSlot(0);

function fmtMetric(mode: string, metric: number): string {
  if (mode === 'drift') return `${metric.toLocaleString('pt-BR')} pts`;
  const m = Math.floor(metric / 60000);
  const s = Math.floor((metric % 60000) / 1000);
  const c = Math.floor((metric % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function Overlay({
  children,
  transparent = false,
  className,
}: {
  children: ReactNode;
  transparent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 px-5 text-center',
        transparent ? 'pointer-events-none bg-transparent' : 'bg-background/85 backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PlayPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { nick, selectedCarId, tunings, token, isGuest } = useAuth();

  const modeParam = params.get('mode') ?? 'circuit';
  const roomCode = params.get('room');
  const createPrivate = params.get('private') === '1';
  const timetrial = modeParam === 'timetrial';
  const online =
    roomCode !== null || modeParam === 'circuit' || modeParam === 'drift' || timetrial;

  const car = useMemo(() => carOrStarter(selectedCarId), [selectedCarId]);
  const tuning = tunings[car.id];
  const livery = useMemo(() => getLivery(car.id), [car.id]);

  const connection = useGameStore((s) => s.connection);
  const connectionError = useGameStore((s) => s.connectionError);
  const phase = useGameStore((s) => s.phase);
  const spawn = useGameStore((s) => s.spawn);
  const results = useGameStore((s) => s.results);
  const mySessionId = useGameStore((s) => s.mySessionId);
  const roomId = useGameStore((s) => s.roomId);
  const hostId = useGameStore((s) => s.hostId);
  const isPrivate = useGameStore((s) => s.isPrivate);
  const resetGame = useGameStore((s) => s.resetGame);

  const sessionRef = useRef<NetSession | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);

  const startJoin = useCallback(() => {
    const session = new NetSession();
    sessionRef.current = session;
    void session.join({
      nick,
      carId: car.id,
      token,
      carClass: matchClass(car, tuning),
      mode: roomCode ? undefined : (modeParam as GameMode),
      createPrivate,
      roomCode: roomCode ?? undefined,
      bodyColor: livery.body,
      accentColor: livery.accent,
    });
    return session;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeParam, roomCode, createPrivate, car.id, livery.body, livery.accent]);

  useEffect(() => {
    if (!online) {
      resetGame();
      useGameStore.getState().setMode('practice');
      useGameStore.getState().setSpawn(PRACTICE_SPAWN);
      return;
    }
    const session = startJoin();
    return () => {
      session.leave();
      resetGame();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, startJoin, attempt]);

  const retry = () => {
    sessionRef.current?.leave();
    resetGame();
    setAttempt((a) => a + 1);
  };

  const ready = spawn !== null && (!online || connection === 'connected');
  const isHost = mySessionId !== '' && mySessionId === hostId;

  return (
    <div className="fixed inset-0">
      {ready && (
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
          }}
          camera={{ fov: 50, position: [58, 5, -12], near: 0.1, far: 1400 }}
        >
          <color attach="background" args={['#7eb4e4']} />
          <fog attach="fog" args={['#a8c4b4', 150, 520]} />
          <Suspense fallback={null}>
            <Physics timeStep={1 / 60}>
              <GameScene
                car={car}
                tuning={tuning}
                spawn={spawn}
                online={online}
                bodyColor={livery.body}
                accentColor={livery.accent}
                timetrial={timetrial}
              />
            </Physics>
          </Suspense>
        </Canvas>
      )}
      <HUD online={online} />

      {timetrial && phase === 'racing' && (
        <Button
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
          onClick={() => sessionRef.current?.send('finishTT')}
        >
          Encerrar sessão
        </Button>
      )}

      {online && connection === 'connecting' && (
        <Overlay>
          <div className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
          <h2 className="font-display text-3xl font-bold tracking-wide uppercase">Conectando ao servidor...</h2>
          <p className="max-w-md text-muted-foreground">
            Se o servidor estava dormindo (plano gratuito), a primeira conexão pode levar até um
            minuto. Segura o volante aí.
          </p>
        </Overlay>
      )}

      {online && connection === 'error' && (
        <Overlay>
          <h2 className="font-display text-3xl font-bold tracking-wide uppercase">Não deu pra conectar</h2>
          <p className="text-muted-foreground">{connectionError}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={retry}>Tentar de novo</Button>
            <Button variant="outline" onClick={() => router.push('/play?mode=practice')}>
              Treino livre (offline)
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/">Voltar</Link>
            </Button>
          </div>
        </Overlay>
      )}

      {online && connection === 'connected' && phase === 'lobby' && (
        <Overlay transparent={!isPrivate}>
          {isPrivate ? (
            <div className="pointer-events-auto flex flex-col items-center gap-4">
              <h2 className="font-display text-3xl font-bold tracking-wide uppercase">Sala privada</h2>
              <p className="text-muted-foreground">Passe o código para os amigos:</p>
              <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-card px-4 py-2.5">
                <code className="font-mono text-2xl font-bold tracking-widest text-primary">{roomId}</code>
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(roomId);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
              {isHost ? (
                <Button onClick={() => sessionRef.current?.send('start')}>Começar corrida</Button>
              ) : (
                <p className="text-muted-foreground">Aguardando o anfitrião dar a largada...</p>
              )}
            </div>
          ) : (
            <h2 className="font-display text-3xl font-bold tracking-wide uppercase drop-shadow-[2px_2px_0_#1a1a2e]">
              Aguardando pilotos...
            </h2>
          )}
        </Overlay>
      )}

      {results && (
        <Overlay>
          <Card className="pointer-events-auto w-full max-w-lg border-white/10 bg-card/95">
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-wide uppercase">
                {results.mode === 'drift' ? 'Resultado do Drift' : 'Resultado da corrida'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Piloto</TableHead>
                    <TableHead>{results.mode === 'drift' ? 'Pontos' : 'Tempo'}</TableHead>
                    <TableHead>Moedas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.entries.map((e) => (
                    <TableRow
                      key={e.sessionId}
                      className={e.sessionId === mySessionId ? 'outline outline-2 outline-primary' : undefined}
                    >
                      <TableCell>{e.position}</TableCell>
                      <TableCell>
                        {e.nick}
                        {e.sessionId === mySessionId ? ' (você)' : ''}
                      </TableCell>
                      <TableCell>{fmtMetric(results.mode, e.metric)}</TableCell>
                      <TableCell>+{e.coins}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isGuest && (
                <p className="mt-3 text-sm text-primary">
                  Você está como convidado — crie uma conta na página inicial para guardar essas
                  moedas.
                </p>
              )}
              <div className="mt-4 flex justify-center gap-3">
                <Button onClick={retry}>Correr de novo</Button>
                <Button variant="outline" asChild>
                  <Link href="/">Menu</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </Overlay>
      )}
    </div>
  );
}
