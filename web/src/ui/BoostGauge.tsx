'use client';

import { useHudStore } from '../state/hudStore';

const SIZE = 118;
const CX = SIZE / 2;
const CY = SIZE / 2 + 4;
const R = 42;
const START = 140;
const SWEEP = 260;

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

export function BoostGauge() {
  const boostBar = useHudStore((s) => s.boostBar);
  const boostBarMax = useHudStore((s) => s.boostBarMax);
  if (boostBarMax <= 0) return null;

  const t = Math.max(0, Math.min(1, boostBar / boostBarMax));
  const needleDeg = START + t * SWEEP;
  const needle = polar(needleDeg, R - 10);
  const fillEnd = START + t * SWEEP;
  const display = boostBar.toFixed(2);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const deg = START + f * SWEEP;
    return {
      deg,
      label: (f * boostBarMax).toFixed(f === 0 || f === 1 ? 0 : 1),
      major: f === 0 || f === 0.5 || f === 1,
    };
  });

  return (
    <div
      style={{
        width: SIZE,
        height: SIZE,
        filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))',
        position: 'relative',
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="boostFace" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(18,20,28,0.94)" />
            <stop offset="100%" stopColor="rgba(8,10,16,0.98)" />
          </linearGradient>
          <linearGradient id="boostFill" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="70%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <circle
          cx={CX}
          cy={CY}
          r={R + 14}
          fill="url(#boostFace)"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1.2"
        />
        <path
          d={arcPath(START, START + SWEEP, R)}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {t > 0.01 && (
          <path
            d={arcPath(START, fillEnd, R)}
            fill="none"
            stroke="url(#boostFill)"
            strokeWidth="7"
            strokeLinecap="round"
          />
        )}
        {ticks.map((tick, i) => {
          const inner = polar(tick.deg, R - (tick.major ? 9 : 5));
          const outer = polar(tick.deg, R + 1);
          const lbl = polar(tick.deg, R - 18);
          return (
            <g key={i}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={tick.major ? 1.6 : 1}
              />
              {tick.major && (
                <text
                  x={lbl.x}
                  y={lbl.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255,255,255,0.55)"
                  fontSize="8"
                  fontWeight="700"
                  fontFamily="Barlow Condensed, Inter, sans-serif"
                >
                  {tick.label}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={CX}
          y1={CY}
          x2={needle.x}
          y2={needle.y}
          stroke="#f87171"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r="4.5" fill="#1a1a2e" stroke="rgba(255,255,255,0.3)" />
        <circle cx={CX} cy={CY} r="2" fill="#38bdf8" />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 14,
          transform: 'translateX(-50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: t > 0.85 ? '#f87171' : '#e2e8f0',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'Barlow Condensed, Inter, sans-serif',
            lineHeight: 1,
          }}
        >
          {display}
        </div>
        <div
          style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 1.4,
            color: 'rgba(255,255,255,0.45)',
            marginTop: 1,
            fontFamily: 'Barlow Condensed, Inter, sans-serif',
          }}
        >
          BOOST BAR
        </div>
      </div>
    </div>
  );
}
