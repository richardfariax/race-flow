import { useHudStore } from '../state/hudStore';

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    color: '#fff',
    userSelect: 'none',
  },
  logo: {
    position: 'absolute',
    top: 16,
    left: 20,
    fontSize: 22,
    fontWeight: 900,
    fontStyle: 'italic',
    letterSpacing: 1,
    textShadow: '2px 2px 0 #1a1a2e',
    color: '#ffd166',
  },
  speed: {
    position: 'absolute',
    bottom: 24,
    right: 28,
    textAlign: 'right',
    textShadow: '2px 2px 0 #1a1a2e',
  },
  speedValue: { fontSize: 56, fontWeight: 900, lineHeight: 1 },
  speedUnit: { fontSize: 16, fontWeight: 700, opacity: 0.85 },
  help: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    fontSize: 13,
    lineHeight: 1.7,
    background: 'rgba(26,26,46,0.65)',
    padding: '10px 14px',
    borderRadius: 10,
  },
};

export function HUD() {
  const speed = useHudStore((s) => s.speedKmh);
  return (
    <div style={styles.root}>
      <div style={styles.logo}>RACE FLOW</div>
      <div style={styles.speed}>
        <div style={styles.speedValue}>{speed}</div>
        <div style={styles.speedUnit}>km/h</div>
      </div>
      <div style={styles.help}>
        <b>WASD / setas</b> dirigir · <b>Espaço</b> freio de mão · <b>R</b> reposicionar
      </div>
    </div>
  );
}
