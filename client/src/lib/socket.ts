import { io, Socket } from 'socket.io-client';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://localhost:8787';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function ack<T = any>(event: string, payload: any): Promise<T> {
  return new Promise((resolve, reject) => {
    getSocket().emit(event, payload, (res: any) => {
      if (res?.ok === false) reject(new Error(res.error || 'Request failed'));
      else resolve(res);
    });
  });
}
