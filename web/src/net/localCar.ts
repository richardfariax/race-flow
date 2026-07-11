import * as THREE from 'three';
import type { CorrectionMsg } from '@shared/protocol';

/**
 * Ponte física ↔ rede do carro local (fora do React p/ não gerar re-render).
 * Vehicle escreve a cada frame; NetSession lê a 20Hz; correção do servidor
 * é consumida pelo Vehicle no próximo passo de física.
 */
export const localCar = {
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  speed: 0,
  hasData: false,
  correction: null as CorrectionMsg | null,
};
