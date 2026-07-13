'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const GaragePage = dynamic(() => import('@/screens/GaragePage').then((m) => m.GaragePage), {
  ssr: false,
});

export default function Garage() {
  return (
    <Suspense fallback={null}>
      <GaragePage />
    </Suspense>
  );
}
