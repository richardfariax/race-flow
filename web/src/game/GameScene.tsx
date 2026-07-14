import { useRef } from 'react';
import type * as THREE from 'three';
import type { CarSpec } from '@shared/cars';
import type { Tuning } from '@shared/tuning';
import type { SpawnPose } from '../state/gameStore';
import { Track } from './Track';
import { Vehicle } from './Vehicle';
import { RemoteCars } from './RemoteCars';
import { FollowCamera } from './FollowCamera';
import { Particles } from './Particles';
import { GhostCar } from './GhostCar';
import { Environment } from './Environment';
import { ContactShadow, FillLights, FollowSun, OutdoorIBL, RenderPipeline } from './Lighting';
import { PostFX } from './PostFX';
import { preloadCarModels } from './GlbCar';

interface GameSceneProps {
  car: CarSpec;
  tuning?: Tuning;
  spawn: SpawnPose;
  online: boolean;
  bodyColor?: string;
  accentColor?: string;
  timetrial?: boolean;
}

export function GameScene({
  car,
  tuning,
  spawn,
  online,
  bodyColor,
  accentColor,
  timetrial = false,
}: GameSceneProps) {
  preloadCarModels(car.id);
  const chassisMeshRef = useRef<THREE.Group>(null);

  return (
    <>
      <RenderPipeline />
      <OutdoorIBL />
      <FillLights />
      <FollowSun targetRef={chassisMeshRef} />
      <ContactShadow targetRef={chassisMeshRef} />
      <Environment />
      <Track />
      <Vehicle
        key={car.id}
        chassisMeshRef={chassisMeshRef}
        car={car}
        tuning={tuning}
        spawn={spawn}
        online={online}
        bodyColor={bodyColor}
        accentColor={accentColor}
        recordGhost={timetrial}
      />
      {online && <RemoteCars />}
      {timetrial && <GhostCar />}
      <Particles />
      <FollowCamera targetRef={chassisMeshRef} />
      <PostFX />
    </>
  );
}
