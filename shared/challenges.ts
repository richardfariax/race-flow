/**
 * Desafios diários — as MESMAS condições existem no SQL (claim_daily), que é
 * o autoritativo: o cliente só exibe progresso; o resgate é validado no banco
 * consultando race_results do dia.
 */

export interface DailyChallenge {
  id: number;
  title: string;
  desc: string;
  reward: number;
  progress: (rows: { mode: string; position: number; metric: number }[]) => number;
  goal: number;
}

export const DAILY_CHALLENGES: DailyChallenge[] = [
  {
    id: 0,
    title: 'Vencedor do dia',
    desc: 'Vença 1 corrida (Circuit) hoje',
    reward: 150,
    goal: 1,
    progress: (rows) => rows.filter((r) => r.mode === 'circuit' && r.position === 1).length,
  },
  {
    id: 1,
    title: 'Rei da derrapagem',
    desc: 'Acumule 8.000 pontos de drift hoje',
    reward: 150,
    goal: 8000,
    progress: (rows) =>
      rows.filter((r) => r.mode === 'drift').reduce((s, r) => s + Number(r.metric), 0),
  },
  {
    id: 2,
    title: 'Rodagem',
    desc: 'Complete 3 corridas (qualquer modo) hoje',
    reward: 100,
    goal: 3,
    progress: (rows) => rows.length,
  },
];
