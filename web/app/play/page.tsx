'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const PlayPage = dynamic(() => import('@/pages/PlayPage').then((m) => m.PlayPage), {
  ssr: false,
});

export default function Play() {
  return (
    <Suspense fallback={null}>
      <PlayPage />
    </Suspense>
  );
}
