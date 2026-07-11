import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CARS } from '@shared/cars';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../ui/AuthModal';

/**
 * Garagem/loja. Preço e posse REAIS são validados no servidor (RPC buy_car);
 * aqui é só UI. Convidado vê a loja mas precisa de conta para comprar.
 */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span style={{ width: 86 }}>{label}</span>
      <div className="bar">
        <div style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function GaragePage() {
  const { profile, ownedCarIds, selectedCarId, isGuest, buyCar, selectCar } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
            const accel = car.physics.engineForce / car.physics.mass; // m/s²
            return (
              <div className="card car-card" key={car.id}>
                <div className="car-swatch" style={{ background: car.colors.body }}>
                  <div className="stripe" style={{ background: car.colors.accent }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>{car.name}</h3>
                  <span className="class-chip">Classe {car.cls}</span>
                </div>
                <Stat label="Vel. máx" value={car.maxSpeedKmh / 200} />
                <Stat label="Aceleração" value={accel / 32} />
                <Stat label="Drift" value={1 - car.physics.handbrakeSideFriction} />
                <div style={{ marginTop: 6 }}>
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
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 24 }}>
          Moedas são ganhas correndo online. Compra e saldo são validados no servidor — o preço
          verdadeiro é o do banco, não o da interface. 😉
        </p>
      </div>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
