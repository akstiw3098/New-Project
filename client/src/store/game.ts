import { create } from 'zustand';
import { RoomController } from '../lib/realtimeRoom';
import { GameState } from '../game/types';
import { Difficulty, PlayOption } from '../game/engine/types';

const controller = new RoomController();

interface GameStoreState {
  roomId: string | null;
  seat: number | null;
  isHost: boolean;
  state: GameState | null;
  error: string | null;
  busy: boolean;
  setError: (e: string | null) => void;
  createRoom: (name: string, deviceId: string, targetBaaziMargin: number) => Promise<void>;
  joinRoom: (roomId: string, name: string, deviceId: string) => Promise<void>;
  setSeat: (seat: number, isBot: boolean, difficulty?: Difficulty) => void;
  start: () => void;
  bid: (value: number) => Promise<void>;
  play: (cardId: string, option: PlayOption) => Promise<void>;
  continueDeal: () => Promise<void>;
  leave: () => Promise<void>;
}

let boundListeners = false;

export const useGameStore = create<GameStoreState>((set, get) => {
  if (!boundListeners) {
    boundListeners = true;
    controller.onState((state) => set({ state, roomId: controller.roomId, seat: controller.mySeat, isHost: controller.isHost }));
    controller.onError((message) => set({ error: message }));
  }

  return {
    roomId: null,
    seat: null,
    isHost: false,
    state: null,
    error: null,
    busy: false,
    setError: (e) => set({ error: e }),

    createRoom: async (name, deviceId, targetBaaziMargin) => {
      set({ busy: true, error: null });
      try {
        await controller.createRoom(name, deviceId, targetBaaziMargin);
      } catch (e: any) {
        set({ error: e.message });
        throw e;
      } finally {
        set({ busy: false });
      }
    },

    joinRoom: async (roomId, name, deviceId) => {
      set({ busy: true, error: null });
      try {
        await controller.joinRoom(roomId, name, deviceId);
      } catch (e: any) {
        set({ error: e.message });
        throw e;
      } finally {
        set({ busy: false });
      }
    },

    setSeat: (seat, isBot, difficulty) => controller.setSeat(seat, isBot, difficulty),
    start: () => controller.start(),

    bid: async (value) => {
      try {
        await controller.bid(value);
      } catch (e: any) {
        set({ error: e.message });
        throw e;
      }
    },

    play: async (cardId, option) => {
      try {
        await controller.play(cardId, option);
      } catch (e: any) {
        set({ error: e.message });
        throw e;
      }
    },

    continueDeal: async () => {
      try {
        await controller.continueDeal();
      } catch {
        // likely already auto-continued server-side (host-side timer); ignore
      }
    },

    leave: async () => {
      await controller.leave();
      set({ roomId: null, seat: null, isHost: false, state: null });
    },
  };
});
