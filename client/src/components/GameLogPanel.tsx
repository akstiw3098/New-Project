import { motion } from 'framer-motion';

interface Props {
  log: string[];
  onClose: () => void;
}

export default function GameLogPanel({ log, onClose }: Props) {
  const entries = log.slice().reverse();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,10,7,0.55)', zIndex: 65, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        className="panel scrollthin"
        style={{ width: 'min(360px, 92%)', height: '100%', padding: 20, overflowY: 'auto', borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: 'Georgia, serif' }} className="gold-text">
            Game log
          </h3>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        {entries.length === 0 && <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>Nothing has happened yet.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((line, i) => (
            <div
              key={entries.length - i}
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                padding: '8px 10px',
                borderRadius: 8,
                background: i === 0 ? 'rgba(212,175,106,0.12)' : 'rgba(255,255,255,0.03)',
                border: i === 0 ? '1px solid rgba(212,175,106,0.35)' : '1px solid transparent',
                color: i === 0 ? 'var(--ink)' : 'var(--ink-dim)',
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
