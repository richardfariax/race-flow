import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { GameScene } from './game/GameScene';
import { HUD } from './ui/HUD';

export default function App() {
  return (
    <>
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 55, position: [58, 5, -12], near: 0.1, far: 500 }}>
        <color attach="background" args={['#8ed6f0']} />
        <fog attach="fog" args={['#a9e2f5', 120, 380]} />
        <Suspense fallback={null}>
          <Physics timeStep={1 / 60}>
            <GameScene />
          </Physics>
        </Suspense>
      </Canvas>
      <HUD />
    </>
  );
}
