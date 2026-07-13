/**
 * Metadados visuais dos GLBs (URLs, escala, hubs 3D, materiais de pintura).
 * A física/geometria de jogo fica em shared/cars.ts.
 *
 * wheelNameRe: reforço por modelo (além dos regex estritos do GlbCar).
 * Nunca use "rim" sem limites — casava com "Trim" e comia a carroceria.
 *
 * WHEEL_REST_Y: Y do hub no chassis em repouso (deve bater com
 * attachmentY − suspensionRestLength no Vehicle). Mais negativo = carro mais alto.
 */

/** Altura de passeio visual — rodas abaixo da caixa, sem “slammed”. */
export const WHEEL_REST_Y = -0.72;

/** Y das rodas em repouso (suspensão estendida) — showroom / preview estático. */
export const STATIC_WHEEL_Y = WHEEL_REST_Y;

export interface CarVisualConfig {
  url: string;
  /** multiplica o modelo para comprimento real (~metros) */
  scale: number;
  /**
   * Hubs no espaço do modelo JÁ escalado (Y incluso).
   * Índices: 0 FL, 1 FR, 2 RL, 3 RR.
   */
  hubs: ReadonlyArray<readonly [number, number, number]>;
  wheelNameRe: RegExp;
  paintNameRe: RegExp;
}

export const CAR_VISUALS: Record<string, CarVisualConfig> = {
  beetle: {
    url: '/models/beetle.glb',
    scale: 100.429,
    hubs: [
      [0.673, 0.11, 1.336],
      [-0.673, 0.11, 1.336],
      [0.683, 0.11, -1.085],
      [-0.683, 0.11, -1.085],
    ],
    wheelNameRe: /tire.?disk|tire.?hub|llanta|(?:^|[^a-z])disk(?:[^a-z]|$)/i,
    paintNameRe: /beetle.*base|carpaint|paint/i,
  },
  golf_gti: {
    url: '/models/golf_gti.glb',
    scale: 103.107,
    hubs: [
      [0.65, 0.093, 1.227],
      [-0.65, 0.093, 1.227],
      [0.619, 0.093, -1.217],
      [-0.619, 0.093, -1.217],
    ],
    // WheelFL / M_Tire / M_Rim — nunca "Trim"
    wheelNameRe: /wheelfl|m_tire|m_rim|(?:^|[^a-z])(?:tire|disk|rim)(?:[^a-z]|$)/i,
    paintNameRe: /carpaint_max(?!.*trim)/i,
  },
  jetta: {
    url: '/models/jetta.glb',
    scale: 1,
    hubs: [
      [0.789, 0.507, 1.461],
      [-0.789, 0.507, 1.461],
      [0.789, 0.507, -1.226],
      [-0.789, 0.507, -1.226],
    ],
    wheelNameRe: /wheel|disk|pokr|bolt/i,
    paintNameRe: /^carpaint$/i,
  },
  m3_e46: {
    url: '/models/m3_e46.glb',
    scale: 98.675,
    hubs: [
      [0.799, 0.207, 1.559],
      [-0.799, 0.207, 1.559],
      [0.799, 0.207, -1.164],
      [-0.799, 0.207, -1.164],
    ],
    wheelNameRe: /m_tire|tire.?brake|details.?disk|(?:^|[^a-z])(?:tire|disk|hub)(?:[^a-z]|$)/i,
    paintNameRe: /carpaint/i,
  },
  skyline_r34: {
    url: '/models/skyline_r34.glb',
    scale: 98.821,
    hubs: [
      [0.731, 0.306, 1.374],
      [-0.731, 0.306, 1.374],
      [0.731, 0.306, -1.255],
      [-0.731, 0.306, -1.255],
    ],
    wheelNameRe: /3dwheel|wheel1a|tireblur|(?:^|[^a-z])wheel(?:[^a-z]|$)/i,
    paintNameRe: /paint(?!.*window)|coloured|colored/i,
  },
  supra_a90: {
    url: '/models/supra_a90.glb',
    scale: 97.212,
    hubs: [
      [0.846, 0.318, 1.205],
      [-0.846, 0.318, 1.205],
      [0.885, 0.318, -1.193],
      [-0.885, 0.318, -1.193],
    ],
    wheelNameRe: /tnrrims|tireblur|(?:^|[^a-z])rim(?:[^a-z]|$)|wheel/i,
    paintNameRe: /paint(?!.*window)|coloured|colored/i,
  },
  m4_g82: {
    url: '/models/m4_g82.glb',
    scale: 98.478,
    hubs: [
      [0.887, 0.342, 1.509],
      [-0.887, 0.342, 1.509],
      [0.877, 0.342, -1.299],
      [-0.877, 0.342, -1.299],
    ],
    wheelNameRe: /tnrrims|tireblur|(?:^|[^a-z])rim(?:[^a-z]|$)|wheel/i,
    paintNameRe: /paint(?!.*window)|coloured|colored/i,
  },
};

export function carVisual(carId: string): CarVisualConfig {
  return CAR_VISUALS[carId] ?? CAR_VISUALS.golf_gti;
}
