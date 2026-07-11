import { useState } from 'react';
import { useAuth } from '../lib/auth';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUp, supabaseEnabled } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nick, setNick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const err =
      mode === 'login' ? await signIn(email, password) : await signUp(email, password, nick);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h3>
        {!supabaseEnabled && (
          <p className="error">
            Supabase não configurado neste ambiente — jogue como convidado (progresso não salva).
          </p>
        )}
        {mode === 'signup' && (
          <input
            placeholder="Nick (até 16 caracteres)"
            value={nick}
            maxLength={16}
            onChange={(e) => setNick(e.target.value)}
          />
        )}
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <p className="error">{error}</p>}
        <button className="btn" style={{ width: '100%' }} disabled={busy || !supabaseEnabled} onClick={submit}>
          {busy ? '...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
        <p className="switch">
          {mode === 'login' ? (
            <>
              Não tem conta? <a onClick={() => setMode('signup')}>Criar conta</a>
            </>
          ) : (
            <>
              Já tem conta? <a onClick={() => setMode('login')}>Entrar</a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
