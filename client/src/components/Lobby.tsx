import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../store/game';
import { Difficulty } from '../game/types';
import RoomQrCode from './RoomQrCode';

const DIFFICULTIES: Difficulty[] = ['low', 'medium', 'high'];

export default function Lobby() {
  const state = useGameStore((s) => s.state!);
  const seat = useGameStore((s) => s.seat!);
  const isHost = useGameStore((s) => s.isHost);
  const setSeatAction = useGameStore((s) => s.setSeat);
  const startAction = useGameStore((s) => s.start);
  const setError = useGameStore((s) => s.setError);
  const error = useGameStore((s) => s.error);
  const leaveAction = useGameStore((s) => s.leave);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${state.roomId}`;

  function setSeatBot(idx: number, isBot: boolean, difficulty?: Difficulty) {
    try {
      setSeatAction(idx, isBot, difficulty);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function handleStart() {
    setError(null);
    try {
      startAction();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const readyCount = state.seats.filter((s) => s.playerId).length;
  const checklist = [
    { label: 'All 4 seats filled (players or bots)', ok: readyCount === 4 },
    { label: 'Teams are fixed: seats 1 & 3 vs seats 2 & 4', ok: true },
    { label: `Baazi target margin set to ${state.targetBaaziMargin}`, ok: true },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="panel" style={{ width: 'min(560px, 100%)', padding: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontFamily: 'Georgia, serif' }} className="gold-text">
            Room {state.roomId}
          </h2>
          <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Team A: seats 1 &amp; 3 &middot; Team B: seats 2 &amp; 4</span>
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0 10px' }}>
          <input type="text" readOnly value={shareUrl} style={{ flex: 1 }} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button className="btn" onClick={() => setShowQr((v) => !v)}>
            {showQr ? 'Hide QR' : 'Show QR'}
          </button>
        </div>

        <AnimatePresence>{showQr && <RoomQrCode url={shareUrl} />}</AnimatePresence>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, marginBottom: 20 }}>
          {state.seats.map((s, idx) => (
            <div
              key={idx}
              className="panel"
              style={{
                padding: 12,
                borderColor: s.teamId === 0 ? 'rgba(212,175,106,0.4)' : 'rgba(120,170,220,0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-dim)' }}>
                <span>Seat {idx + 1}</span>
                <span>{s.teamId === 0 ? 'Team A' : 'Team B'}</span>
              </div>
              <div style={{ fontWeight: 700, marginTop: 4, minHeight: 20 }}>
                {s.playerId ? s.name : <span style={{ color: 'var(--ink-dim)', fontWeight: 400 }}>Empty seat</span>}
                {s.index === seat && <span style={{ color: 'var(--gold)' }}> (you)</span>}
              </div>
              {isHost && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {!s.playerId || s.isBot ? (
                    <>
                      <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setSeatBot(idx, true, 'low')}>
                        Bot: Low
                      </button>
                      <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setSeatBot(idx, true, 'medium')}>
                        Bot: Med
                      </button>
                      <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setSeatBot(idx, true, 'high')}>
                        Bot: High
                      </button>
                      {s.playerId && (
                        <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setSeatBot(idx, false)}>
                          Clear
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--success)' }}>Player connected</span>
                  )}
                </div>
              )}
              {s.isBot && (
                <div style={{ fontSize: 11, marginTop: 6, color: 'var(--gold)' }}>Difficulty: {s.botDifficulty}</div>
              )}
            </div>
          ))}
        </div>

        <div className="panel" style={{ padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--ink-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Prelaunch checklist
          </div>
          {checklist.map((c) => (
            <div key={c.label} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 5 }}>
              <span style={{ color: c.ok ? 'var(--success)' : 'var(--ink-dim)' }}>{c.ok ? '✓' : '○'}</span>
              {c.label}
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--ink-dim)', marginTop: 6 }}>
            Starting will auto-fill any empty seats with medium bots.
          </div>
          {isHost && (
            <div style={{ fontSize: 11.5, color: 'var(--gold)', marginTop: 6 }}>
              You're hosting &mdash; keep this tab open while the game is in progress.
            </div>
          )}
        </div>

        {isHost ? (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleStart}>
            Start game
          </button>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--ink-dim)', fontSize: 13 }}>Waiting for the host to start&hellip;</div>
        )}

        {error && <div style={{ marginTop: 12, color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>{error}</div>}

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            className="btn"
            style={{ fontSize: 12, opacity: 0.7 }}
            onClick={() => leaveAction()}
          >
            Leave room
          </button>
        </div>
      </motion.div>
    </div>
  );
}
