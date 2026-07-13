import { useHudStore } from "../state/hudStore";

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2 + 8;
const R = 108;
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
  const needle = polar(needleDeg, R - 18);

  const majorStep = redlineRpm <= 5000 ? 1000 : 1000;
  const ticks: { deg: number; label: string; major: boolean }[] = [];
  for (let v = 0; v <= redlineRpm; v += majorStep) {
    const deg = rpmToDeg(v, redlineRpm);
    const thousands = v / 1000;
    ticks.push({
      deg,
      label: v % 1000 === 0 ? String(thousands) : "",
      major: true,
    });
    if (v + majorStep / 2 <= redlineRpm) {
      ticks.push({
        deg: rpmToDeg(v + majorStep / 2, redlineRpm),
        label: "",
        major: false,
      });
    }
  }
  if (redlineRpm % majorStep !== 0) {
    ticks.push({
      deg: rpmToDeg(redlineRpm, redlineRpm),
      label: (redlineRpm / 1000).toFixed(1).replace(/\.0$/, ""),
      major: true,
    });
  }

  const gearLabel = gear < 0 ? "R" : gear === 0 ? "N" : String(gear);
  const rpmDisplay = Math.round(rpm);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        width: SIZE,
        height: SIZE,
        filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.55))",
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="tachFace" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(18,20,28,0.92)" />
            <stop offset="100%" stopColor="rgba(8,10,16,0.96)" />
          </linearGradient>
          <linearGradient id="needleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff6b35" />
            <stop offset="100%" stopColor="#ffd166" />
          </linearGradient>
        </defs>

        <circle
          cx={CX}
          cy={CY}
          r={R + 22}
          fill="url(#tachFace)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1.5"
        />
        <path
          d={arcPath(START, START + SWEEP, R)}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d={arcPath(redStart, redEnd, R)}
          fill="none"
          stroke="rgba(220,40,40,0.75)"
          strokeWidth="10"
          strokeLinecap="butt"
        />

        {ticks.map((t, i) => {
          const inner = polar(t.deg, R - (t.major ? 14 : 8));
          const outer = polar(t.deg, R + 2);
          const lbl = polar(t.deg, R - 28);
          return (
            <g key={i}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={
                  t.major ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"
                }
                strokeWidth={t.major ? 2 : 1}
              />
              {t.label && (
                <text
                  x={lbl.x}
                  y={lbl.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255,255,255,0.7)"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  {t.label}
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
          stroke="url(#needleGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ transition: "all 0.06s linear" }}
        />
        <circle
          cx={CX}
          cy={CY}
          r="7"
          fill="#1a1a2e"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1.5"
        />
        <circle cx={CX} cy={CY} r="3" fill="#ffd166" />
      </svg>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "46%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            lineHeight: 1,
            color: shifting ? "#f15bb5" : "#fff",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            transition: "color 0.12s",
          }}
        >
          {gearLabel}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: 2,
            marginTop: 20,
          }}
        >
          {rpmDisplay}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 28,
          transform: "translateX(-50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: 900,
            lineHeight: 1,
            color: "#fff",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}
        >
          {speedKmh}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 3,
            marginTop: 2,
          }}
        >
          KM/H
        </div>
      </div>
    </div>
  );
}
