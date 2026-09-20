import { useEffect } from 'react';
import { useGameStore } from './store/game';
import Home from './components/Home';
import Lobby from './components/Lobby';
import Table from './components/Table';

export default function App() {
  const state = useGameStore((s) => s.state);
  const resuming = useGameStore((s) => s.resuming);
  const resumeSession = useGameStore((s) => s.resumeSession);

  useEffect(() => {
    resumeSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (resuming) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--ink-dim)', fontSize: 13 }}>
        Reconnecting&hellip;
      </div>
    );
  }

  if (!state) return <Home />;
  if (state.phase === 'lobby') return <Lobby />;
  return <Table />;
}
