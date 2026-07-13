import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Race Flow',
  description: 'Corrida multiplayer no navegador. Entra, escolhe o carro e vai — sem instalar nada.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
