'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../ui/AuthModal';
import { DailyChallenges, FriendsPanel } from '../ui/Fase2Panels';
import { SiteNav } from '../ui/SiteNav';
import { TRACK } from '@shared/track';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const DEVELOPER_URL = 'https://www.linkedin.com/in/richardfariasss/';

interface LbRow {
  nick: string;
  best_metric: number;
}

function fmtTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

const MODES = [
  {
    id: 'circuit',
    label: 'Corrida online',
    title: 'Grid ao pódio',
    desc: `${TRACK.totalLaps} voltas em ${TRACK.name}. Até 8 pilotos, checkpoints e resultado validado.`,
  },
  {
    id: 'drift',
    label: 'Drift Challenge',
    title: 'Pontue a derrapagem',
    desc: 'Dois minutos de estilo. Combo cresce com ângulo e velocidade — endireita e zera.',
  },
  {
    id: 'timetrial',
    label: 'Time Trial',
    title: 'Contra o relógio',
    desc: 'Solo com fantasma da sua melhor volta. Tempo registrado no ranking global.',
  },
  {
    id: 'practice',
    label: 'Treino livre',
    title: 'Sem cronômetro',
    desc: 'Aprenda traçado, teste setup e aqueça antes de entrar na corrida.',
  },
] as const;

function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full min-h-full overflow-x-hidden overflow-y-auto">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute top-[-80px] left-1/2 h-80 w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(239,68,68,0.35),transparent_70%)] opacity-90 blur-[100px]" />
        <div className="absolute right-[-80px] bottom-[-120px] size-[480px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_70%)] opacity-80 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_0%,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
      </div>
      {children}
    </div>
  );
}

export function LandingPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [lb, setLb] = useState<LbRow[]>([]);
  const [code, setCode] = useState('');

  /** treino livre roda offline (sem conta); todo o resto exige login (server.onJoin usa tuning do banco) */
  const goPlay = (path: string) => {
    if (!session && !path.includes('mode=practice')) {
      setAuthOpen(true);
      return;
    }
    router.push(path);
  };

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('leaderboards')
      .select('nick, best_metric')
      .eq('mode', 'circuit')
      .eq('track', TRACK.id)
      .order('best_metric', { ascending: true })
      .limit(8)
      .then(({ data }) => setLb((data as LbRow[]) ?? []));
  }, []);

  return (
    <SiteShell>
      <SiteNav onAuthClick={() => setAuthOpen(true)} />

      <main className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8">
        <section className="flex min-h-[min(78vh,720px)] items-center justify-center py-14 text-center sm:py-18">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Corrida multiplayer · direto no navegador
            </p>
            <h1 className="font-display mb-5 text-[clamp(3.5rem,11vw,6.5rem)] leading-[0.92] font-bold tracking-[0.04em] uppercase">
              Race Flow
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Física arcade, modelos reais e salas online. Entre como convidado ou crie conta para
              guardar progresso, tuning e pintura.
            </p>
            <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" className="h-12 px-8 text-base" onClick={() => goPlay('/play?mode=circuit')}>
                Jogar agora
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 text-base" onClick={() => router.push('/garage')}>
                Garagem
              </Button>
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-2">
              {MODES.map((m) => (
                <li key={m.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => goPlay(`/play?mode=${m.id}`)}
                  >
                    {m.label}
                    {!session && m.id !== 'practice' ? ' (login)' : ''}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mb-16">
          <div className="mb-6">
            <h2 className="font-display text-3xl font-bold tracking-wide uppercase">Modos de jogo</h2>
            <p className="mt-2 text-muted-foreground">Do grid competitivo ao drift — escolha como quer pilotar hoje.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {MODES.map((mode) => (
              <Card key={mode.id} className="border-white/10 bg-white/[0.03]">
                <CardHeader>
                  <p className="text-xs font-semibold tracking-wider text-primary uppercase">{mode.label}</p>
                  <CardTitle className="font-display text-2xl tracking-wide uppercase">{mode.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">{mode.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button size="sm" variant="ghost" onClick={() => goPlay(`/play?mode=${mode.id}`)}>
                    {!session && mode.id !== 'practice' ? 'Entrar para jogar' : 'Jogar'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-16 grid gap-4 md:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="font-display text-xl tracking-wide uppercase">Jogar com amigos</CardTitle>
              <CardDescription>Crie uma sala privada, compartilhe o código e controle a largada.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => goPlay('/play?mode=circuit&private=1')}>
                Corrida privada
              </Button>
              <Button size="sm" variant="ghost" onClick={() => goPlay('/play?mode=drift&private=1')}>
                Drift privado
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="font-display text-xl tracking-wide uppercase">Entrar com código</CardTitle>
              <CardDescription>Recebeu um convite? Cole o código e entre na sala.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                onKeyDown={(e) => e.key === 'Enter' && code && goPlay(`/play?room=${code}`)}
                placeholder="Código da sala"
              />
              <Button size="default" disabled={!code} onClick={() => goPlay(`/play?room=${code}`)}>
                Entrar
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="mb-16">
          <div className="mb-6">
            <h2 className="font-display text-3xl font-bold tracking-wide uppercase">Desafios diários</h2>
            <p className="mt-2 text-muted-foreground">Metas do dia com recompensas para quem tem conta.</p>
          </div>
          <DailyChallenges />
        </section>

        <section className="mb-16">
          <div className="mb-6">
            <h2 className="font-display text-3xl font-bold tracking-wide uppercase">Amigos</h2>
            <p className="mt-2 text-muted-foreground">Acompanhe pilotos e compare tempos.</p>
          </div>
          <FriendsPanel />
        </section>

        <section className="mb-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-wide uppercase">Ranking global</h2>
              <p className="mt-2 text-muted-foreground">Melhores tempos no modo Corrida.</p>
            </div>
            {!session && (
              <Button size="sm" variant="ghost" onClick={() => setAuthOpen(true)}>
                Entrar para competir
              </Button>
            )}
          </div>
          {lb.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              {lb.map((row, index) => (
                <div
                  key={`${row.nick}-${index}`}
                  className={cn(
                    'grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-white/5 px-4 py-3 last:border-b-0',
                    index === 0 && 'bg-gold/10',
                    index === 1 && 'bg-white/[0.04]',
                    index === 2 && 'bg-primary/10',
                  )}
                >
                  <span className="font-mono text-sm text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-medium">{row.nick}</span>
                  <span className="font-mono text-sm tabular-nums">{fmtTime(row.best_metric)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Nenhum tempo registrado ainda. Seja o primeiro.</p>
          )}
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 border-t border-white/10 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:px-8">
        <span className="font-display tracking-wide uppercase text-foreground">Race Flow</span>
        <a
          className="transition-colors hover:text-foreground"
          href={DEVELOPER_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Desenvolvido por Richard Farias
        </a>
      </footer>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </SiteShell>
  );
}
