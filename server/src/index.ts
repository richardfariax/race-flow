import { Server } from 'colyseus';
import cors from 'cors';
import { RaceRoom } from './rooms/RaceRoom';

/**
 * Servidor de jogo (Colyseus). Uma sala por corrida; salas de 'circuit' e
 * 'drift', e classes de carro diferentes, não se misturam (filterBy mode +
 * carClass). Deploy: Render (free tier tem
 * spin-down — 1ª conexão pode levar ~1min; documentado no README).
 */

const port = Number(process.env.PORT ?? 2567);

const server = new Server({
  express: (app) => {
    app.use(cors());
    app.get('/health', (_req, res) => {
      res.json({ ok: true, uptime: process.uptime() });
    });
  },
});

server.define('race', RaceRoom).filterBy(['mode', 'carClass']);

server.listen(port).then(() => {
  console.log(`[race-flow] servidor ouvindo na porta ${port}`);
});
