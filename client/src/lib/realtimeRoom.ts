import { RealtimeChannel } from '@supabase/supabase-js';
import { customAlphabet } from 'nanoid';
import { supabase } from './supabase';
import { continueToNextDeal, makeInitialState, placeBid, playCard, startDeal } from '../game/engine/engine';
import { chooseBid, chooseBotPlay } from '../game/engine/bots';
import { Difficulty, GameState as FullGameState, PlayOption } from '../game/engine/types';
import { GameState as PublicGameState } from '../game/types';
import { ensureProfile, persistFinishedGame } from './persistence';

const roomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);

// Slow enough that each play's log entry / animation is readable before the
// next one lands, especially with 3 bots at the table.
const BOT_MOVE_DELAY: Record<Difficulty, [number, number]> = {
  low: [1400, 2200],
  medium: [1800, 2800],
  high: [2200, 3400],
};

function randDelay([min, max]: [number, number]) {
  return min + Math.random() * (max - min);
}

// ---------- Session persistence (survives a page refresh in this browser) ----------

const SESSION_KEY = 'seepify:session';

interface PersistedSession {
  roomId: string;
  seat: number;
  isHost: boolean;
  deviceId: string;
  name: string;
}

function saveSession(session: PersistedSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable (private mode etc) - rejoin-on-refresh just won't work
  }
}

function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function hostStateKey(roomId: string) {
  return `seepify:hostState:${roomId}`;
}

function saveHostState(roomId: string, state: FullGameState) {
  try {
    localStorage.setItem(hostStateKey(roomId), JSON.stringify(state));
  } catch {
    // storage full or unavailable - host refresh just won't be able to resume
  }
}

function loadHostState(roomId: string): FullGameState | null {
  try {
    const raw = localStorage.getItem(hostStateKey(roomId));
    return raw ? (JSON.parse(raw) as FullGameState) : null;
  } catch {
    return null;
  }
}

function clearHostState(roomId: string) {
  try {
    localStorage.removeItem(hostStateKey(roomId));
  } catch {
    // ignore
  }
}

function seatView(state: FullGameState, viewerSeat: number | null): PublicGameState {
  return {
    ...state,
    seats: state.seats.map((s) => ({
      ...s,
      hand: s.index === viewerSeat ? s.hand : s.hand.map(() => null),
      handCount: s.hand.length,
    })),
  } as unknown as PublicGameState;
}

interface ActionMsg {
  requestId: string;
  seat: number;
  kind: 'bid' | 'play' | 'continueDeal' | 'setSeat' | 'start' | 'resync';
  payload?: any;
  deviceId?: string;
}

interface AckMsg {
  requestId: string;
  ok: boolean;
  error?: string;
}

interface JoinMsg {
  requestId: string;
  name: string;
  deviceId: string;
}

interface JoinAck {
  requestId: string;
  ok: boolean;
  error?: string;
  seat?: number;
}

type StateListener = (state: PublicGameState) => void;
type ErrorListener = (message: string) => void;

const DISCONNECT_BOT_FILL_MS = 20000;

export class RoomController {
  roomId: string | null = null;
  isHost = false;
  mySeat: number | null = null;
  deviceId: string | null = null;

  private state: FullGameState | null = null;
  private lobbyChannel: RealtimeChannel | null = null;
  private actionsChannel: RealtimeChannel | null = null;
  private seatChannels: (RealtimeChannel | null)[] = [null, null, null, null];
  private myPrivateChannel: RealtimeChannel | null = null;
  private pendingAcks = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
  private disconnectTimers: (ReturnType<typeof setTimeout> | null)[] = [null, null, null, null];
  private stateListeners = new Set<StateListener>();
  private errorListeners = new Set<ErrorListener>();
  private processedJoinIds = new Set<string>();
  private persistedThisBaazi = false;

  private async persistFinishedBaazi(state: FullGameState) {
    const roomId = this.roomId;
    if (!roomId) return;
    try {
      const seatProfiles = await Promise.all(
        state.seats.map(async (s) => {
          let profileId: string | null = null;
          if (!s.isBot && s.playerId) {
            profileId = await ensureProfile(s.name, s.playerId);
          }
          return {
            profileId,
            seat: s.index,
            teamId: s.teamId,
            isBot: s.isBot,
            botDifficulty: s.isBot ? s.botDifficulty : null,
            name: s.name,
          };
        })
      );
      await persistFinishedGame(roomId, state, seatProfiles);
    } catch (e) {
      console.error('[realtime] persistFinishedBaazi failed', e);
    }
  }

  onState(listener: StateListener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }
  onError(listener: ErrorListener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
  private emitError(msg: string) {
    this.errorListeners.forEach((l) => l(msg));
  }

  private requireSupabase() {
    if (!supabase) {
      throw new Error(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to play online.'
      );
    }
    return supabase;
  }

  private newRequestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // ---------- Host: create room ----------

  async createRoom(name: string, deviceId: string, targetBaaziMargin: number) {
    const sb = this.requireSupabase();
    let id = roomCode();
    this.roomId = id;
    this.isHost = true;
    this.deviceId = deviceId;
    this.mySeat = 0;

    const state = makeInitialState(id, targetBaaziMargin > 0 ? targetBaaziMargin : 100);
    state.seats[0].playerId = deviceId;
    state.seats[0].name = name || 'Host';
    state.seats[0].connected = true;
    this.state = state;

    await this.setupHostChannels(id);
    saveSession({ roomId: id, seat: 0, isHost: true, deviceId, name: state.seats[0].name });
    this.pushStateToAll();
  }

  private subscribeAndWait(channel: RealtimeChannel): Promise<void> {
    return new Promise((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Realtime channel failed to subscribe'));
      });
    });
  }

  private async setupHostChannels(id: string) {
    const sb = this.requireSupabase();

    this.lobbyChannel = sb.channel(`room-${id}-lobby`, { config: { broadcast: { self: false } } });
    this.lobbyChannel.on('broadcast', { event: 'join' }, ({ payload }) => this.handleJoin(payload as JoinMsg));
    await this.subscribeAndWait(this.lobbyChannel);

    this.actionsChannel = sb.channel(`room-${id}-actions`, { config: { broadcast: { self: false }, presence: { key: 'host' } } });
    this.actionsChannel.on('broadcast', { event: 'action' }, ({ payload }) => this.handleAction(payload as ActionMsg));
    this.actionsChannel.on('presence', { event: 'sync' }, () => this.reconcilePresence());
    await this.subscribeAndWait(this.actionsChannel);
    await this.actionsChannel.track({ seat: this.mySeat });

    this.myPrivateChannel = sb.channel(`room-${id}-seat-${this.mySeat}`, { config: { broadcast: { self: false } } });
    await this.subscribeAndWait(this.myPrivateChannel);
  }

  private reconcilePresence() {
    if (!this.isHost || !this.state || !this.actionsChannel) return;
    const presenceState = this.actionsChannel.presenceState<{ seat: number }>();
    const presentSeats = new Set<number>();
    Object.values(presenceState).forEach((entries) => {
      entries.forEach((e: any) => {
        if (typeof e.seat === 'number') presentSeats.add(e.seat);
      });
    });
    this.state.seats.forEach((seat) => {
      if (seat.isBot || !seat.playerId) return;
      const present = presentSeats.has(seat.index);
      if (present) {
        if (this.disconnectTimers[seat.index]) {
          clearTimeout(this.disconnectTimers[seat.index]!);
          this.disconnectTimers[seat.index] = null;
        }
        if (!seat.connected) {
          seat.connected = true;
          this.pushStateToAll();
        }
      } else if (seat.connected) {
        seat.connected = false;
        this.pushStateToAll();
        if (this.state!.phase !== 'lobby' && !this.disconnectTimers[seat.index]) {
          this.disconnectTimers[seat.index] = setTimeout(() => {
            const s = this.state?.seats[seat.index];
            if (!s || s.connected) return;
            s.isBot = true;
            s.botDifficulty = s.botDifficulty ?? 'medium';
            s.name = `Bot (${s.botDifficulty}) – was ${s.name}`;
            this.pushStateToAll();
            this.maybeScheduleBotTurn();
          }, DISCONNECT_BOT_FILL_MS);
        }
      }
    });
  }

  // ---------- Host: handle a join request from a guest ----------

  private handleJoin(msg: JoinMsg) {
    if (!this.isHost || !this.state || !this.lobbyChannel) return;
    if (this.processedJoinIds.has(msg.requestId)) return;
    this.processedJoinIds.add(msg.requestId);

    const reply = (ack: JoinAck) => this.lobbyChannel!.send({ type: 'broadcast', event: 'join-ack', payload: ack });

    if (this.state.phase !== 'lobby') {
      reply({ requestId: msg.requestId, ok: false, error: 'Game already in progress' });
      return;
    }
    const seatIdx = this.state.seats.findIndex((s) => !s.playerId);
    if (seatIdx === -1) {
      reply({ requestId: msg.requestId, ok: false, error: 'Room is full' });
      return;
    }
    const seat = this.state.seats[seatIdx];
    seat.playerId = msg.deviceId;
    seat.name = msg.name || `Player ${seatIdx + 1}`;
    seat.isBot = false;
    seat.connected = true;

    reply({ requestId: msg.requestId, ok: true, seat: seatIdx });
    this.pushStateToAll();
  }

  // ---------- Host: process an action from any seat (including remote guests) ----------

  private ack(seatOrChannel: RealtimeChannel | null, msg: { requestId: string }, ok: boolean, error?: string) {
    if (!this.actionsChannel) return;
    const payload: AckMsg = { requestId: msg.requestId, ok, error };
    this.actionsChannel.send({ type: 'broadcast', event: 'action-ack', payload });
  }

  private handleAction(msg: ActionMsg) {
    if (!this.isHost || !this.state) return;
    if (msg.kind === 'resync') {
      const seatObj = this.state.seats[msg.seat];
      if (!seatObj || seatObj.isBot || seatObj.playerId !== msg.deviceId) {
        this.ack(null, msg, false, 'This seat is no longer yours (it may have been replaced by a bot).');
        return;
      }
      seatObj.connected = true;
      this.ack(null, msg, true);
      this.pushStateToAll();
      return;
    }
    try {
      this.applyAction(msg.seat, msg.kind, msg.payload);
      this.ack(null, msg, true);
    } catch (e: any) {
      this.ack(null, msg, false, e.message);
    }
  }

  private applyAction(seat: number, kind: ActionMsg['kind'], payload: any) {
    if (!this.state) throw new Error('No active game');
    switch (kind) {
      case 'bid':
        placeBid(this.state, seat, payload.value);
        break;
      case 'play':
        playCard(this.state, seat, payload.cardId, payload.option as PlayOption);
        break;
      case 'continueDeal':
        this.persistedThisBaazi = false;
        continueToNextDeal(this.state);
        break;
      case 'setSeat': {
        const target = this.state.seats[payload.seat];
        if (!target) throw new Error('Invalid seat');
        target.isBot = payload.isBot;
        target.botDifficulty = payload.difficulty ?? target.botDifficulty ?? 'medium';
        target.playerId = payload.isBot ? `bot:${payload.seat}:${Date.now()}` : null;
        target.connected = payload.isBot;
        target.name = payload.isBot ? `Bot (${target.botDifficulty})` : `Seat ${payload.seat + 1}`;
        break;
      }
      case 'start': {
        this.persistedThisBaazi = false;
        this.state.seats.forEach((s) => {
          if (!s.playerId) {
            s.isBot = true;
            s.botDifficulty = 'medium';
            s.playerId = `bot:${s.index}:${Date.now()}`;
            s.connected = true;
            s.name = 'Bot (medium)';
          }
        });
        startDeal(this.state);
        break;
      }
    }
    if (kind === 'play' && this.state.phase === 'baazi_won' && !this.persistedThisBaazi) {
      this.persistedThisBaazi = true;
      this.persistFinishedBaazi(this.state);
    }
    this.pushStateToAll();
    if (kind === 'play' || kind === 'bid' || kind === 'start') {
      this.maybeScheduleBotTurn();
      this.maybeScheduleDealEnd();
    }
  }

  private maybeScheduleDealEnd() {
    if (!this.state) return;
    if (this.state.phase !== 'deal_scoring') return;
    setTimeout(() => {
      if (!this.state || this.state.phase !== 'deal_scoring') return;
      continueToNextDeal(this.state);
      this.pushStateToAll();
      this.maybeScheduleBotTurn();
    }, 4000);
  }

  private maybeScheduleBotTurn() {
    const state = this.state;
    if (!state) return;
    if (state.phase !== 'playing' && state.phase !== 'bidder_first_action' && state.phase !== 'awaiting_bid') return;
    const seatIdx = state.phase === 'awaiting_bid' ? state.bidderSeat : state.turnSeat;
    if (seatIdx === null || seatIdx === undefined) return;
    const seat = state.seats[seatIdx];
    if (!seat.isBot) return;

    const delay = randDelay(BOT_MOVE_DELAY[seat.botDifficulty]);
    setTimeout(() => {
      if (!this.state || this.state !== state) return;
      this.runBotTurn(seatIdx);
    }, delay);
  }

  private runBotTurn(seatIdx: number) {
    const state = this.state;
    if (!state) return;
    const seat = state.seats[seatIdx];
    if (!seat.isBot) return;

    if (state.phase === 'awaiting_bid' && state.bidderSeat === seatIdx) {
      const value = chooseBid(state, seatIdx, seat.botDifficulty);
      placeBid(state, seatIdx, value);
      this.pushStateToAll();
      this.maybeScheduleBotTurn();
      return;
    }
    if ((state.phase === 'playing' || state.phase === 'bidder_first_action') && state.turnSeat === seatIdx) {
      const { cardId, option } = chooseBotPlay(state, seatIdx, seat.botDifficulty);
      playCard(state, seatIdx, cardId, option);
      this.pushStateToAll();
      const phaseAfter = state.phase as FullGameState['phase'];
      if ((phaseAfter as string) === 'deal_scoring' || (phaseAfter as string) === 'baazi_won') {
        this.maybeScheduleDealEnd();
      } else {
        this.maybeScheduleBotTurn();
      }
    }
  }

  private pushStateToAll() {
    if (!this.state) return;
    if (this.isHost && this.roomId) saveHostState(this.roomId, this.state);
    this.state.seats.forEach((seat) => {
      if (!seat.playerId || seat.isBot) return;
      const view = seatView(this.state!, seat.index);
      if (seat.index === this.mySeat) {
        this.emitState(view);
      } else {
        sendToSeatChannel(this.roomId!, seat.index, view);
      }
    });
  }

  private emitState(view: PublicGameState) {
    this.stateListeners.forEach((l) => l(view));
  }

  // ---------- Guest: join an existing room ----------

  async joinRoom(roomId: string, name: string, deviceId: string) {
    const sb = this.requireSupabase();
    this.roomId = roomId;
    this.isHost = false;
    this.deviceId = deviceId;

    const requestId = this.newRequestId();
    const lobby = sb.channel(`room-${roomId}-lobby`, { config: { broadcast: { self: false } } });
    // Bindings must be registered before subscribe() - Realtime sends the
    // configured event bindings as part of the subscribe handshake, so a
    // .on() added afterwards can silently miss messages.
    const ackPromise = new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Room not found (host not reachable)')), 6000);
      lobby.on('broadcast', { event: 'join-ack' }, ({ payload }) => {
        const ack = payload as JoinAck;
        if (ack.requestId !== requestId) return;
        clearTimeout(timeout);
        if (!ack.ok) reject(new Error(ack.error || 'Could not join room'));
        else resolve(ack.seat!);
      });
    });
    await this.subscribeAndWait(lobby);
    lobby.send({ type: 'broadcast', event: 'join', payload: { requestId, name, deviceId } satisfies JoinMsg });
    const seat = await ackPromise;

    this.mySeat = seat;
    await lobby.unsubscribe();

    await this.setupGuestChannels(roomId, seat);
    saveSession({ roomId, seat, isHost: false, deviceId, name });
  }

  private async setupGuestChannels(roomId: string, seat: number) {
    const sb = this.requireSupabase();

    this.actionsChannel = sb.channel(`room-${roomId}-actions`, { config: { broadcast: { self: false }, presence: { key: `seat-${seat}` } } });
    this.actionsChannel.on('broadcast', { event: 'action-ack' }, ({ payload }) => this.resolveAck(payload as AckMsg));
    await this.subscribeAndWait(this.actionsChannel);
    await this.actionsChannel.track({ seat });

    this.myPrivateChannel = sb.channel(`room-${roomId}-seat-${seat}`, { config: { broadcast: { self: false } } });
    this.myPrivateChannel.on('broadcast', { event: 'state' }, ({ payload }) => this.emitState(payload as PublicGameState));
    await this.subscribeAndWait(this.myPrivateChannel);
  }

  /** Re-establish a guest's connection after a page refresh, using a previously assigned seat. */
  async rejoinAsGuest(roomId: string, seat: number, deviceId: string, name: string) {
    this.roomId = roomId;
    this.isHost = false;
    this.deviceId = deviceId;
    this.mySeat = seat;

    await this.setupGuestChannels(roomId, seat);
    await this.sendAction('resync');
    saveSession({ roomId, seat, isHost: false, deviceId, name });
  }

  /** Re-establish hosting after the host's own tab refreshed, from the locally persisted snapshot. */
  async resumeHost(roomId: string, deviceId: string) {
    const state = loadHostState(roomId);
    if (!state) throw new Error('No saved game found for this room in this browser.');

    this.roomId = roomId;
    this.isHost = true;
    this.deviceId = deviceId;
    this.mySeat = 0;
    this.state = state;

    await this.setupHostChannels(roomId);
    saveSession({ roomId, seat: 0, isHost: true, deviceId, name: state.seats[0].name });
    this.pushStateToAll();
    this.maybeScheduleBotTurn();
    this.maybeScheduleDealEnd();
  }

  /** Called once on app start: silently resumes a previous session if one was saved, else does nothing. */
  async tryResume(): Promise<boolean> {
    const session = loadSession();
    if (!session) return false;
    const urlRoom = new URLSearchParams(window.location.search).get('room');
    if (urlRoom && urlRoom.toUpperCase() !== session.roomId.toUpperCase()) {
      // The link points at a different room than the one saved in this browser - don't
      // silently resume the old one, let the user join the room they actually opened.
      return false;
    }
    try {
      if (session.isHost) {
        await this.resumeHost(session.roomId, session.deviceId);
      } else {
        await this.rejoinAsGuest(session.roomId, session.seat, session.deviceId, session.name);
      }
      return true;
    } catch (e) {
      console.warn('[realtime] could not resume session', e);
      clearSession();
      if (session.isHost) clearHostState(session.roomId);
      return false;
    }
  }

  private resolveAck(ack: AckMsg) {
    const p = this.pendingAcks.get(ack.requestId);
    if (!p) return;
    this.pendingAcks.delete(ack.requestId);
    if (ack.ok) p.resolve();
    else p.reject(new Error(ack.error || 'Action failed'));
  }

  private sendAction(kind: ActionMsg['kind'], payload?: any): Promise<void> {
    if (this.mySeat === null) return Promise.reject(new Error('Not seated'));
    if (this.isHost) {
      try {
        this.applyAction(this.mySeat, kind, payload);
        return Promise.resolve();
      } catch (e: any) {
        this.emitError(e.message);
        return Promise.reject(e);
      }
    }
    if (!this.actionsChannel) return Promise.reject(new Error('Not connected'));
    const requestId = this.newRequestId();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(requestId);
        reject(new Error('Timed out waiting for host'));
      }, 8000);
      this.pendingAcks.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timeout);
          this.emitError(e.message);
          reject(e);
        },
      });
      this.actionsChannel!.send({
        type: 'broadcast',
        event: 'action',
        payload: { requestId, seat: this.mySeat!, kind, payload, deviceId: this.deviceId ?? undefined } satisfies ActionMsg,
      });
    });
  }

  // ---------- Public API used by UI ----------

  setSeat(seat: number, isBot: boolean, difficulty?: Difficulty) {
    if (!this.isHost) return;
    this.applyAction(this.mySeat!, 'setSeat', { seat, isBot, difficulty });
  }

  start() {
    if (!this.isHost) return;
    this.applyAction(this.mySeat!, 'start', {});
  }

  bid(value: number) {
    return this.sendAction('bid', { value });
  }

  play(cardId: string, option: PlayOption) {
    return this.sendAction('play', { cardId, option });
  }

  continueDeal() {
    return this.sendAction('continueDeal');
  }

  async leave() {
    if (this.isHost && this.roomId) clearHostState(this.roomId);
    clearSession();
    await this.lobbyChannel?.unsubscribe();
    await this.actionsChannel?.unsubscribe();
    await this.myPrivateChannel?.unsubscribe();
    for (const ch of this.seatChannels) await ch?.unsubscribe();
    this.lobbyChannel = null;
    this.actionsChannel = null;
    this.myPrivateChannel = null;
    this.seatChannels = [null, null, null, null];
    this.state = null;
    this.roomId = null;
    this.mySeat = null;
    this.isHost = false;
  }
}

// Host keeps one outbound channel per seat, reused across pushes, and waits
// for each to confirm SUBSCRIBED before sending (broadcast sends silently
// no-op on a not-yet-subscribed channel).
const outboundCache = new Map<string, Promise<RealtimeChannel>>();
function getOutboundChannel(roomId: string, seat: number): Promise<RealtimeChannel> {
  const key = `room-${roomId}-seat-${seat}`;
  let ready = outboundCache.get(key);
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      if (!supabase) return reject(new Error('Supabase not configured'));
      const ch = supabase.channel(key, { config: { broadcast: { self: false } } });
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve(ch);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Channel failed'));
      });
    });
    outboundCache.set(key, ready);
  }
  return ready;
}

function sendToSeatChannel(roomId: string, seat: number, view: PublicGameState) {
  getOutboundChannel(roomId, seat)
    .then((ch) => ch.send({ type: 'broadcast', event: 'state', payload: view }))
    .catch((e) => console.error('[realtime] failed to push seat state', e));
}
