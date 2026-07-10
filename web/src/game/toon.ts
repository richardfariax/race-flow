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

/** Paleta do jogo — vibrante/cartoon */
export const PALETTE = {
  carBody: '#ff6b35',
  carAccent: '#2ec4b6',
  carDark: '#22223b',
  wheel: '#2b2d42',
  wheelHub: '#ffd166',
  grass: '#7ac74f',
  grassDark: '#5da03f',
  asphalt: '#4a4e69',
  curbRed: '#ef476f',
  curbWhite: '#f8f9fa',
  ramp: '#9b5de5',
  cone: '#ff9f1c',
  crate: '#c9a227',
} as const;
