/** Buffers de snapshots dos carros remotos p/ interpolação (fora do React). */

export interface Snap {
  t: number; // performance.now() da chegada
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export const remoteBuffers = new Map<string, Snap[]>();

export function pushSnap(sessionId: string, snap: Snap): void {
  let buf = remoteBuffers.get(sessionId);
  if (!buf) {
    buf = [];
    remoteBuffers.set(sessionId, buf);
  }
  buf.push(snap);
  // mantém ~1s de histórico
  const cutoff = snap.t - 1000;
  while (buf.length > 2 && buf[0].t < cutoff) buf.shift();
}

export function pruneBuffers(alive: Set<string>): void {
  for (const id of remoteBuffers.keys()) {
    if (!alive.has(id)) remoteBuffers.delete(id);
  }
}
