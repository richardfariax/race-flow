/**
 * Compat: reexporta o loader genérico com a API antiga do Jetta.
 */
export { useCarParts as useJettaParts, preloadCar as preloadJetta } from './GlbCar';
export const JETTA_URL = '/models/jetta.glb';

import * as THREE from 'three';

export const JETTA_WHEEL_POS = [
  new THREE.Vector3(0.789, 0, 1.461),
  new THREE.Vector3(-0.789, 0, 1.461),
  new THREE.Vector3(0.789, 0, -1.226),
  new THREE.Vector3(-0.789, 0, -1.226),
] as const;
