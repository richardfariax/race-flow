import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { AuthModal } from '../ui/AuthModal';

/**
 * Garagem/loja/tuning. Preço, posse e upgrades REAIS são validados no
 * servidor (RPCs buy_car/upgrade_car); aqui é só UI. Cada upgrade muda a
 * física de verdade e sobe o PR — e mudar de classe muda contra quem você corre.
 */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span style={{ width: 86 }}>{label}</span>
      <div className="bar">
        <div style={{ width: `${Math.min(100, Math.round(value * 100))}%` }} />
      </div>
    </div>
  );
}

export function GaragePage() {
  const { profile, ownedCarIds, tunings, selectedCarId, isGuest, buyCar, upgradeCar, selectCar } =
    useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tuningOpen, setTuningOpen] = useState<string | null>(null);

  const handleBuy = async (carId: string) => {
    if (isGuest) {
      setAuthOpen(true);
      return;
    }
    setBusy(carId);
    setError(null);
    const err = await buyCar(carId);
    if (err) setError(err);
    setBusy(null);
  };

  const handleUpgrade = async (carId: string, cat: string) => {
    if (isGuest) {
      setAuthOpen(true);
      return;
    }
    setBusy(`${carId}:${cat}`);
    setError(null);
    const err = await upgradeCar(carId, cat);
    if (err) setError(err);
    setBusy(null);
  };

  return (
    <div className="landing">
      <div className="page">
        <div className="page-header">
          <span className="logo">
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              ← RACE FLOW
            </Link>{' '}
            · Garagem
          </span>
          <span className="coins">
            {isGuest ? 'Convidado (crie conta p/ ganhar moedas)' : `${profile?.coins ?? 0} 🪙`}
          </span>
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="cards">
          {Object.values(CARS).map((car) => {
            const owned = ownedCarIds.includes(car.id);
            const selected = selectedCarId === car.id;
            const tuning = tunings[car.id];
            const eff = effectiveSpec(car, tuning);
            const pr = performanceRating(car, tuning);
            const cls = matchClass(car, tuning);
            const accel = eff.physics.engineForce / eff.physics.mass;
            return (
              <div className="card car-card" key={car.id}>
                <div className="car-swatch" style={{ background: car.colors.body }}>
                  <div className="stripe" style={{ background: car.colors.accent }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>{car.name}</h3>
                  <span className="class-chip">
                    Classe {cls} · PR {pr}
                  </span>
                </div>
                <Stat label="Vel. máx" value={eff.maxSpeedKmh / 220} />
                <Stat label="Aceleração" value={accel / 36} />
                <Stat label="Drift" value={1 - eff.physics.handbrakeSideFriction} />
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {selected ? (
                    <button className="btn btn-sm" disabled>
                      ✓ Selecionado
                    </button>
                  ) : owned ? (
                    <button className="btn btn-sm" onClick={() => void selectCar(car.id)}>
                      Selecionar
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: 14, padding: '8px 14px' }}
                      disabled={busy === car.id}
                      onClick={() => void handleBuy(car.id)}
                    >
                      {busy === car.id ? '...' : `Comprar · ${car.priceCoins} 🪙`}
                    </button>
                  )}
                  {owned && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setTuningOpen(tuningOpen === car.id ? null : car.id)}
                    >
                      🔧 Tuning
                    </button>
                  )}
                </div>

                {owned && tuningOpen === car.id && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10 }}>
                    {TUNE_CATEGORIES.map((cat) => {
                      const lv = tuneLevel(tuning, cat);
                      const maxed = lv >= TUNE_MAX_LEVEL;
                      const cost = upgradeCost(cat, lv);
                      const key = `${car.id}:${cat}`;
                      return (
                        <div
                          key={cat}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '5px 0',
                            fontSize: 13,
                          }}
                        >
                          <span style={{ width: 100 }} title={TUNE_INFO[cat].desc}>
                            {TUNE_INFO[cat].name}
                          </span>
                          <span style={{ letterSpacing: 2, color: 'var(--accent)', width: 46 }}>
                            {'●'.repeat(lv)}
                            <span style={{ opacity: 0.25 }}>{'●'.repeat(TUNE_MAX_LEVEL - lv)}</span>
                          </span>
                          <button
                            className="btn btn-sm"
                            style={{ padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}
                            disabled={maxed || busy === key}
                            onClick={() => void handleUpgrade(car.id, cat)}
                          >
                            {maxed ? 'MAX' : busy === key ? '...' : `+1 · ${cost} 🪙`}
                          </button>
                        </div>
                      );
                    })}
                    <p style={{ color: 'var(--muted)', fontSize: 12, margin: '8px 0 0' }}>
                      Upgrades mudam a física de verdade e o PR — subir de classe muda contra quem
                      você corre.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 24 }}>
          Moedas são ganhas correndo online. Compra, tuning e saldo são validados no servidor — o
          preço verdadeiro é o do banco, não o da interface. 😉
        </p>
      </div>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
