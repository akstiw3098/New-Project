import { create } from 'zustand';
import { getSocket } from '../lib/socket';
import { GameState } from '../game/types';

interface GameStoreState {
  connected: boolean;
  roomId: string | null;
  seat: number | null;
  state: GameState | null;
  error: string | null;
  setError: (e: string | null) => void;
  bindSocket: () => void;
  setRoom: (roomId: string, seat: number, state: GameState) => void;
  leave: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  connected: false,
  roomId: null,
  seat: null,
  state: null,
  error: null,
  setError: (e) => set({ error: e }),
  bindSocket: () => {
    const socket = getSocket();
    socket.off('connect');
    socket.off('disconnect');
    socket.off('room:state');
    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));
    socket.on('room:state', (state: GameState) => set({ state }));
  },
  setRoom: (roomId, seat, state) => set({ roomId, seat, state }),
  leave: () => {
    set({ roomId: null, seat: null, state: null });
  },
}));
