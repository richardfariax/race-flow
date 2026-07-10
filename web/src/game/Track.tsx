import { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { toonMaterial, PALETTE } from './toon';

/**
 * Pista de teste da Fase 0: anel circular (r 42–58) com muros, rampa e obstáculos.
 * Tudo procedural — zero assets externos.
 */

const ROAD_INNER = 42;
const ROAD_OUTER = 58;
const WALL_OUTER_R = 60;
const WALL_INNER_R = 40;

interface WallSeg {
  position: [number, number, number];
  rotationY: number;
  halfLength: number;
  color: string;
}

function ringWalls(radius: number, count: number): WallSeg[] {
  const segs: WallSeg[] = [];
  // comprimento do segmento com pequena sobreposição para não deixar frestas
  const halfLength = (Math.PI * radius) / count * 1.06;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    segs.push({
      position: [Math.cos(a) * radius, 0.5, Math.sin(a) * radius],
      // muro alinhado à tangente do círculo
      rotationY: -a,
      halfLength,
      color: i % 2 === 0 ? PALETTE.curbRed : PALETTE.curbWhite,
    });
  }
  return segs;
}

const wallGeometry = new THREE.BoxGeometry(1, 1, 1);

function Walls() {
  const segments = useMemo(
    () => [...ringWalls(WALL_OUTER_R, 48), ...ringWalls(WALL_INNER_R, 36)],
    [],
  );
  return (
    <RigidBody type="fixed" colliders={false}>
      {segments.map((s, i) => (
        <group key={i} position={s.position} rotation={[0, s.rotationY, 0]}>
          <CuboidCollider args={[0.3, 0.6, s.halfLength]} />
          <mesh
            castShadow
            receiveShadow
            geometry={wallGeometry}
            material={toonMaterial(s.color)}
            scale={[0.6, 1.2, s.halfLength * 2]}
          />
        </group>
      ))}
    </RigidBody>
  );
}

function Ramp() {
  const angle = -0.28;
  return (
    <RigidBody type="fixed" colliders={false} position={[0, 0, 20]} rotation={[angle, 0, 0]}>
      <CuboidCollider args={[3.5, 0.2, 6]} />
      <mesh castShadow receiveShadow material={toonMaterial(PALETTE.ramp)}>
        <boxGeometry args={[7, 0.4, 12]} />
      </mesh>
    </RigidBody>
  );
}

function Cones() {
  const cones = useMemo(() => {
    const list: [number, number][] = [];
    // fileira de cones na reta de largada, no meio da pista
    for (let i = 0; i < 6; i++) {
      const a = 0.35 + i * 0.09;
      list.push([Math.cos(a) * 50, Math.sin(a) * 50]);
    }
    return list;
  }, []);
  return (
    <>
      {cones.map(([x, z], i) => (
        <RigidBody key={i} position={[x, 0.45, z]} colliders={false} mass={2}>
          <CuboidCollider args={[0.3, 0.45, 0.3]} />
          <mesh castShadow material={toonMaterial(PALETTE.cone)}>
            <coneGeometry args={[0.35, 0.9, 12]} />
          </mesh>
        </RigidBody>
      ))}
      {/* caixotes empilháveis no infield, perto da rampa */}
      {[
        [2, 0.5, 32],
        [-2, 0.5, 32],
        [0, 1.5, 32],
      ].map(([x, y, z], i) => (
        <RigidBody key={`c${i}`} position={[x, y, z]} colliders="cuboid" mass={8}>
          <mesh castShadow material={toonMaterial(PALETTE.crate)}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

function StartLine() {
  return (
    <mesh
      position={[50, 0.02, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={toonMaterial(PALETTE.curbWhite)}
    >
      <planeGeometry args={[16, 1.5]} />
    </mesh>
  );
}

export function Track() {
  return (
    <>
      {/* chão (grama) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[220, 0.5, 220]} position={[0, -0.5, 0]} />
        <mesh receiveShadow position={[0, -0.5, 0]} material={toonMaterial(PALETTE.grass)}>
          <boxGeometry args={[440, 1, 440]} />
        </mesh>
      </RigidBody>

      {/* asfalto (visual; mesma altura do chão) */}
      <mesh
        receiveShadow
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={toonMaterial(PALETTE.asphalt)}
      >
        <ringGeometry args={[ROAD_INNER, ROAD_OUTER, 96]} />
      </mesh>

      <StartLine />
      <Walls />
      <Ramp />
      <Cones />
    </>
  );
}
