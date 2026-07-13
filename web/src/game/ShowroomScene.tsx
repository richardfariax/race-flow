import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { carOrStarter } from '@shared/cars';
import { useCarParts } from './GlbCar';
import { STATIC_WHEEL_Y } from './carVisuals';
import { OutdoorIBL } from './Lighting';
import { asphaltMaterial } from './trackTextures';

const AUTO_RESUME_MS = 2800;
const AUTO_SPIN = 0.28;

function ShowroomRenderSetup() {
  const gl = useThree((s) => s.gl);

  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [gl]);

  return null;
}

function ShowroomLights() {
  return (
    <>
      <ambientLight intensity={0.28} color="#e8ecf4" />
      <hemisphereLight args={['#dce6f4', '#2a2e38', 0.45]} />
      <directionalLight
        castShadow
        intensity={1.85}
        color="#fff6ea"
        position={[6, 12, 7]}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.00018}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <directionalLight intensity={0.55} color="#a8c4e8" position={[-6, 5, -2]} />
      <directionalLight intensity={0.35} color="#ffffff" position={[0, 4, -8]} />
      <pointLight intensity={0.6} color="#ffe8cc" position={[2.5, 2, 3.5]} distance={14} decay={2} />
    </>
  );
}

function ShowroomFloor() {
  const material = useMemo(() => {
    const mat = asphaltMaterial();
    mat.map?.repeat.set(8, 8);
    mat.normalMap?.repeat.set(8, 8);
    mat.color = new THREE.Color('#5c5f66');
    return mat;
  }, []);

  useEffect(() => {
    return () => {
      material.map?.dispose();
      material.normalMap?.dispose();
      material.dispose();
    };
  }, [material]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow material={material}>
      <planeGeometry args={[40, 40]} />
    </mesh>
  );
}

/**
 * Showroom: piso em Y=0. Hubs sobem para o raio do pneu, para o carro
 * apoiar no asfalto sem cortar a roda.
 */
function ShowroomDriver({ carId, bodyColor }: { carId: string; bodyColor: string }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const pivotRef = useRef<THREE.Group>(null);
  const yawRef = useRef(0.55);
  const autoRef = useRef(true);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const resumeAtRef = useRef(0);

  const car = carOrStarter(carId);
  const { body, wheels } = useCarParts(carId, bodyColor);
  // Body/rodas usam STATIC_WHEEL_Y; sobe o grupo p/ o pneu tocar o asfalto (Y=0).
  const liftY = car.geometry.wheelRadius - STATIC_WHEEL_Y;

  useLayoutEffect(() => {
    invalidate();
  }, [carId, bodyColor, invalidate]);

  useEffect(() => {
    const el = gl.domElement;

    const pauseAuto = () => {
      autoRef.current = false;
      resumeAtRef.current = performance.now() + AUTO_RESUME_MS;
      invalidate();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      draggingRef.current = true;
      lastXRef.current = e.clientX;
      pauseAuto();
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      yawRef.current += dx * 0.008;
      if (pivotRef.current) pivotRef.current.rotation.y = yawRef.current;
      resumeAtRef.current = performance.now() + AUTO_RESUME_MS;
      invalidate();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      resumeAtRef.current = performance.now() + AUTO_RESUME_MS;
      invalidate();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      pauseAuto();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, invalidate]);

  useFrame((_, delta) => {
    const pivot = pivotRef.current;
    if (!pivot) return;

    if (!autoRef.current && performance.now() >= resumeAtRef.current && !draggingRef.current) {
      autoRef.current = true;
    }

    if (autoRef.current) {
      yawRef.current += delta * AUTO_SPIN;
    }

    pivot.rotation.y = yawRef.current;
    invalidate();
  });

  return (
    <group ref={pivotRef} position={[0, liftY, 0]} rotation={[0, yawRef.current, 0]}>
      <primitive object={body} />
      {car.geometry.wheelHubs.map(([x, z], index) => (
        <group key={index} position={[x, STATIC_WHEEL_Y, z]}>
          <primitive object={wheels[index]} />
        </group>
      ))}
    </group>
  );
}

function ShowroomEnvBoost() {
  const scene = useThree((s) => s.scene);

  useLayoutEffect(() => {
    const prev = scene.environmentIntensity;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environmentIntensity = prev;
    };
  }, [scene]);

  return null;
}

function ShowroomCamera() {
  const camera = useThree((s) => s.camera);

  useLayoutEffect(() => {
    camera.position.set(3.8, 1.85, 4.8);
    camera.lookAt(0, 0.85, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

export function GarageHeroPreview({ carId, bodyColor }: { carId: string; bodyColor: string }) {
  return (
    <div className="h-[min(62vh,560px)] cursor-grab touch-none active:cursor-grabbing">
      <Canvas
        shadows
        dpr={[1, 1.25]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [3.8, 1.85, 4.8], fov: 32, near: 0.1, far: 60 }}
      >
        <ShowroomRenderSetup />
        <ShowroomCamera />
        <OutdoorIBL />
        <ShowroomEnvBoost />
        <ShowroomLights />
        <Suspense fallback={null}>
          <ShowroomDriver carId={carId} bodyColor={bodyColor} />
          <ShowroomFloor />
        </Suspense>
      </Canvas>
    </div>
  );
}
