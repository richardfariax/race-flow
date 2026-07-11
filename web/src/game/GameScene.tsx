import { useRef } from 'react';
import * as THREE from 'three';
import type { CarSpec } from '@shared/cars';
import type { Tuning } from '@shared/tuning';
import type { SpawnPose } from '../state/gameStore';
import { Track } from './Track';
import { Vehicle } from './Vehicle';
import { RemoteCars } from './RemoteCars';
import { FollowCamera } from './FollowCamera';

interface GameSceneProps {
  car: CarSpec;
  tuning?: Tuning;
  spawn: SpawnPose;
  online: boolean;
}

export function GameScene({ car, tuning, spawn, online }: GameSceneProps) {
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
      <Vehicle chassisMeshRef={chassisMeshRef} car={car} tuning={tuning} spawn={spawn} online={online} />
      {online && <RemoteCars />}
      <FollowCamera targetRef={chassisMeshRef} />
    </>
  );
}
