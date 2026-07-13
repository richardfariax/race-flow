'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CARS } from '@shared/cars';
import {
  TUNE_CATEGORIES,
  TUNE_INFO,
  TUNE_MAX_LEVEL,
  tuneLevel,
  upgradeCost,
  performanceRating,
  matchClass,
  effectiveSpec,
} from '@shared/tuning';
import { useAuth } from '../lib/auth';
import { getLivery, setLivery, type Livery } from '../lib/livery';
import { SiteNav } from '../ui/SiteNav';
import { GarageHeroPreview } from '../game/ShowroomScene';
import { preloadCarModels } from '../game/GlbCar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const PRESET_SWATCHES = [
  '#c4122f',
  '#1e4db7',
  '#111111',
  '#e8e6e1',
  '#2a5cff',
  '#00c896',
  '#ff6b35',
  '#b8bcc4',
  '#ffd166',
  '#7b2cbf',
];

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.round(value * 100));
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full min-h-full overflow-x-hidden overflow-y-auto">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute top-[-180px] right-[-120px] size-[520px] rounded-full bg-primary/25 opacity-40 blur-[90px]" />
        <div className="absolute bottom-[-100px] left-[-80px] size-[420px] rounded-full bg-white/10 opacity-30 blur-[90px]" />
      </div>
      {children}
    </div>
  );
}

export function GaragePage() {
  const router = useRouter();
  const { profile, tunings, selectedCarId, isGuest, upgradeCar, selectCar } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'paint' | 'tune'>('paint');
  const [liveries, setLiveries] = useState<Record<string, Livery>>({});

  const cars = useMemo(() => Object.values(CARS), []);
  const [previewId, setPreviewId] = useState(selectedCarId ?? cars[0]?.id ?? 'golf_gti');
  const activeId = CARS[previewId] ? previewId : cars[0]?.id ?? 'golf_gti';

  useEffect(() => {
    if (selectedCarId && CARS[selectedCarId]) setPreviewId(selectedCarId);
  }, [selectedCarId]);
  const activeCar = CARS[activeId];
  const activeLivery = liveries[activeId] ?? getLivery(activeId);
  const activeTuning = tunings[activeId];
  const eff = effectiveSpec(activeCar, activeTuning);
  const pr = performanceRating(activeCar, activeTuning);
  const cls = matchClass(activeCar, activeTuning);
  const accelScore = 1 - Math.min(0.95, eff.zeroToHundredSec / 30);

  const liveryOf = (carId: string): Livery => liveries[carId] ?? getLivery(carId);

  const paint = (carId: string, patch: Partial<Livery>) => {
    const next = { ...liveryOf(carId), ...patch };
    setLiveries((m) => ({ ...m, [carId]: next }));
    setLivery(carId, next);
  };

  const handleUpgrade = async (carId: string, cat: string) => {
    setBusy(`${carId}:${cat}`);
    setError(null);
    const err = await upgradeCar(carId, cat);
    if (err) setError(err);
    setBusy(null);
  };

  useEffect(() => {
    preloadCarModels(activeId);
    for (const car of cars) preloadCarModels(car.id);
  }, [activeId, cars]);

  return (
    <SiteShell>
      <SiteNav variant="page" />

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-1 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground">
              ← Início
            </Link>
            <h1 className="font-display text-[clamp(2rem,4vw,2.6rem)] font-bold tracking-[0.03em] uppercase">
              Garagem
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {isGuest ? 'Modo local · todos liberados' : `${profile?.coins ?? 0} moedas`}
            </span>
            <Button size="sm" onClick={() => router.push('/play?mode=circuit')}>
              Ir para pista
            </Button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <section className="mb-8 flex flex-col gap-5">
          <div className="relative min-h-[520px] overflow-hidden rounded-3xl border border-white/15 bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(255,255,255,0.06),transparent),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.25))]">
            <Suspense fallback={<div className="h-[min(62vh,560px)] animate-pulse bg-white/5" />}>
              <GarageHeroPreview carId={activeId} bodyColor={activeLivery.body} />
            </Suspense>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-background/90 via-background/55 to-transparent px-5 py-4 sm:px-7">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Classe {cls} · PR {pr}
                </p>
                <h2 className="font-display text-2xl font-bold tracking-wide uppercase sm:text-3xl">
                  {activeCar.name}
                  <span className="ml-2 text-base font-normal text-muted-foreground">{activeCar.year}</span>
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {Math.round(eff.physics.drivetrain.peakTorqueNm * eff.torqueMult)} Nm ·{' '}
                  {Math.round(activeCar.powerCv * eff.torqueMult)} cv · 0–100 {eff.zeroToHundredSec.toFixed(1)}s ·{' '}
                  {Math.round(eff.maxSpeedKmh)} km/h
                </p>
              </div>
              {selectedCarId === activeId ? (
                <Badge className="pointer-events-auto">Em uso</Badge>
              ) : (
                <Button className="pointer-events-auto" onClick={() => void selectCar(activeId)}>
                  Selecionar
                </Button>
              )}
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1" role="listbox" aria-label="Selecionar carro">
            {cars.map((car) => {
              const livery = liveryOf(car.id);
              const selected = car.id === activeId;
              return (
                <button
                  key={car.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    'w-40 shrink-0 overflow-hidden rounded-xl border text-left transition-colors',
                    selected ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]',
                  )}
                  onClick={() => setPreviewId(car.id)}
                >
                  <div
                    className="relative h-20"
                    style={{
                      background: `linear-gradient(160deg, ${livery.body} 0%, color-mix(in srgb, ${livery.body} 55%, #0a0a0c) 100%)`,
                    }}
                  >
                    <span
                      className="absolute top-2 left-2 size-2.5 rounded-full"
                      style={{ background: livery.accent }}
                    />
                    <span className="absolute right-2 bottom-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                      {car.cls}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-3 py-2.5">
                    <strong className="truncate text-sm">{car.name}</strong>
                    <span className="text-xs text-muted-foreground">Classe {car.cls}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="font-display mb-4 text-xl font-bold tracking-wide uppercase">Performance</h3>
            <div className="flex flex-col gap-4">
              <StatBar label="Velocidade máxima" value={eff.maxSpeedKmh / 300} />
              <StatBar label="Aceleração" value={accelScore} />
              <StatBar label="Drift" value={1 - eff.physics.handbrakeSideFriction} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Cada modelo tem física própria — massa, tração, torque e grip mudam na pista de verdade.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'paint' | 'tune')}>
              <TabsList className="mb-4">
                <TabsTrigger value="paint">Pintura</TabsTrigger>
                <TabsTrigger value="tune">Tuning</TabsTrigger>
              </TabsList>

              <TabsContent value="paint" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Carroceria</Label>
                    <input
                      type="color"
                      className="h-10 w-14 cursor-pointer rounded border border-white/15 bg-transparent"
                      value={activeLivery.body}
                      onChange={(e) => paint(activeId, { body: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Detalhe</Label>
                    <input
                      type="color"
                      className="h-10 w-14 cursor-pointer rounded border border-white/15 bg-transparent"
                      value={activeLivery.accent}
                      onChange={(e) => paint(activeId, { accent: e.target.value })}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => paint(activeId, { body: activeCar.colors.body, accent: activeCar.colors.accent })}
                  >
                    Original
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">Presets rápidos</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        'size-8 rounded-full border-2 transition-transform hover:scale-110',
                        activeLivery.body === color ? 'border-foreground' : 'border-transparent',
                      )}
                      style={{ background: color }}
                      aria-label={`Cor ${color}`}
                      onClick={() => paint(activeId, { body: color })}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  A cor da carroceria atualiza o preview acima em tempo real. Detalhe fica salvo para uso futuro.
                </p>
              </TabsContent>

              <TabsContent value="tune" className="flex flex-col gap-3">
                {TUNE_CATEGORIES.map((cat) => {
                  const lv = tuneLevel(activeTuning, cat);
                  const maxed = lv >= TUNE_MAX_LEVEL;
                  const cost = upgradeCost(cat, lv);
                  const key = `${activeId}:${cat}`;
                  return (
                    <div
                      key={cat}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5"
                    >
                      <div>
                        <strong className="text-sm" title={TUNE_INFO[cat].desc}>
                          {TUNE_INFO[cat].name}
                        </strong>
                        <div className="mt-1.5 flex gap-1" aria-hidden>
                          {Array.from({ length: TUNE_MAX_LEVEL }, (_, i) => (
                            <span
                              key={i}
                              className={cn(
                                'size-2 rounded-full',
                                i < lv ? 'bg-primary' : 'bg-white/15',
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={maxed || busy === key}
                        onClick={() => void handleUpgrade(activeId, cat)}
                      >
                        {maxed ? 'MAX' : busy === key ? '...' : isGuest ? '+1' : `+1 · ${cost}`}
                      </Button>
                    </div>
                  );
                })}
                <p className="text-sm text-muted-foreground">
                  Upgrades alteram a física real e o PR.
                  {isGuest ? ' No modo local o tuning é grátis e fica salvo neste navegador.' : ''}
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
