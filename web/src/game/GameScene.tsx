import { useRef } from 'react';
import * as THREE from 'three';
import { Track } from './Track';
import { Vehicle } from './Vehicle';
import { FollowCamera } from './FollowCamera';

export function GameScene() {
  const chassisMeshRef = useRef<THREE.Group>(null);

  return (
    <>
      <hemisphereLight args={['#bfe8ff', '#4e8c3a', 0.9]} />
      <directionalLight
        castShadow
        position={[60, 80, 40]}
        intensity={1.6}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-far={250}
      />
      <Track />
      <Vehicle chassisMeshRef={chassisMeshRef} />
      <FollowCamera targetRef={chassisMeshRef} />
    </>
  );
}
