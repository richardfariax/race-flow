import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { CAR_VISUALS, WHEEL_REST_Y, carVisual, type CarVisualConfig } from './carVisuals';

/**
 * Loader de carros GLB.
 *
 * Cuidados críticos:
 * 1) Escala do modelo deve ir para a carroceria (attach / bake) — senão só
 *    as rodas (extraídas em world space) ficam visíveis.
 * 2) Detecção de roda NÃO pode casar substrings tipo "rim" dentro de "Trim".
 */

const WHEEL_KEYS = ['FL', 'FR', 'RL', 'RR'] as const;

/** Nomes/materiais que são de verdade roda/pneu/aro (com limites de palavra). */
const WHEEL_STRICT_RE =
  /(?:^|[^a-z0-9])(?:wheel|tire|tyre|pokrishka|pokr|llanta|roda|3dwheel)(?:[^a-z0-9]|$)/i;
/** Aro/disco/hub — evita "Trim" (contém "rim") e "Washer" etc. */
const WHEEL_PART_RE =
  /(?:^|[^a-z0-9])(?:rim|disk|disc|hub|bolt)(?:[^a-z0-9]|$)|tire.?disk|tire.?hub|tnrrims|_rim|rim_|mat_tire|wheel1a/i;
const NOT_WHEEL_RE =
  /steering|volante|caliper|calliper|breaks?|brake(?!.*(?:disk|disc))|trim|fender|bumper|door|boot|hood|bonnet|splitter|interior|chassis|badge|glass|window|light|engine|grille|carbon(?!.*rim)/i;

/** Mesh maior que isso (m, já escalado) não é roda isolada — só pneu fundido. */
const MAX_SINGLE_WHEEL_SIZE = 1.15;
/** Distância máxima do hub para considerar o mesh uma roda (m). */
const MAX_HUB_DIST = 0.85;

let dracoLoader: DRACOLoader | null = null;

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
  }
  return dracoLoader;
}

function extendGltfLoader(loader: GLTFLoader): void {
  loader.setDRACOLoader(getDracoLoader());
}

function nearestWheelIndex(hubs: CarVisualConfig['hubs'], x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 4; i++) {
    const h = hubs[i];
    const d = (x - h[0]) ** 2 + (z - h[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function hubDistanceSq(hubs: CarVisualConfig['hubs'], x: number, y: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const h = hubs[i];
    const d = (x - h[0]) ** 2 + (y - h[1]) ** 2 + (z - h[2]) ** 2;
    if (d < best) best = d;
  }
  return best;
}

function readAttr(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  itemSize: number,
  out: number[],
) {
  for (let k = 0; k < itemSize; k++) out[k] = attr.getComponent(index, k);
}

function extractWheelGeometry(
  geometry: THREE.BufferGeometry,
  hubs: CarVisualConfig['hubs'],
  hubIndex: number,
): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  if (!pos) return new THREE.BufferGeometry();

  const idx = geometry.index;
  const hub = hubs[hubIndex];
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const keptVerts: number[] = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    const cx = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
    const cz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
    if (nearestWheelIndex(hubs, cx, cz) === hubIndex) {
      keptVerts.push(i0, i1, i2);
    }
  }

  const out = new THREE.BufferGeometry();
  if (keptVerts.length === 0) return out;

  const tmp: number[] = [];
  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.attributes[name];
    const itemSize = attr.itemSize;
    const arr = new Float32Array(keptVerts.length * itemSize);
    for (let i = 0; i < keptVerts.length; i++) {
      readAttr(attr, keptVerts[i], itemSize, tmp);
      if (name === 'position') {
        tmp[0] -= hub[0];
        tmp[1] -= hub[1];
        tmp[2] -= hub[2];
      }
      for (let k = 0; k < itemSize; k++) arr[i * itemSize + k] = tmp[k] ?? 0;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }

  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

/** Centraliza geometria já em world space no hub indicado (mesh de uma roda só). */
function centerGeometryOnHub(
  geometry: THREE.BufferGeometry,
  hub: readonly [number, number, number],
): THREE.BufferGeometry {
  const geo = geometry.clone();
  geo.translate(-hub[0], -hub[1], -hub[2]);
  geo.computeBoundingSphere();
  return geo;
}

export interface PreparedCar {
  body: THREE.Group;
  wheels: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  paintMaterials: THREE.MeshStandardMaterial[];
}

function meshLabel(obj: THREE.Object3D): string {
  const parts = [obj.name || ''];
  if (obj instanceof THREE.Mesh) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) parts.push(m?.name || '');
  }
  return parts.join(' ');
}

function looksLikeWheelName(label: string, cfg: CarVisualConfig): boolean {
  if (NOT_WHEEL_RE.test(label)) return false;
  if (cfg.wheelNameRe.test(label)) return true;
  if (WHEEL_STRICT_RE.test(label) || WHEEL_PART_RE.test(label)) return true;
  return false;
}

function worldBBox(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox!.clone();
  box.applyMatrix4(mesh.matrixWorld);
  return box;
}

function isWheelMesh(mesh: THREE.Mesh, cfg: CarVisualConfig): boolean {
  const label = meshLabel(mesh);
  if (!looksLikeWheelName(label, cfg)) return false;

  const box = worldBBox(mesh);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = Math.sqrt(hubDistanceSq(cfg.hubs, center.x, center.y, center.z));

  // Pneu fundido (4 rodas num mesh): grande no XZ, mas nome de tire/wheel
  const fusedTire =
    WHEEL_STRICT_RE.test(label) &&
    maxDim > MAX_SINGLE_WHEEL_SIZE &&
    Math.max(size.x, size.z) > 1.5;

  if (fusedTire) return true;

  // Roda isolada: perto de um hub e tamanho de pneu/aro
  if (dist > MAX_HUB_DIST) return false;
  if (maxDim > MAX_SINGLE_WHEEL_SIZE) return false;
  if (maxDim < 0.05) return false; // parafuso solto demais / lixo
  return true;
}

function prepareCar(scene: THREE.Group, cfg: CarVisualConfig): PreparedCar {
  const root = scene.clone(true);
  root.scale.setScalar(cfg.scale);
  root.updateMatrixWorld(true);

  const body = new THREE.Group();
  body.name = 'CarBody';
  const wheels: PreparedCar['wheels'] = [
    new THREE.Group(),
    new THREE.Group(),
    new THREE.Group(),
    new THREE.Group(),
  ];
  wheels.forEach((w, i) => {
    w.name = `CarWheel_${WHEEL_KEYS[i]}`;
  });

  const wheelMeshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      m.envMapIntensity = /glass|carpaint|chrome|metal|paint|carbon/i.test(m.name) ? 1.28 : 0.58;
      if (/glass|window/i.test(m.name) && m.opacity >= 1) {
        m.transparent = true;
        m.opacity = 0.45;
        m.depthWrite = false;
      }
    }

    if (isWheelMesh(obj, cfg)) wheelMeshes.push(obj);
  });

  for (const mesh of wheelMeshes) {
    const worldGeo = mesh.geometry.clone();
    worldGeo.applyMatrix4(mesh.matrixWorld);
    worldGeo.computeBoundingBox();

    const box = worldGeo.boundingBox!;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const label = meshLabel(mesh);
    const fused =
      maxDim > MAX_SINGLE_WHEEL_SIZE ||
      (WHEEL_STRICT_RE.test(label) && Math.max(size.x, size.z) > 1.5);

    if (fused) {
      for (let i = 0; i < 4; i++) {
        const part = extractWheelGeometry(worldGeo, cfg.hubs, i);
        if (!part.attributes.position || part.attributes.position.count < 3) {
          part.dispose();
          continue;
        }
        const m = new THREE.Mesh(part, mesh.material);
        m.castShadow = true;
        m.receiveShadow = true;
        m.name = `${mesh.name}_${WHEEL_KEYS[i]}`;
        wheels[i].add(m);
      }
    } else {
      const hubIndex = nearestWheelIndex(cfg.hubs, center.x, center.z);
      const hub = cfg.hubs[hubIndex];
      const part = centerGeometryOnHub(worldGeo, hub);
      const m = new THREE.Mesh(part, mesh.material);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `${mesh.name}_${WHEEL_KEYS[hubIndex]}`;
      wheels[hubIndex].add(m);
    }

    worldGeo.dispose();
    mesh.parent?.remove(mesh);
  }

  // Preserva transformada world (inclui escala do root) ao reparentar.
  // Sem attach, a carroceria ficava na escala 1 do modelo cru (~4 cm).
  const remaining = [...root.children];
  for (const child of remaining) {
    body.attach(child);
  }

  body.position.y = WHEEL_REST_Y - cfg.hubs[0][1];

  return { body, wheels, paintMaterials: [] };
}

const preparedCache = new Map<string, PreparedCar>();

function getPrepared(carId: string, scene: THREE.Group): PreparedCar {
  let cached = preparedCache.get(carId);
  if (!cached) {
    cached = prepareCar(scene, carVisual(carId));
    preparedCache.set(carId, cached);
  }
  return cached;
}

function clonePrepared(src: PreparedCar, paintRe: RegExp): PreparedCar {
  const body = src.body.clone(true);
  const wheels: PreparedCar['wheels'] = [
    src.wheels[0].clone(true),
    src.wheels[1].clone(true),
    src.wheels[2].clone(true),
    src.wheels[3].clone(true),
  ];
  const paintMaterials: THREE.MeshStandardMaterial[] = [];

  const rebindPaint = (obj: THREE.Object3D) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => {
        const c = m.clone();
        if (c instanceof THREE.MeshStandardMaterial && paintRe.test(c.name)) {
          paintMaterials.push(c);
        }
        return c;
      });
    } else {
      obj.material = obj.material.clone();
      if (obj.material instanceof THREE.MeshStandardMaterial && paintRe.test(obj.material.name)) {
        paintMaterials.push(obj.material);
      }
    }
  };
  body.traverse(rebindPaint);

  return { body, wheels, paintMaterials };
}

/** Uma instância pronta (body + 4 rodas) por carro. */
export function useCarParts(carId: string, bodyColor?: string): PreparedCar {
  const cfg = carVisual(carId);
  const gltf = useLoader(GLTFLoader, cfg.url, (loader) => {
    extendGltfLoader(loader as GLTFLoader);
  });

  const prepared = useMemo(
    () => clonePrepared(getPrepared(carId, gltf.scene), cfg.paintNameRe),
    [carId, gltf.scene, cfg.paintNameRe],
  );

  useLayoutEffect(() => {
    if (!bodyColor) return;
    const color = new THREE.Color(bodyColor);
    for (const m of prepared.paintMaterials) {
      m.color.copy(color);
      m.needsUpdate = true;
    }
  }, [prepared, bodyColor]);

  return prepared;
}

export function preloadCar(carId: string): void {
  const cfg = carVisual(carId);
  useLoader.preload(GLTFLoader, cfg.url, (loader) => {
    extendGltfLoader(loader as GLTFLoader);
  });
}

export function preloadCarModels(selectedId?: string): void {
  preloadCar(selectedId && CAR_VISUALS[selectedId] ? selectedId : 'golf_gti');
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    preparedCache.clear();
  });
}
