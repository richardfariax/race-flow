import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SiteNavProps {
  onAuthClick?: () => void;
  variant?: 'landing' | 'page';
}

export function SiteNav({ onAuthClick, variant = 'landing' }: SiteNavProps) {
  const { session, profile, signOut } = useAuth();

  return (
    <header
      className={cn(
        'relative z-20 flex items-center justify-between gap-4 px-5 py-4 sm:px-8',
        variant === 'landing' && 'sticky top-0 bg-background/70 backdrop-blur-md',
      )}
    >
      <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-[0.04em] uppercase">
        <span className="size-2.5 rounded-sm bg-primary" aria-hidden />
        Race Flow
      </Link>

      <nav className="flex items-center gap-3 sm:gap-4">
        <Link
          to="/garage"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Garagem
        </Link>
        {session ? (
          <>
            <span className="hidden items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-1 text-sm sm:inline-flex">
              <span className="font-medium">{profile?.nick}</span>
              <span className="text-gold">{profile?.coins ?? 0}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>
              Sair
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" onClick={onAuthClick}>
            Entrar
          </Button>
        )}
      </nav>
    </header>
  );
}
