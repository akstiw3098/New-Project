import { Server, Socket } from 'socket.io';
import { roomManager, RoomMeta } from '../rooms/RoomManager';
import {
  continueToNextDeal,
  legalCardIds,
  makeInitialState,
  optionsForCard,
  placeBid,
  playCard,
  startDeal,
  validBidValues,
} from '../game/engine';
import { chooseBid, chooseBotPlay } from '../game/bots';
import { Difficulty, GameState, PlayOption, Seat } from '../game/types';
import { ensureProfile, fetchProfileSummary, persistFinishedGame } from '../supabase';

interface SocketData {
  roomId?: string;
  seat?: number;
  deviceId?: string;
  name?: string;
}

const BOT_MOVE_DELAY: Record<Difficulty, [number, number]> = {
  low: [400, 900],
  medium: [600, 1300],
  high: [800, 1800],
};

function randDelay([min, max]: [number, number]) {
  return min + Math.random() * (max - min);
}

/** Strip other players' hands down to counts so nobody can see opponents' cards. */
function publicView(state: GameState, viewerSeat: number | null) {
  return {
    ...state,
    seats: state.seats.map((s: Seat) => ({
      ...s,
      hand: s.index === viewerSeat ? s.hand : s.hand.map(() => null),
      handCount: s.hand.length,
    })),
  };
}

function broadcastRoom(io: Server, meta: RoomMeta) {
  for (const s of meta.state.seats) {
    if (s.playerId) {
      io.to(s.playerId).emit('room:state', publicView(meta.state, s.index));
    }
  }
  // spectators / anyone in room without seat get bidder-seat-less view (seat -1 -> all hidden)
  io.to(`room:${meta.state.roomId}:spectate`).emit('room:state', publicView(meta.state, null));
}

async function maybeFinishGame(io: Server, meta: RoomMeta) {
  if (meta.state.phase !== 'baazi_won') return;
  const seatProfiles = meta.state.seats.map((s, i) => ({
    profileId: null as string | null,
    seat: i,
    teamId: s.teamId,
    isBot: s.isBot,
    botDifficulty: s.isBot ? s.botDifficulty : null,
    name: s.name,
  }));
  // resolve profile ids for human seats (best-effort, non-blocking correctness)
  await Promise.all(
    meta.state.seats.map(async (s, i) => {
      const deviceId = meta.deviceIds[i];
      if (deviceId && !s.isBot) {
        const id = await ensureProfile(s.name, deviceId);
        seatProfiles[i].profileId = id;
      }
    })
  );
  await persistFinishedGame(meta.state.roomId, meta.state, seatProfiles);
}

function scheduleBotTurnIfNeeded(io: Server, meta: RoomMeta) {
  const state = meta.state;
  if (state.phase !== 'playing' && state.phase !== 'bidder_first_action' && state.phase !== 'awaiting_bid') return;
  const seatIdx = state.phase === 'awaiting_bid' ? state.bidderSeat : state.turnSeat;
  if (seatIdx === null || seatIdx === undefined) return;
  const seat = state.seats[seatIdx];
  if (!seat.isBot) return;

  const delay = randDelay(BOT_MOVE_DELAY[seat.botDifficulty]);
  setTimeout(() => {
    try {
      runBotTurn(io, meta, seatIdx);
    } catch (e) {
      console.error('[bot] error', e);
    }
  }, delay);
}

function runBotTurn(io: Server, meta: RoomMeta, seatIdx: number) {
  const state = meta.state;
  const seat = state.seats[seatIdx];
  if (!seat.isBot) return;

  if (state.phase === 'awaiting_bid' && state.bidderSeat === seatIdx) {
    const value = chooseBid(state, seatIdx, seat.botDifficulty);
    placeBid(state, seatIdx, value);
    broadcastRoom(io, meta);
    scheduleBotTurnIfNeeded(io, meta);
    return;
  }

  if ((state.phase === 'playing' || state.phase === 'bidder_first_action') && state.turnSeat === seatIdx) {
    const { cardId, option } = chooseBotPlay(state, seatIdx, seat.botDifficulty);
    playCard(state, seatIdx, cardId, option);
    broadcastRoom(io, meta);
    const phaseAfter = state.phase as GameState['phase'];
    if ((phaseAfter as string) === 'deal_scoring' || (phaseAfter as string) === 'baazi_won') {
      handleDealEnd(io, meta);
    } else {
      scheduleBotTurnIfNeeded(io, meta);
    }
  }
}

function handleDealEnd(io: Server, meta: RoomMeta) {
  if (meta.state.phase === 'baazi_won') {
    maybeFinishGame(io, meta).finally(() => broadcastRoom(io, meta));
    return;
  }
  // auto-continue to next deal after a short pause so players can see the scoring
  setTimeout(() => {
    if (!roomManager.get(meta.id)) return;
    if (meta.state.phase !== 'deal_scoring') return;
    continueToNextDeal(meta.state);
    broadcastRoom(io, meta);
    scheduleBotTurnIfNeeded(io, meta);
  }, 4000);
}

function findOpenSeat(meta: RoomMeta): number | null {
  const idx = meta.state.seats.findIndex((s) => !s.playerId);
  return idx === -1 ? null : idx;
}

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    const data: SocketData = {};

    socket.on('room:create', async (payload: { name: string; deviceId: string; targetBaaziMargin?: number }, ack) => {
      const meta = roomManager.create();
      if (payload.targetBaaziMargin && payload.targetBaaziMargin > 0) {
        meta.state.targetBaaziMargin = payload.targetBaaziMargin;
      }
      const seat = 0;
      meta.state.seats[seat].playerId = socket.id;
      meta.state.seats[seat].name = payload.name || 'Host';
      meta.state.seats[seat].connected = true;
      meta.deviceIds[seat] = payload.deviceId ?? null;
      meta.hostSeat = seat;

      data.roomId = meta.id;
      data.seat = seat;
      data.deviceId = payload.deviceId;
      data.name = payload.name;
      socket.join(meta.id);

      ack?.({ ok: true, roomId: meta.id, seat, state: publicView(meta.state, seat) });
      broadcastRoom(io, meta);
    });

    socket.on('room:join', (payload: { roomId: string; name: string; deviceId: string }, ack) => {
      const meta = roomManager.get(payload.roomId);
      if (!meta) return ack?.({ ok: false, error: 'Room not found' });
      if (meta.state.phase !== 'lobby') return ack?.({ ok: false, error: 'Game already in progress' });
      const seat = findOpenSeat(meta);
      if (seat === null) return ack?.({ ok: false, error: 'Room is full' });

      meta.state.seats[seat].playerId = socket.id;
      meta.state.seats[seat].name = payload.name || `Player ${seat + 1}`;
      meta.state.seats[seat].isBot = false;
      meta.state.seats[seat].connected = true;
      meta.deviceIds[seat] = payload.deviceId ?? null;

      data.roomId = meta.id;
      data.seat = seat;
      data.deviceId = payload.deviceId;
      data.name = payload.name;
      socket.join(meta.id);

      ack?.({ ok: true, roomId: meta.id, seat, state: publicView(meta.state, seat) });
      broadcastRoom(io, meta);
    });

    socket.on('room:spectate', (payload: { roomId: string }, ack) => {
      const meta = roomManager.get(payload.roomId);
      if (!meta) return ack?.({ ok: false, error: 'Room not found' });
      data.roomId = meta.id;
      socket.join(meta.id);
      socket.join(`room:${meta.id}:spectate`);
      ack?.({ ok: true, roomId: meta.id, state: publicView(meta.state, null) });
    });

    socket.on('room:setSeat', (payload: { seat: number; isBot: boolean; difficulty?: Difficulty; name?: string }, ack) => {
      const meta = data.roomId ? roomManager.get(data.roomId) : undefined;
      if (!meta) return ack?.({ ok: false, error: 'No room' });
      if (meta.state.phase !== 'lobby') return ack?.({ ok: false, error: 'Game already started' });
      if (data.seat !== meta.hostSeat) return ack?.({ ok: false, error: 'Only host can edit seats' });
      const target = meta.state.seats[payload.seat];
      if (!target) return ack?.({ ok: false, error: 'Invalid seat' });
      if (target.playerId && target.playerId !== socket.id && !target.isBot) {
        return ack?.({ ok: false, error: 'Seat occupied by another player' });
      }
      target.isBot = payload.isBot;
      target.botDifficulty = payload.difficulty ?? target.botDifficulty ?? 'medium';
      target.playerId = payload.isBot ? `bot:${payload.seat}:${Date.now()}` : null;
      target.connected = payload.isBot;
      target.name = payload.isBot ? `Bot (${target.botDifficulty})` : `Seat ${payload.seat + 1}`;
      ack?.({ ok: true });
      broadcastRoom(io, meta);
    });

    socket.on('room:setConfig', (payload: { targetBaaziMargin?: number }, ack) => {
      const meta = data.roomId ? roomManager.get(data.roomId) : undefined;
      if (!meta) return ack?.({ ok: false, error: 'No room' });
      if (data.seat !== meta.hostSeat) return ack?.({ ok: false, error: 'Only host can edit config' });
      if (payload.targetBaaziMargin && payload.targetBaaziMargin > 0) {
        meta.state.targetBaaziMargin = payload.targetBaaziMargin;
      }
      ack?.({ ok: true });
      broadcastRoom(io, meta);
    });

    socket.on('room:start', (_payload: unknown, ack) => {
      const meta = data.roomId ? roomManager.get(data.roomId) : undefined;
      if (!meta) return ack?.({ ok: false, error: 'No room' });
      if (data.seat !== meta.hostSeat) return ack?.({ ok: false, error: 'Only host can start' });
      // auto-fill any remaining empty seats with medium bots
      meta.state.seats.forEach((s) => {
        if (!s.playerId) {
          s.isBot = true;
          s.botDifficulty = 'medium';
          s.playerId = `bot:${s.index}:${Date.now()}`;
          s.connected = true;
          s.name = `Bot (medium)`;
        }
      });
      startDeal(meta.state);
      ack?.({ ok: true });
      broadcastRoom(io, meta);
      scheduleBotTurnIfNeeded(io, meta);
    });

    socket.on('game:validBids', (_payload: unknown, ack) => {
      const meta = data.roomId ? roomManager.get(data.roomId) : undefined;
      if (!meta) return ack?.({ ok: false, error: 'No room' });
      ack?.({ ok: true, values: validBidValues(meta.state) });
    });

    socket.on('game:bid', (payload: { value: number }, ack) => {
      const meta = data.roomId ? roomManager.get(data.roomId) : undefined;
      if (!meta || data.seat === undefined) return ack?.({ ok: false, error: 'No room' });
      try {
        placeBid(meta.state, data.seat, payload.value);
        ack?.({ ok: true });
        broadcastRoom(io, meta);
        scheduleBotTurnIfNeeded(io, meta);
      } catch (e: any) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('game:optionsForCard', (payload: { cardId: string }, ack) => {
      const meta = data.roomId ? roomManager.get(data.roomId) : undefined;
      if (!meta || data.seat === undefined) return ack?.({ ok: false, error: 'No room' });
      try {
        const options = optionsForCard(meta.state, data.seat, payload.cardId);
        ack?.({ ok: true, options });
      } catch (e: any) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('game:play', (payload: { cardId: string; option: PlayOption }, ack) => {
      const meta = data.roomId ? roomManager.get(data.roomId) : undefined;
      if (!meta || data.seat === undefined) return ack?.({ ok: false, error: 'No room' });
      try {
        playCard(meta.state, data.seat, payload.cardId, payload.option);
        ack?.({ ok: true });
        broadcastRoom(io, meta);
        if (meta.state.phase === 'deal_scoring' || meta.state.phase === 'baazi_won') {
          handleDealEnd(io, meta);
        } else {
          scheduleBotTurnIfNeeded(io, meta);
        }
      } catch (e: any) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('game:continueDeal', (_payload: unknown, ack) => {
      const meta = data.roomId ? roomManager.get(data.roomId) : undefined;
      if (!meta) return ack?.({ ok: false, error: 'No room' });
      try {
        continueToNextDeal(meta.state);
        ack?.({ ok: true });
        broadcastRoom(io, meta);
        scheduleBotTurnIfNeeded(io, meta);
      } catch (e: any) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('profile:summary', async (payload: { deviceId: string }, ack) => {
      try {
        const summary = await fetchProfileSummary(payload.deviceId);
        ack?.({ ok: true, summary });
      } catch (e: any) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('disconnect', () => {
      const meta = data.roomId ? roomManager.get(data.roomId) : undefined;
      if (!meta || data.seat === undefined) return;
      const seat = meta.state.seats[data.seat];
      if (!seat || seat.playerId !== socket.id) return;
      seat.connected = false;

      if (meta.state.phase === 'lobby') {
        seat.playerId = null;
        seat.name = `Seat ${data.seat + 1}`;
      } else {
        // mid-game: convert to a medium bot after a grace period so the game can continue
        meta.botAutoFillTimer = setTimeout(() => {
          if (seat.connected) return;
          seat.isBot = true;
          seat.botDifficulty = seat.botDifficulty ?? 'medium';
          seat.name = `Bot (${seat.botDifficulty}) - was ${data.name ?? 'Player'}`;
          broadcastRoom(io, meta);
          scheduleBotTurnIfNeeded(io, meta);
        }, 20000);
      }
      broadcastRoom(io, meta);
    });
  });
}
