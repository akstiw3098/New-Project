import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socket/handlers';
import { roomManager } from './rooms/RoomManager';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: roomManager.list().length }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN, methods: ['GET', 'POST'] },
});

registerSocketHandlers(io);

setInterval(() => roomManager.cleanupStale(), 1000 * 60 * 30);

server.listen(PORT, () => {
  console.log(`Seep server listening on :${PORT}`);
});
