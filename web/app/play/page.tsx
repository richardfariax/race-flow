'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const PlayPage = dynamic(() => import('@/screens/PlayPage').then((m) => m.PlayPage), {
  ssr: false,
  loading: () => <PageLoading label="Carregando pista…" />,
});

function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-dvh items-center justify-center bg-background text-muted-foreground">
      <p className="font-display text-lg tracking-wide uppercase">{label}</p>
    </div>
  );
}

export default function Play() {
  return (
    <Suspense fallback={<PageLoading label="Carregando pista…" />}>
      <PlayPage />
    </Suspense>
  );
}
