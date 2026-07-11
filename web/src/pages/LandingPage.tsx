import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { AuthModal } from '../ui/AuthModal';
import { TRACK } from '@shared/track';

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

export function LandingPage() {
  const navigate = useNavigate();
  const { session, profile, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [lb, setLb] = useState<LbRow[]>([]);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('leaderboards')
      .select('nick, best_metric')
      .eq('mode', 'circuit')
      .eq('track', TRACK.id)
      .order('best_metric', { ascending: true })
      .limit(5)
      .then(({ data }) => setLb((data as LbRow[]) ?? []));
  }, []);

  return (
    <div className="landing">
      <header className="landing-header">
        <span className="logo">RACE FLOW</span>
        <nav style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link className="btn btn-ghost btn-sm" to="/garage">
            Garagem
          </Link>
          {session ? (
            <>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>
                {profile?.nick} · <b style={{ color: 'var(--accent)' }}>{profile?.coins ?? 0} 🪙</b>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
                Sair
              </button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => setAuthOpen(true)}>
              Entrar / Criar conta
            </button>
          )}
        </nav>
      </header>

      <section className="hero">
        <div className="hero-car">🏎️💨</div>
        <h1>RACE FLOW</h1>
        <p>Corrida multiplayer cartoon no navegador. Derrapa, acelera, capota — sem instalar nada.</p>
        <div className="hero-ctas">
          <button className="btn btn-primary" onClick={() => navigate('/play?mode=circuit')}>
            ▶ Jogar agora
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/play?mode=drift')}>
            Drift Challenge
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/play?mode=practice')}>
            Treino livre
          </button>
        </div>
        <p style={{ fontSize: 13, marginTop: 18 }}>
          Entre como convidado e caia direto na pista. Crie conta para salvar moedas e carros.
        </p>
      </section>

      <section className="section">
        <h2>Modos de jogo</h2>
        <div className="cards">
          <div className="card">
            <span className="tag">Online · 2–8 pilotos</span>
            <h3>🏁 Corrida</h3>
            <p>
              {TRACK.totalLaps} voltas no {TRACK.name}. Largada em grid, checkpoints e pódio
              validados no servidor. Sem trapaça.
            </p>
          </div>
          <div className="card">
            <span className="tag">Online · pontuação</span>
            <h3>🌀 Drift Challenge</h3>
            <p>
              2 minutos, pontue derrapando: ângulo × velocidade × tempo com combo que cresce — e
              zera se você endireitar.
            </p>
          </div>
          <div className="card">
            <span className="tag">Em breve</span>
            <h3>⏱️ Time Trial + Ghost</h3>
            <p>Contra o relógio com o fantasma da sua melhor volta. Chegando na Fase 2.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Jogar com amigos</h2>
        <div className="cards">
          <div className="card">
            <span className="tag">Sala privada</span>
            <h3>🔒 Criar sala</h3>
            <p>Sala fora do matchmaking com código para compartilhar. Você dá a largada.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => navigate('/play?mode=circuit&private=1')}>
                🏁 Corrida
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => navigate('/play?mode=drift&private=1')}>
                🌀 Drift
              </button>
            </div>
          </div>
          <div className="card">
            <span className="tag">Convite</span>
            <h3>🎟️ Entrar com código</h3>
            <p>Recebeu um código de um amigo? Cola aqui e cai direto na sala.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                onKeyDown={(e) => e.key === 'Enter' && code && navigate(`/play?room=${code}`)}
                placeholder="Código da sala"
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                }}
              />
              <button className="btn btn-sm" disabled={!code} onClick={() => navigate(`/play?room=${code}`)}>
                Entrar
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Ranking global · Corrida</h2>
        {lb.length > 0 ? (
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Piloto</th>
                <th>Melhor tempo</th>
              </tr>
            </thead>
            <tbody>
              {lb.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.nick}</td>
                  <td>{fmtTime(r.best_metric)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--muted)' }}>
            Ainda sem tempos registrados — seja o primeiro do ranking. 🏆
          </p>
        )}
      </section>

      <footer className="footer">
        Race Flow — corrida cartoon open web · feito com react-three-fiber + Rapier + Colyseus
      </footer>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
