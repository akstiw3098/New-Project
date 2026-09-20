import { useEffect } from 'react';
import { useGameStore } from './store/game';
import Home from './components/Home';
import Lobby from './components/Lobby';
import Table from './components/Table';

export default function App() {
  const bindSocket = useGameStore((s) => s.bindSocket);
  const state = useGameStore((s) => s.state);

  useEffect(() => {
    bindSocket();
  }, [bindSocket]);

  if (!state) return <Home />;
  if (state.phase === 'lobby') return <Lobby />;
  return <Table />;
}
