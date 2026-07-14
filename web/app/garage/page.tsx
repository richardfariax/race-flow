'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const GaragePage = dynamic(() => import('@/screens/GaragePage').then((m) => m.GaragePage), {
  ssr: false,
  loading: () => <PageLoading label="Carregando garagem…" />,
});

function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-dvh items-center justify-center bg-background text-muted-foreground">
      <p className="font-display text-lg tracking-wide uppercase">{label}</p>
    </div>
  );
}

export default function Garage() {
  return (
    <Suspense fallback={<PageLoading label="Carregando garagem…" />}>
      <GaragePage />
    </Suspense>
  );
}
