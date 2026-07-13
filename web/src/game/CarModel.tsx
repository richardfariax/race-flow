import type { CarClass } from '@shared/cars';
import { toonMaterial, PALETTE } from './toon';

/**
 * Modelo de carro estilizado (toon) com silhueta de carro de verdade:
 * carroceria em duas alturas, cabine/vidros, paralamas (caixas de roda),
 * faróis, lanternas e spoiler. Convenção: frente = +Z.
 *
 * A CARROCERIA e as RODAS são componentes separados porque a Vehicle anima
 * cada roda (suspensão + giro) por fora; a CarBody é só o casco.
 */

export interface CarStyle {
  width: number;
  height: number;
  length: number;
  cabin: number;
  /** 0 = sem asa */
  spoiler: number;
}

const STYLE: Record<CarClass, CarStyle> = {
  C: { width: 0.86, height: 0.34, length: 1.85, cabin: 0.5, spoiler: 0.0 },
  B: { width: 0.9, height: 0.32, length: 1.9, cabin: 0.44, spoiler: 0.28 },
  A: { width: 0.94, height: 0.28, length: 1.95, cabin: 0.36, spoiler: 0.42 },
};

export function carStyle(cls: CarClass): CarStyle {
  return STYLE[cls] ?? STYLE.C;
}

interface CarBodyProps {
  bodyColor: string;
  accentColor: string;
  cls: CarClass;
}

/** Só a carroceria (sem rodas). Deve ficar dentro do grupo do chassi. */
export function CarBody({ bodyColor, accentColor, cls }: CarBodyProps) {
  const s = carStyle(cls);
  const body = toonMaterial(bodyColor);
  const accent = toonMaterial(accentColor);
  const glass = toonMaterial(PALETTE.glass);
  const dark = toonMaterial(PALETTE.carDark);
  const head = toonMaterial(PALETTE.headlight);
  const tail = toonMaterial(PALETTE.taillight);
  const chrome = toonMaterial(PALETTE.chrome);

  const w = s.width;
  const h = s.height;
  const l = s.length;
  // espelham WHEEL_POS da Vehicle
  const wx = 0.82;
  const wzF = 1.25;
  const wzR = -1.25;

  return (
    <group>
      <mesh castShadow position={[0, -0.02, 0]} material={body}>
        <boxGeometry args={[w * 2, h * 2, l * 2]} />
      </mesh>
      {/* capô/traseira levemente rebaixados dão a silhueta */}
      <mesh castShadow position={[0, h * 0.7, l * 0.55]} material={body}>
        <boxGeometry args={[w * 1.9, h * 0.9, l * 0.85]} />
      </mesh>
      <mesh castShadow position={[0, h + s.cabin * 0.5, -0.15]} material={accent}>
        <boxGeometry args={[w * 1.55, s.cabin, l * 0.95]} />
      </mesh>
      <mesh position={[0, h + s.cabin * 0.5, -0.15]} material={glass}>
        <boxGeometry args={[w * 1.58, s.cabin * 0.72, l * 0.98]} />
      </mesh>
      <mesh castShadow position={[0, h + s.cabin * 0.92, -0.15]} material={accent}>
        <boxGeometry args={[w * 1.5, s.cabin * 0.28, l * 0.8]} />
      </mesh>

      {[
        [wx, wzF],
        [-wx, wzF],
        [wx, wzR],
        [-wx, wzR],
      ].map(([x, z], i) => (
        <group key={i} position={[x, -0.02, z]}>
          <mesh castShadow position={[Math.sign(x) * 0.06, h * 0.5, 0]} material={body}>
            <boxGeometry args={[0.34, h * 1.7, 1.02]} />
          </mesh>
          {/* poço escuro atrás da roda (dá profundidade à caixa) */}
          <mesh position={[Math.sign(x) * -0.12, 0, 0]} material={dark}>
            <boxGeometry args={[0.2, h * 1.3, 0.92]} />
          </mesh>
        </group>
      ))}

      {[-1, 1].map((sgn) => (
        <mesh key={sgn} castShadow position={[sgn * (w + 0.02), -h * 0.5, 0]} material={dark}>
          <boxGeometry args={[0.1, h * 0.9, l * 1.5]} />
        </mesh>
      ))}

      {[-1, 1].map((sgn) => (
        <mesh key={sgn} position={[sgn * w * 0.6, h * 0.2, l * 0.98]} material={head}>
          <boxGeometry args={[0.34, 0.2, 0.12]} />
        </mesh>
      ))}
      <mesh castShadow position={[0, -h * 0.2, l * 1.0]} material={dark}>
        <boxGeometry args={[w * 1.5, h * 0.8, 0.16]} />
      </mesh>

      <mesh position={[0, h * 0.25, -l * 0.99]} material={tail}>
        <boxGeometry args={[w * 1.5, 0.16, 0.1]} />
      </mesh>
      <mesh castShadow position={[0, -h * 0.4, -l * 1.0]} material={dark}>
        <boxGeometry args={[w * 1.5, h * 0.7, 0.16]} />
      </mesh>

      {s.spoiler > 0 && (
        <group position={[0, h + s.spoiler * 0.6, -l * 0.92]}>
          <mesh castShadow material={dark}>
            <boxGeometry args={[w * 1.7, 0.06, 0.32]} />
          </mesh>
          {[-1, 1].map((sgn) => (
            <mesh key={sgn} castShadow position={[sgn * w * 0.7, -s.spoiler * 0.3, 0.02]} material={dark}>
              <boxGeometry args={[0.08, s.spoiler * 0.6, 0.12]} />
            </mesh>
          ))}
        </group>
      )}

      <mesh position={[0, h + 0.01, l * 0.2]} material={chrome}>
        <boxGeometry args={[0.18, 0.02, l * 1.2]} />
      </mesh>
    </group>
  );
}

/**
 * Uma roda: pneu + aro + raios + cubo. O eixo é o Y local (igual ao
 * cylinderGeometry), então a Vehicle aplica rotation.z=PI/2 (deita) e
 * rotation.x=spin (gira). ESTE grupo deve ser o filho [0] do grupo de roda.
 */
export function WheelMesh({ radius = 0.42, width = 0.34 }: { radius?: number; width?: number }) {
  const tire = toonMaterial(PALETTE.tire);
  const rim = toonMaterial(PALETTE.rim);
  const rimDark = toonMaterial(PALETTE.rimDark);
  return (
    <group>
      <mesh castShadow material={tire}>
        <cylinderGeometry args={[radius, radius, width, 20]} />
      </mesh>
      <mesh material={rim}>
        <cylinderGeometry args={[radius * 0.62, radius * 0.62, width * 1.02, 16]} />
      </mesh>
      {/* raios no plano X-Z (perpendicular ao eixo Y do cylinderGeometry) */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} rotation={[0, (i / 5) * Math.PI * 2, 0]} material={rimDark}>
          <boxGeometry args={[radius * 1.1, width * 0.45, radius * 0.14]} />
        </mesh>
      ))}
      <mesh material={rimDark}>
        <cylinderGeometry args={[radius * 0.2, radius * 0.2, width * 1.1, 10]} />
      </mesh>
    </group>
  );
}
