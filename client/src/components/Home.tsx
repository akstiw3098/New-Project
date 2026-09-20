import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ack, getSocket } from '../lib/socket';
import { useGameStore } from '../store/game';
import { useSettings } from '../store/settings';
import { getDeviceId } from '../lib/supabase';

function roomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

export default function Home() {
  const { name, setName } = useSettings();
  const setRoom = useGameStore((s) => s.setRoom);
  const setError = useGameStore((s) => s.setError);
  const error = useGameStore((s) => s.error);
  const [joinCode, setJoinCode] = useState(roomFromUrl() ?? '');
  const [margin, setMargin] = useState(100);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSocket();
  }, []);

  async function handleCreate() {
    if (!name.trim()) return setError('Enter your name first.');
    setBusy(true);
    setError(null);
    try {
      const res: any = await ack('room:create', { name: name.trim(), deviceId: getDeviceId(), targetBaaziMargin: margin });
      setRoom(res.roomId, res.seat, res.state);
      const url = new URL(window.location.href);
      url.searchParams.set('room', res.roomId);
      window.history.replaceState({}, '', url.toString());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setError('Enter your name first.');
    if (!joinCode.trim()) return setError('Enter a room code.');
    setBusy(true);
    setError(null);
    try {
      const res: any = await ack('room:join', { roomId: joinCode.trim().toUpperCase(), name: name.trim(), deviceId: getDeviceId() });
      setRoom(res.roomId, res.seat, res.state);
      const url = new URL(window.location.href);
      url.searchParams.set('room', res.roomId);
      window.history.replaceState({}, '', url.toString());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="panel"
        style={{ width: 'min(440px, 100%)', padding: 28 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 38, marginBottom: 4 }}>&#9824;&#65039;</div>
          <h1 style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: 30 }} className="gold-text">
            Seep
          </h1>
          <div style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 4 }}>Classy multiplayer Seep &mdash; 100-point Baazi rules</div>
        </div>

        <label style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Your name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Aanya"
          style={{ width: '100%', marginTop: 6, marginBottom: 16 }}
          maxLength={18}
        />

        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Baazi target margin</label>
            <input
              type="number"
              min={20}
              max={300}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              style={{ width: '100%', marginTop: 6 }}
            />
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 14 }} disabled={busy} onClick={handleCreate}>
          Create a room
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: 'var(--ink-dim)', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--panel-border)' }} />
          or join with a code
          <div style={{ flex: 1, height: 1, background: 'var(--panel-border)' }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.12em' }}
            maxLength={6}
          />
          <button className="btn" disabled={busy} onClick={handleJoin}>
            Join
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 14, color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>{error}</div>
        )}

        <div style={{ marginTop: 20, fontSize: 11.5, color: 'var(--ink-dim)', textAlign: 'center', lineHeight: 1.6 }}>
          4 seats, fixed 2v2 partnerships. Empty seats can be filled with bots &mdash; set their difficulty in the lobby.
        </div>
      </motion.div>
    </div>
  );
}
