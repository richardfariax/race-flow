import { useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLES, TRACK } from '@shared/track';
import { localCar } from '../net/localCar';
import { remoteBuffers } from '../net/remoteBuffer';
import { useGameStore } from '../state/gameStore';

const SIZE = 168;
const PAD = 14;

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function trackBounds(): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < SAMPLES.length; i += 3) {
    const p = SAMPLES[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const mx = (maxX - minX) * 0.08;
  const mz = (maxZ - minZ) * 0.08;
  return { minX: minX - mx, maxX: maxX + mx, minZ: minZ - mz, maxZ: maxZ + mz };
}

function project(x: number, z: number, b: Bounds): { x: number; y: number } {
  const w = SIZE - PAD * 2;
  const h = SIZE - PAD * 2;
  const sx = w / (b.maxX - b.minX);
  const sz = h / (b.maxZ - b.minZ);
  const s = Math.min(sx, sz);
  const ox = PAD + (w - (b.maxX - b.minX) * s) / 2;
  const oy = PAD + (h - (b.maxZ - b.minZ) * s) / 2;
  return {
    x: ox + (x - b.minX) * s,
    y: oy + (z - b.minZ) * s,
  };
}

function trackPath(b: Bounds): string {
  const step = Math.max(1, Math.floor(SAMPLES.length / 90));
  let d = '';
  for (let i = 0; i < SAMPLES.length; i += step) {
    const p = project(SAMPLES[i].x, SAMPLES[i].z, b);
    d += i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return `${d} Z`;
}

interface Marker {
  id: string;
  x: number;
  y: number;
  yaw: number;
  color: string;
  self: boolean;
}

export function MiniMap() {
  const standings = useGameStore((s) => s.standings);
  const myId = useGameStore((s) => s.mySessionId);
  const bounds = useMemo(() => trackBounds(), []);
  const path = useMemo(() => trackPath(bounds), [bounds]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const start = useMemo(() => project(SAMPLES[0].x, SAMPLES[0].z, bounds), [bounds]);
  const raf = useRef(0);

  useEffect(() => {
    const tick = () => {
      const next: Marker[] = [];

      if (localCar.hasData) {
        const p = project(localCar.position.x, localCar.position.z, bounds);
        const e = localCar.quaternion;
        // yaw from quaternion (frente = +Z)
        const yaw = Math.atan2(
          2 * (e.w * e.y + e.x * e.z),
          1 - 2 * (e.y * e.y + e.z * e.z),
        );
        next.push({
          id: 'self',
          x: p.x,
          y: p.y,
          yaw,
          color: '#ffd166',
          self: true,
        });
      }

      for (const entry of standings) {
        if (entry.sessionId === myId) continue;
        const buf = remoteBuffers.get(entry.sessionId);
        const snap = buf?.[buf.length - 1];
        if (!snap) continue;
        const p = project(snap.x, snap.z, bounds);
        const yaw = Math.atan2(
          2 * (snap.qw * snap.qy + snap.qx * snap.qz),
          1 - 2 * (snap.qy * snap.qy + snap.qz * snap.qz),
        );
        next.push({
          id: entry.sessionId,
          x: p.x,
          y: p.y,
          yaw,
          color: entry.bodyColor || '#7dd3fc',
          self: false,
        });
      }

      setMarkers(next);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [bounds, standings, myId]);

  return (
    <div
      style={{
        position: 'relative',
        width: SIZE,
        height: SIZE,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'rgba(8,10,16,0.78)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <rect width={SIZE} height={SIZE} fill="rgba(12,16,22,0.5)" />
        <path
          d={path}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d={path}
          fill="none"
          stroke="rgba(255,209,102,0.35)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx={start.x} cy={start.y} r="3.5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
        {markers.map((m) => {
          const len = m.self ? 7 : 5;
          const tipX = m.x + Math.sin(m.yaw) * len;
          const tipY = m.y + Math.cos(m.yaw) * len;
          return (
            <g key={m.id}>
              <circle
                cx={m.x}
                cy={m.y}
                r={m.self ? 4.5 : 3.2}
                fill={m.color}
                stroke={m.self ? '#fff' : 'rgba(0,0,0,0.45)'}
                strokeWidth={m.self ? 1.4 : 1}
              />
              <line
                x1={m.x}
                y1={m.y}
                x2={tipX}
                y2={tipY}
                stroke={m.self ? '#fff' : m.color}
                strokeWidth={m.self ? 2 : 1.4}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 8,
          bottom: 6,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.2,
          color: 'rgba(255,255,255,0.55)',
          fontFamily: 'Barlow Condensed, Inter, sans-serif',
          pointerEvents: 'none',
        }}
      >
        {TRACK.name.toUpperCase()}
      </div>
    </div>
  );
}
