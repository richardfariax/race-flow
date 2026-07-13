import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

/**
 * Pipeline de render equilibrado: ACES + sombras suaves + IBL outdoor +
 * sol que segue o carro. Sem pós-processamento extra — leve e sem estouro.
 */

export const sunWorldPos = new THREE.Vector3();
const sunTarget = new THREE.Vector3();
const sunDir = new THREE.Vector3();

/** Configura o renderer (tone mapping, sombras, color space). */
export function RenderPipeline() {
  const gl = useThree((s) => s.gl);

  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.16;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.autoUpdate = true;
  }, [gl]);

  return null;
}

/** IBL outdoor — reflexos PBR sem brilho exagerado. */
export function OutdoorIBL() {
  const { gl, scene } = useThree();

  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    const skyGeo = new THREE.SphereGeometry(1, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color('#4a88cc') },
        mid: { value: new THREE.Color('#94bce4') },
        bot: { value: new THREE.Color('#dce8dc') },
        sunDir: { value: new THREE.Vector3(0.45, 0.68, 0.32).normalize() },
      },
      vertexShader: `varying vec3 vN; void main(){ vN=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir;
        varying vec3 vN;
        void main(){
          float h = vN.y*0.5+0.5;
          vec3 c = mix(bot, mid, smoothstep(0.0,0.45,h));
          c = mix(c, top, smoothstep(0.38,1.0,h));
          float sun = pow(max(dot(vN, sunDir), 0.0), 52.0);
          float glow = pow(max(dot(vN, sunDir), 0.0), 8.0) * 0.24;
          c += vec3(1.0, 0.97, 0.88) * (sun * 0.9 + glow);
          gl_FragColor = vec4(c,1.0);
        }`,
    });
    envScene.add(new THREE.Mesh(skyGeo, skyMat));

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ color: '#4a7a3a' }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    envScene.add(ground);

    const rt = pmrem.fromScene(envScene, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.74;

    skyGeo.dispose();
    skyMat.dispose();
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    pmrem.dispose();

    return () => {
      if (scene.environment === rt.texture) scene.environment = null;
      rt.dispose();
    };
  }, [gl, scene]);

  return null;
}

interface FollowSunProps {
  targetRef: RefObject<THREE.Group | null>;
}

/** Sol direcional com sombra suave — acompanha o carro. */
export function FollowSun({ targetRef }: FollowSunProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  useFrame(() => {
    const mesh = targetRef.current;
    const light = lightRef.current;
    if (!mesh || !light) return;
    mesh.getWorldPosition(sunTarget);
    sunWorldPos.set(sunTarget.x + 68, sunTarget.y + 95, sunTarget.z + 48);
    sunDir.copy(sunWorldPos).sub(sunTarget).normalize();
    light.position.copy(sunWorldPos);
    light.target.position.copy(sunTarget);
    light.target.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={lightRef}
      castShadow
      intensity={3.05}
      color="#fff6e8"
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.00022}
      shadow-normalBias={0.038}
      shadow-radius={3}
      shadow-camera-near={12}
      shadow-camera-far={190}
      shadow-camera-left={-52}
      shadow-camera-right={52}
      shadow-camera-top={52}
      shadow-camera-bottom={-52}
    >
      <object3D attach="target" />
    </directionalLight>
  );
}

/** Sombra de contato leve sob o carro (1 draw call, sem pós-processamento). */
export function ContactShadow({ targetRef }: FollowSunProps) {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.34)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, []);

  useFrame(() => {
    const car = targetRef.current;
    const shadow = ref.current;
    if (!car || !shadow) return;
    car.getWorldPosition(sunTarget);
    shadow.position.set(sunTarget.x, 0.04, sunTarget.z);
    shadow.rotation.set(-Math.PI / 2, 0, Math.atan2(sunDir.x, sunDir.z));
  });

  return (
    <mesh ref={ref} renderOrder={-5}>
      <planeGeometry args={[3.2, 1.55]} />
      <meshBasicMaterial map={tex} transparent opacity={0.75} depthWrite={false} />
    </mesh>
  );
}

/** Preenchimento equilibrado — claridade sem lavar a cena. */
export function FillLights() {
  return (
    <>
      <hemisphereLight args={['#d0e8f8', '#629858', 0.68]} />
      <ambientLight intensity={0.32} color="#f2f6fc" />
      <directionalLight intensity={0.44} color="#b0cce8" position={[-48, 40, -32]} />
      <directionalLight intensity={0.2} color="#98c070" position={[14, 7, -12]} />
    </>
  );
}
