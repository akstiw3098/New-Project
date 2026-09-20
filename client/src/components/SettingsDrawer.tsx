import { motion } from 'framer-motion';
import { useSettings, CardSkin, Quality, effectiveQuality } from '../store/settings';
import PlayingCard from './PlayingCard';

const SKINS: { id: CardSkin; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'royal', label: 'Royal gold' },
];

const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Detects your device' },
  { id: 'high', label: 'High quality', hint: 'Smooth animations, richer textures' },
  { id: 'light', label: 'Light', hint: 'Minimal motion, best for low-end devices' },
];

export default function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const { quality, setQuality, cardSkin, setCardSkin, soundOn, setSoundOn } = useSettings();
  const resolvedQuality = effectiveQuality(quality);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,10,7,0.6)', zIndex: 70, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        className="panel scrollthin"
        style={{ width: 'min(340px, 92%)', height: '100%', padding: 22, overflowY: 'auto', borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontFamily: 'Georgia, serif' }} className="gold-text">
            Settings
          </h3>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8, letterSpacing: '0.06em' }}>
          Visual quality
        </div>
        {QUALITIES.map((q) => (
          <label
            key={q.id}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              padding: '8px 10px',
              borderRadius: 10,
              marginBottom: 6,
              cursor: 'pointer',
              background: quality === q.id ? 'rgba(212,175,106,0.14)' : 'transparent',
              border: '1px solid ' + (quality === q.id ? 'var(--gold)' : 'transparent'),
            }}
          >
            <input type="radio" name="quality" checked={quality === q.id} onChange={() => setQuality(q.id)} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {q.label} {q.id === 'auto' && <span style={{ color: 'var(--ink-dim)', fontWeight: 400 }}>(currently {resolvedQuality})</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>{q.hint}</div>
            </div>
          </label>
        ))}

        <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--ink-dim)', margin: '18px 0 8px', letterSpacing: '0.06em' }}>
          Card skin
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {SKINS.map((s) => (
            <button
              key={s.id}
              onClick={() => setCardSkin(s.id)}
              style={{
                background: 'transparent',
                border: '1px solid ' + (cardSkin === s.id ? 'var(--gold)' : 'var(--panel-border)'),
                borderRadius: 12,
                padding: 8,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <PlayingCard card={{ id: 'preview', suit: 'S', rank: 12 }} skin={s.id} highQuality width={50} />
              <span style={{ fontSize: 11 }}>{s.label}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13 }}>Sound effects</div>
          <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
        </div>

        <div style={{ marginTop: 22, fontSize: 11.5, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
          Auto quality checks your device's memory, CPU cores, screen size and reduced-motion preference to pick
          smooth animations only where your device can handle them.
        </div>
      </motion.div>
    </motion.div>
  );
}
