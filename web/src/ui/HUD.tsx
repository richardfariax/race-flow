import { Link } from "react-router-dom";
import { NET } from "@shared/protocol";
import { TRACK } from "@shared/track";
import { useGameStore } from "../state/gameStore";
import { Tachometer } from "./Tachometer";
import { BoostGauge } from "./BoostGauge";
import { MiniMap } from "./MiniMap";

const panel: React.CSSProperties = {
  background: "rgba(8,10,16,0.72)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  backdropFilter: "blur(10px)",
  boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
  fontFamily: "Barlow Condensed, Inter, sans-serif",
};

function fmtClock(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtLap(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function ordinal(n: number): string {
  return `${n}º`;
}

function ModeBadge({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(239,68,68,0.18)",
        border: "1px solid rgba(239,68,68,0.35)",
        color: "#fecaca",
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 1.4,
        fontFamily: "Barlow Condensed, Inter, sans-serif",
      }}
    >
      {label}
    </div>
  );
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          fontSize: 11,
          letterSpacing: 1.2,
          color: "rgba(255,255,255,0.45)",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: accent ?? "#fff",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function HUD({ online }: { online: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const mode = useGameStore((s) => s.mode);
  const countdownMs = useGameStore((s) => s.countdownMs);
  const raceTimeMs = useGameStore((s) => s.raceTimeMs);
  const totalLaps = useGameStore((s) => s.totalLaps);
  const standings = useGameStore((s) => s.standings);
  const myId = useGameStore((s) => s.mySessionId);
  const roomId = useGameStore((s) => s.roomId);
  const isPrivate = useGameStore((s) => s.isPrivate);

  const me = standings.find((p) => p.sessionId === myId);
  const sorted = [...standings].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return a.finishPos - b.finishPos;
    if (mode === "drift") return b.driftScore - a.driftScore;
    const pa = a.lap * 100 + a.checkpoint;
    const pb = b.lap * 100 + b.checkpoint;
    return pb - pa;
  });
  const position =
    online && me ? sorted.findIndex((p) => p.sessionId === myId) + 1 : 0;

  const modeLabel =
    mode === "circuit"
      ? "CIRCUITO"
      : mode === "drift"
        ? "DRIFT"
        : mode === "timetrial"
          ? "TIME TRIAL"
          : "TREINO";

  const racing = phase === "racing" || phase === "finished";
  const showRaceInfo = Boolean(online && racing && me);
  const player = me;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        color: "#fff",
        userSelect: "none",
        zIndex: 20,
      }}
    >
      {/* Top-left: brand + mode + map */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            to="/"
            style={{
              pointerEvents: "auto",
              textDecoration: "none",
              fontSize: 18,
              fontWeight: 900,
              fontStyle: "italic",
              letterSpacing: 1,
              color: "#ffd166",
              fontFamily: "Barlow Condensed, Inter, sans-serif",
              textShadow: "0 2px 8px rgba(0,0,0,0.65)",
            }}
          >
            RACE FLOW
          </Link>
          <ModeBadge label={modeLabel} />
        </div>
        <div style={{ position: "relative" }}>
          <MiniMap />
        </div>
        {isPrivate && roomId && (
          <div
            style={{
              ...panel,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            SALA {roomId}
          </div>
        )}
      </div>

      {/* Top-center: session clock / countdown */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        {online && phase === "countdown" && (
          <div
            style={{
              fontSize: 96,
              fontWeight: 900,
              fontStyle: "italic",
              color: "#ffd166",
              lineHeight: 1,
              textShadow: "0 4px 0 #1a1a2e, 0 12px 40px rgba(0,0,0,0.55)",
              fontFamily: "Barlow Condensed, Inter, sans-serif",
            }}
          >
            {Math.max(1, Math.ceil(countdownMs / 1000))}
          </div>
        )}
        {online && racing && (
          <div style={{ ...panel, padding: "8px 16px", minWidth: 140 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.6,
                color: "rgba(255,255,255,0.45)",
                fontWeight: 700,
              }}
            >
              {mode === "drift"
                ? "TEMPO RESTANTE"
                : mode === "timetrial"
                  ? "SESSÃO"
                  : "TEMPO DE CORRIDA"}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                color: "#ffd166",
                lineHeight: 1.1,
              }}
            >
              {mode === "drift"
                ? fmtClock(Math.max(0, NET.driftDurationMs - raceTimeMs))
                : mode === "timetrial"
                  ? fmtClock(Math.max(0, NET.timetrialDurationMs - raceTimeMs))
                  : fmtClock(raceTimeMs)}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 10,
                letterSpacing: 1.2,
                color: "rgba(255,255,255,0.4)",
                fontWeight: 700,
              }}
            >
              {TRACK.name.toUpperCase()}
            </div>
          </div>
        )}
        {!online && (
          <div style={{ ...panel, padding: "8px 14px" }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.4,
                color: "rgba(255,255,255,0.45)",
                fontWeight: 700,
              }}
            >
              SESSÃO
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>TREINO LIVRE</div>
          </div>
        )}
      </div>

      {/* Top-right: race / drift / TT telemetry */}
      {showRaceInfo && player && mode === "circuit" && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            ...panel,
            padding: "12px 14px",
            minWidth: 168,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                fontSize: 36,
                fontWeight: 900,
                lineHeight: 1,
                color: "#ffd166",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ordinal(position)}
            </span>
            <span
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.45)",
                fontWeight: 700,
              }}
            >
              / {standings.length}
            </span>
          </div>
          <StatRow
            label="VOLTA"
            value={`${Math.min(player.lap, totalLaps)} / ${totalLaps}`}
          />
          <StatRow
            label="SETOR"
            value={`${Math.min(player.checkpoint + 1, TRACK.checkpoints)} / ${TRACK.checkpoints}`}
          />
          {player.bestLapMs > 0 && (
            <StatRow
              label="MELHOR"
              value={fmtLap(player.bestLapMs)}
              accent="#86efac"
            />
          )}
          {player.lastLapMs > 0 && (
            <StatRow label="ÚLTIMA" value={fmtLap(player.lastLapMs)} />
          )}
        </div>
      )}

      {showRaceInfo && player && mode === "timetrial" && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            ...panel,
            padding: "12px 14px",
            minWidth: 168,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.4,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 700,
            }}
          >
            MELHOR VOLTA
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: "#ffd166",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {player.bestLapMs > 0 ? fmtLap(player.bestLapMs) : "--:--.--"}
          </div>
          {player.lastLapMs > 0 && (
            <StatRow label="ÚLTIMA" value={fmtLap(player.lastLapMs)} />
          )}
          <StatRow
            label="SETOR"
            value={`${Math.min(player.checkpoint + 1, TRACK.checkpoints)} / ${TRACK.checkpoints}`}
          />
        </div>
      )}

      {showRaceInfo && player && mode === "drift" && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            ...panel,
            padding: "12px 14px",
            minWidth: 180,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.4,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 700,
            }}
          >
            PONTUAÇÃO
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 900,
              color: "#ffd166",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {player.driftScore.toLocaleString("pt-BR")}
          </div>
          <StatRow
            label="COMBO"
            value={
              player.driftCombo > 1
                ? `×${player.driftCombo.toFixed(1)}`
                : "×1.0"
            }
            accent={player.driftCombo > 1 ? "#f15bb5" : undefined}
          />
          <StatRow
            label="POSIÇÃO"
            value={`${ordinal(position)} / ${standings.length}`}
          />
        </div>
      )}

      {/* Standings strip (circuit / drift) */}
      {online &&
        racing &&
        standings.length > 1 &&
        (mode === "circuit" || mode === "drift") && (
          <div
            style={{
              position: "absolute",
              top: showRaceInfo ? 208 : 14,
              right: 16,
              ...panel,
              padding: "8px 10px",
              minWidth: 168,
              maxWidth: 220,
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: 1.4,
                color: "rgba(255,255,255,0.4)",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              CLASSIFICAÇÃO
            </div>
            {sorted.slice(0, 6).map((p, i) => {
              const mine = p.sessionId === myId;
              return (
                <div
                  key={p.sessionId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "3px 0",
                    opacity: mine ? 1 : 0.75,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      fontSize: 12,
                      fontWeight: 800,
                      color: i === 0 ? "#ffd166" : "rgba(255,255,255,0.55)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: p.bodyColor || "#94a3b8",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: mine ? 800 : 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.nick}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.55)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {mode === "drift"
                      ? p.driftScore.toLocaleString("pt-BR")
                      : `${Math.min(p.lap, totalLaps)}/${totalLaps}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <BoostGauge />
        </div>
        <Tachometer />
      </div>
    </div>
  );
}
