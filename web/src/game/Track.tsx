import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { MODEL_SCALE } from '@shared/track';

/**
 * Nürburgring GP — modelo GLB do circuito real (asfalto, zebras, brita,
 * muros, guard-rails, arquibancadas, terreno), escalado por MODEL_SCALE para
 * casar com a centerline compartilhada (shared/track.ts).
 *
 * Colisão: UM TrimeshCollider explícito com os vértices já transformados
 * (matriz de mundo × MODEL_SCALE baked). Não usamos colliders="trimesh"
 * automático — a detecção por hierarquia falha com a árvore do Sketchfab.
 * A malha merged foi validada offline (raycast em toda a centerline: 0 furos).
 * Exceção: paredes de pinheiros (billboards) ficam fora da física.
 */

const TRACK_URL = '/models/nurburgring_gp.glb';

let dracoLoader: DRACOLoader | null = null;

function extendLoader(loader: GLTFLoader): void {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
  }
  loader.setDRACOLoader(dracoLoader);
}

/** Vegetação em billboard — visual sim, colisão não. */
function isNonCollidable(mesh: THREE.Mesh): boolean {
  const mat = mesh.material as THREE.Material | THREE.Material[];
  const name = Array.isArray(mat) ? mat[0]?.name ?? '' : mat.name;
  return /pinewall/i.test(name) || /pinewall/i.test(mesh.name);
}

interface TrimeshData {
  vertices: Float32Array;
  indices: Uint32Array;
}

/** Vértices em espaço de mundo do jogo (matrixWorld × MODEL_SCALE) merged. */
function bakeTrimesh(scene: THREE.Group): TrimeshData {
  const verts: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || isNonCollidable(mesh)) return;
    const pos = mesh.geometry.attributes.position;
    if (!pos) return;
    const base = verts.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).multiplyScalar(MODEL_SCALE);
      verts.push(v.x, v.y, v.z);
    }
    const index = mesh.geometry.index;
    if (index) {
      for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) idx.push(base + i);
    }
  });
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

/** Sombras + filtro anisotrópico (sem isso o asfalto fica borrado à frente). */
function prepareVisuals(scene: THREE.Group): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      for (const tex of [std.map, std.normalMap, std.roughnessMap]) {
        if (tex && tex.anisotropy < 16) {
          tex.anisotropy = 16; // three limita ao máx. do GPU
          tex.needsUpdate = true;
        }
      }
    }
  });
}

export function Track() {
  const gltf = useLoader(GLTFLoader, TRACK_URL, extendLoader) as GLTF;

  const trimesh = useMemo(() => {
    prepareVisuals(gltf.scene);
    return bakeTrimesh(gltf.scene);
  }, [gltf]);

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={[trimesh.vertices, trimesh.indices]} />
      </RigidBody>
      <primitive object={gltf.scene} scale={MODEL_SCALE} />
    </>
  );
}
