import { useGameStore } from './store/game';
import Home from './components/Home';
import Lobby from './components/Lobby';
import Table from './components/Table';

export default function App() {
  const state = useGameStore((s) => s.state);

  if (!state) return <Home />;
  if (state.phase === 'lobby') return <Lobby />;
  return <Table />;
}
