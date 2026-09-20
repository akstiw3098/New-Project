import { GameState, scoreValue } from '../game/types';

interface Props {
  state: GameState;
  mySeat: number;
}

export default function ScoreBar({ state, mySeat }: Props) {
  const liveScores: [number, number] = [0, 0];
  state.teams.forEach((t) => {
    let pts = t.capturedPiles.reduce((s, c) => s + scoreValue(c), 0);
    pts += t.sweepBonuses.reduce((s, b) => s + b, 0);
    liveScores[t.id] = pts;
  });

  const myTeam = state.seats[mySeat]?.teamId ?? 0;
  const diff = state.baaziScoreDiff;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 18px',
        gap: 16,
        flexWrap: 'wrap',
      }}
      className="panel"
    >
      <div style={{ display: 'flex', gap: 18 }}>
        <TeamScore label="Team A" score={liveScores[0]} highlight={myTeam === 0} />
        <TeamScore label="Team B" score={liveScores[1]} highlight={myTeam === 1} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
        Deal #{state.dealNumber} &middot; Baazi margin {Math.abs(diff)}/{state.targetBaaziMargin}{' '}
        {diff !== 0 && <span className="gold-text">({diff > 0 ? 'Team A' : 'Team B'} leading)</span>}
      </div>
    </div>
  );
}

function TeamScore({ label, score, highlight }: { label: string; score: number; highlight: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
        {label} {highlight && <span className="gold-text">(you)</span>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif' }}>{score}</div>
    </div>
  );
}
