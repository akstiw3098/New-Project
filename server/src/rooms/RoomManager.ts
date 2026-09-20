import { customAlphabet } from 'nanoid';
import { makeInitialState } from '../game/engine';
import { Difficulty, GameState } from '../game/types';

const roomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);

export interface RoomMeta {
  id: string;
  createdAt: number;
  hostSeat: number;
  state: GameState;
  deviceIds: (string | null)[]; // per seat, for supabase profile linkage
  botAutoFillTimer: NodeJS.Timeout | null;
}

class RoomManager {
  private rooms = new Map<string, RoomMeta>();

  create(): RoomMeta {
    let id = roomCode();
    while (this.rooms.has(id)) id = roomCode();
    const meta: RoomMeta = {
      id,
      createdAt: Date.now(),
      hostSeat: 0,
      state: makeInitialState(id),
      deviceIds: [null, null, null, null],
      botAutoFillTimer: null,
    };
    this.rooms.set(id, meta);
    return meta;
  }

  get(id: string): RoomMeta | undefined {
    return this.rooms.get(id.toUpperCase());
  }

  remove(id: string) {
    const meta = this.rooms.get(id);
    if (meta?.botAutoFillTimer) clearTimeout(meta.botAutoFillTimer);
    this.rooms.delete(id);
  }

  list(): RoomMeta[] {
    return [...this.rooms.values()];
  }

  cleanupStale(maxAgeMs = 1000 * 60 * 60 * 6) {
    const now = Date.now();
    for (const [id, meta] of this.rooms) {
      const allDisconnected = meta.state.seats.every((s) => !s.playerId || !s.connected);
      if (allDisconnected && now - meta.createdAt > maxAgeMs) {
        this.remove(id);
      }
    }
  }
}

export const roomManager = new RoomManager();
export type { Difficulty };
