import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'login' ? 'Entrar' : 'Criar conta'}</DialogTitle>
          <DialogDescription>
            {supabaseEnabled
              ? 'Use email e senha para sincronizar progresso e moedas.'
              : 'Supabase não configurado — jogue como convidado (progresso não salva).'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {!supabaseEnabled && (
            <p className="text-sm text-destructive">
              Supabase não configurado neste ambiente — jogue como convidado (progresso não salva).
            </p>
          )}
          {mode === 'signup' && (
            <Input
              placeholder="Nick (até 16 caracteres)"
              value={nick}
              maxLength={16}
              onChange={(e) => setNick(e.target.value)}
            />
          )}
          <Input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            placeholder="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={busy || !supabaseEnabled} onClick={() => void submit()}>
            {busy ? '...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                Não tem conta?{' '}
                <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => setMode('signup')}>
                  Criar conta
                </button>
              </>
            ) : (
              <>
                Já tem conta?{' '}
                <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => setMode('login')}>
                  Entrar
                </button>
              </>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
