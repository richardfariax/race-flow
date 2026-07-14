"use client";

import { useEffect, useRef, useState } from "react";
import { telemetry } from "../game/telemetry";
import { PHYSICS_TIMESTEP } from "../game/vehicleTuning";
import { useDebugStore } from "../state/debugStore";

/**
 * Painel de telemetria da física. Toggle por ⌘K (Cmd/Ctrl+K).
 * Lê o singleton `telemetry` via rAF (throttle ~12 Hz) — não re-renderiza por
 * frame. Só em dev; em produção o componente é um no-op.
 */

const WHEEL_LABELS = ["DE", "DD", "TE", "TD"] as const; // Dianteira/Traseira Esq/Dir
const PHYS_HZ = Math.round(1 / PHYSICS_TIMESTEP);
/** Só em desenvolvimento — em produção o painel nunca monta nem escuta teclas. */
const DEV = process.env.NODE_ENV !== "production";

const wrap: React.CSSProperties = {
  position: "fixed",
  top: 12,
  left: 12,
  zIndex: 60,
  minWidth: 268,
  padding: "10px 12px",
  background: "rgba(8,10,16,0.82)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  backdropFilter: "blur(8px)",
  color: "#e6e9ef",
  font: "12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
  pointerEvents: "none",
  userSelect: "none",
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
};

const label: React.CSSProperties = { color: "#8b93a7" };

const STATE_COLOR: Record<string, string> = {
  GRIP: "#6ee7a8",
  DRIFT_ENTRY: "#f5d76e",
  DRIFT: "#f59e6e",
  DRIFT_RECOVERY: "#8ecbf5",
  AIRBORNE: "#c084fc",
  RESETTING: "#f56e8e",
};

function deg(rad: number): string {
  return ((rad * 180) / Math.PI).toFixed(1) + "°";
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div style={row}>
      <span style={label}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

export function DebugOverlay() {
  const enabled = useDebugStore((s) => s.enabled);
  const toggle = useDebugStore((s) => s.toggle);
  const [, setTick] = useState(0);
  const fpsRef = useRef(0);

  // Hotkey ativo só em dev (mesmo com o painel fechado).
  useEffect(() => {
    if (!DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyK") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Loop de leitura só roda com o painel aberto.
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = performance.now();
    let lastRender = 0;
    let fpsAcc = 0;
    let fpsCount = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (dt > 0) {
        fpsAcc += 1000 / dt;
        fpsCount++;
      }
      if (now - lastRender > 80) {
        fpsRef.current = fpsCount ? fpsAcc / fpsCount : 0;
        fpsAcc = 0;
        fpsCount = 0;
        lastRender = now;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!DEV || !enabled) return null;

  const t = telemetry;
  const absMs = Math.abs(t.speedMs);

  return (
    <div style={wrap}>
      <div style={{ ...row, marginBottom: 6, alignItems: "center" }}>
        <strong style={{ letterSpacing: 0.4 }}>FÍSICA · DEBUG</strong>
        <span
          style={{
            color: STATE_COLOR[t.state] ?? "#e6e9ef",
            fontWeight: 700,
          }}
        >
          {t.live ? t.state : "—"}
        </span>
      </div>

      <Line k="FPS" v={fpsRef.current.toFixed(0)} />
      <Line k="Física" v={`${PHYS_HZ} Hz`} />
      <Line
        k="Velocidade"
        v={`${(absMs * 3.6).toFixed(0)} km/h · ${t.speedMs.toFixed(1)} m/s`}
      />
      <Line k="Marcha · RPM" v={`${t.gear} · ${t.rpm.toFixed(0)}`} />
      <Line
        k="Acel · Freio · Mão"
        v={`${t.throttle.toFixed(2)} · ${t.brakePedal.toFixed(2)} · ${t.handbrakePedal.toFixed(2)}`}
      />
      <Line k="Direção (roda · input)" v={`${deg(t.steerAngle)} · ${t.steerInput.toFixed(2)}`} />
      <Line k="Slip · Drift" v={`${deg(t.slipAngle)} · ${deg(t.driftAngle)}`} />
      <Line k="Yaw rate" v={`${t.yawRate.toFixed(2)} rad/s`} />
      <Line k="Drift hold" v={t.driftHold.toFixed(2)} />
      <Line k="Assist yaw" v={t.assistYaw.toFixed(1)} />
      <Line k="Rodas no solo" v={`${t.wheelsOnGround}/4 · ${t.onRoad ? "asfalto" : "fora"}`} />

      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div style={{ ...row, color: "#8b93a7", marginBottom: 2 }}>
          <span style={{ width: 30 }}>roda</span>
          <span style={{ width: 34, textAlign: "right" }}>carga</span>
          <span style={{ width: 34, textAlign: "right" }}>comp</span>
          <span style={{ width: 44, textAlign: "right" }}>long</span>
          <span style={{ width: 44, textAlign: "right" }}>lat</span>
        </div>
        {t.wheels.map((w, i) => (
          <div key={i} style={{ ...row, opacity: w.contact ? 1 : 0.45 }}>
            <span style={{ width: 30, color: w.onRoad ? "#e6e9ef" : "#c8a27a" }}>
              {WHEEL_LABELS[i]}
            </span>
            <span style={{ width: 34, textAlign: "right" }}>{w.load.toFixed(0)}</span>
            <span style={{ width: 34, textAlign: "right" }}>{w.compression.toFixed(2)}</span>
            <span style={{ width: 44, textAlign: "right" }}>{w.longImpulse.toFixed(1)}</span>
            <span style={{ width: 44, textAlign: "right" }}>{w.latImpulse.toFixed(1)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 6, color: "#5c6478", fontSize: 11 }}>
        ⌘K fecha
      </div>
    </div>
  );
}
