import { Link } from "react-router-dom";
import { useGameStore } from "../state/gameStore";
import { Tachometer } from "./Tachometer";

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    color: "#fff",
    userSelect: "none",
  },
  logo: {
    position: "absolute",
    top: 16,
    left: 20,
    fontSize: 20,
    fontWeight: 900,
    fontStyle: "italic",
    letterSpacing: 1,
    textShadow: "2px 2px 0 #1a1a2e",
    color: "#ffd166",
    pointerEvents: "auto",
    textDecoration: "none",
  },
  speed: {
    position: "absolute",
    bottom: 24,
    right: 28,
    textAlign: "right",
    textShadow: "2px 2px 0 #1a1a2e",
  },
  help: {
    position: "absolute",
    bottom: 24,
    left: 20,
    fontSize: 13,
    lineHeight: 1.7,
    background: "rgba(26,26,46,0.65)",
    padding: "10px 14px",
    borderRadius: 10,
  },
  race: {
    position: "absolute",
    top: 16,
    right: 20,
    textAlign: "right",
    textShadow: "2px 2px 0 #1a1a2e",
    fontWeight: 800,
  },
  countdown: {
    position: "absolute",
    top: "30%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 120,
    fontWeight: 900,
    fontStyle: "italic",
    color: "#ffd166",
    textShadow: "4px 4px 0 #1a1a2e",
  },
  drift: {
    position: "absolute",
    top: 70,
    right: 20,
    textAlign: "right",
    textShadow: "2px 2px 0 #1a1a2e",
  },
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

export function HUD({ online }: { online: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const mode = useGameStore((s) => s.mode);
  const countdownMs = useGameStore((s) => s.countdownMs);
  const raceTimeMs = useGameStore((s) => s.raceTimeMs);
  const totalLaps = useGameStore((s) => s.totalLaps);
  const standings = useGameStore((s) => s.standings);
  const myId = useGameStore((s) => s.mySessionId);

  const me = standings.find((p) => p.sessionId === myId);
  const position =
    online && me
      ? [...standings]
          .sort((a, b) => {
            if (a.finished !== b.finished) return a.finished ? -1 : 1;
            if (a.finished && b.finished) return a.finishPos - b.finishPos;
            const pa = a.lap * 100 + a.checkpoint;
            const pb = b.lap * 100 + b.checkpoint;
            return pb - pa;
          })
          .findIndex((p) => p.sessionId === myId) + 1
      : 0;

  return (
    <div style={styles.root}>
      <Link to="/" style={styles.logo}>
        RACE FLOW
      </Link>

      <Tachometer />

      {online && phase === "countdown" && (
        <div style={styles.countdown}>
          {Math.max(1, Math.ceil(countdownMs / 1000))}
        </div>
      )}

      {online &&
        (phase === "racing" || phase === "finished") &&
        mode === "circuit" &&
        me && (
          <div style={styles.race}>
            <div style={{ fontSize: 26 }}>
              {position}º
              <span style={{ opacity: 0.7 }}>/{standings.length}</span>
            </div>
            <div style={{ fontSize: 18 }}>
              Volta {Math.min(me.lap, totalLaps)}/{totalLaps}
            </div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>
              ⏱ {fmtClock(raceTimeMs)}
            </div>
            {me.bestLapMs > 0 && (
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                melhor volta {fmtClock(me.bestLapMs)}
              </div>
            )}
          </div>
        )}

      {online &&
        (phase === "racing" || phase === "finished") &&
        mode === "timetrial" &&
        me && (
          <div style={styles.race}>
            <div style={{ fontSize: 16, opacity: 0.85 }}>
              ⏱ Contra o relógio
            </div>
            <div style={{ fontSize: 26, color: "#ffd166" }}>
              {me.bestLapMs > 0 ? fmtLap(me.bestLapMs) : "--:--.--"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>melhor volta</div>
          </div>
        )}

      {online &&
        (phase === "racing" || phase === "finished") &&
        mode === "drift" &&
        me && (
          <div style={styles.race}>
            <div style={{ fontSize: 30, color: "#ffd166" }}>
              {me.driftScore.toLocaleString("pt-BR")} pts
            </div>
            {me.driftCombo > 1 && (
              <div style={{ fontSize: 20, color: "#f15bb5" }}>
                combo ×{me.driftCombo.toFixed(1)}
              </div>
            )}
            <div style={{ fontSize: 14, opacity: 0.85 }}>
              ⏱ {fmtClock(Math.max(0, 120000 - raceTimeMs))}
            </div>
          </div>
        )}
    </div>
  );
}
