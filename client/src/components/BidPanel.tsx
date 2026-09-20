import { motion } from 'framer-motion';
import { rankLabel } from '../game/types';

interface Props {
  values: number[];
  onBid: (v: number) => void;
}

export default function BidPanel({ values, onBid }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel"
      style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: 16, zIndex: 40 }}
    >
      <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginBottom: 8, textAlign: 'center' }}>
        Your turn to bid &mdash; choose the value of the house you'll play for
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {values.map((v) => (
          <button key={v} className="btn btn-primary" onClick={() => onBid(v)}>
            {rankLabel(v)}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
