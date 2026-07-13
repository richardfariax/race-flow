import * as THREE from 'three';

/**
 * Materiais toon compartilhados (cel-shading em degraus) — cache por cor
 * para não multiplicar materiais/draw state.
 */

let gradientMap: THREE.DataTexture | null = null;

function getGradientMap(): THREE.DataTexture {
  if (!gradientMap) {
    // 4 degraus de luz — visual cartoon clássico
    const data = new Uint8Array([100, 160, 215, 255]);
    gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

export function toonMaterial(color: string): THREE.MeshToonMaterial {
  let mat = cache.get(color);
  if (!mat) {
    mat = new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap() });
    cache.set(color, mat);
  }
  return mat;
}

let vertexMat: THREE.MeshToonMaterial | null = null;

/** Material toon que usa cor por vértice (p/ zebras vermelho/branco). */
export function toonVertexMaterial(): THREE.MeshToonMaterial {
  if (!vertexMat) {
    vertexMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap() });
  }
  return vertexMat;
}

/** Paleta do jogo — vibrante/cartoon */
export const PALETTE = {
  carBody: '#ff6b35',
  carAccent: '#2ec4b6',
  carDark: '#22223b',
  wheel: '#181820',
  tire: '#181820',
  rim: '#d7d9e0',
  rimDark: '#8a8d99',
  wheelHub: '#ffd166',
  glass: '#141a2e',
  headlight: '#fff6cc',
  taillight: '#ff2e46',
  chrome: '#c8ccd6',
  grass: '#7ac74f',
  grassDark: '#5da03f',
  asphalt: '#3c3f57',
  asphaltEdge: '#2c2e40',
  curbRed: '#ef476f',
  curbWhite: '#f8f9fa',
  kerbYellow: '#ffd166',
  ramp: '#9b5de5',
  cone: '#ff9f1c',
  crate: '#c9a227',
  runoff: '#b06a4a',
  sand: '#d9c48a',
} as const;
