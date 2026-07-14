'use client';

import { useHudStore } from '../state/hudStore';

const SIZE = 268;
const CX = SIZE / 2;
const CY = SIZE / 2 + 6;
const R = 102;
const START = 135;
const SWEEP = 270;

function polar(deg: number, radius: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + Math.cos(rad) * radius, y: CY + Math.sin(rad) * radius };
}

function arcPath(fromDeg: number, toDeg: number, radius: number): string {
  const a = polar(fromDeg, radius);
  const b = polar(toDeg, radius);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}

function rpmToDeg(rpm: number, redline: number): number {
  const t = Math.max(0, Math.min(1, rpm / Math.max(1, redline)));
  return START + t * SWEEP;
}

export function Tachometer() {
  const speedKmh = useHudStore((s) => s.speedKmh);
  const rpm = useHudStore((s) => s.rpm);
  const redlineRpm = useHudStore((s) => s.redlineRpm);
  const gear = useHudStore((s) => s.gear);
  const shifting = useHudStore((s) => s.shifting);

  const redStart = rpmToDeg(redlineRpm * 0.82, redlineRpm);
  const redEnd = START + SWEEP;
  const needleDeg = rpmToDeg(rpm, redlineRpm);
  const needle = polar(needleDeg, R - 16);

  const majorStep = 1000;
  const ticks: { deg: number; label: string; major: boolean }[] = [];
  for (let v = 0; v <= redlineRpm; v += majorStep) {
    ticks.push({
      deg: rpmToDeg(v, redlineRpm),
      label: String(v / 1000),
      major: true,
    });
    if (v + majorStep / 2 <= redlineRpm) {
      ticks.push({
        deg: rpmToDeg(v + majorStep / 2, redlineRpm),
        label: '',
        major: false,
      });
    }
  }

  const gearLabel = gear < 0 ? 'R' : gear === 0 ? 'N' : String(gear);
  const rpmDisplay = Math.round(rpm).toLocaleString('pt-BR');

  return (
    <div
      style={{
        position: 'relative',
        width: SIZE,
        height: SIZE,
        filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.55))',
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="tachFace" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(22,24,32,0.94)" />
            <stop offset="100%" stopColor="rgba(6,8,14,0.98)" />
          </linearGradient>
        </defs>

        <circle
          cx={CX}
          cy={CY}
          r={R + 20}
          fill="url(#tachFace)"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1.5"
        />
        <circle
          cx={CX}
          cy={CY}
          r={R + 14}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="8"
        />
        <path
          d={arcPath(START, START + SWEEP, R)}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d={arcPath(redStart, redEnd, R)}
          fill="none"
          stroke="rgba(220,40,40,0.8)"
          strokeWidth="9"
        />

        {ticks.map((t, i) => {
          const inner = polar(t.deg, R - (t.major ? 13 : 7));
          const outer = polar(t.deg, R + 2);
          const lbl = polar(t.deg, R - 26);
          return (
            <g key={i}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={t.major ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.32)'}
                strokeWidth={t.major ? 2 : 1}
              />
              {t.label && (
                <text
                  x={lbl.x}
                  y={lbl.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255,255,255,0.72)"
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="Barlow Condensed, Inter, sans-serif"
                >
                  {t.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '44%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 54,
              fontWeight: 900,
              lineHeight: 1,
              color: shifting ? '#f15bb5' : '#fff',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'Barlow Condensed, Inter, sans-serif',
              textShadow: '0 2px 10px rgba(0,0,0,0.85)',
              letterSpacing: 1,
            }}
          >
            {gearLabel}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.42)',
              letterSpacing: 2,
              marginTop: 50,
              fontFamily: 'Barlow Condensed, Inter, sans-serif',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {rpmDisplay} RPM
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 26,
            transform: 'translateX(-50%)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              lineHeight: 1,
              color: '#fff',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'Barlow Condensed, Inter, sans-serif',
              textShadow: '0 2px 10px rgba(0,0,0,0.85)',
            }}
          >
            {speedKmh}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: 3,
              marginTop: 2,
              fontFamily: 'Barlow Condensed, Inter, sans-serif',
            }}
          >
            KM/H
          </div>
        </div>
      </div>

      {/* Ponteiro sempre no topo — acima da marcha e da velocidade */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <defs>
          <linearGradient id="needleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff6b35" />
            <stop offset="100%" stopColor="#ffd166" />
          </linearGradient>
        </defs>
        <line
          x1={CX}
          y1={CY}
          x2={needle.x}
          y2={needle.y}
          stroke="url(#needleGrad)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle
          cx={CX}
          cy={CY}
          r="7"
          fill="#12141c"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="1.5"
        />
        <circle cx={CX} cy={CY} r="3" fill="#ffd166" />
      </svg>
    </div>
  );
}
