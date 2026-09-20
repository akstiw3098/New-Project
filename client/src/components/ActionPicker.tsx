import { motion } from 'framer-motion';
import { BuildOption, Card, CaptureOption, PlayOption, rankLabel } from '../game/types';

interface Props {
  card: Card;
  captures: CaptureOption[];
  builds: BuildOption[];
  throwAllowed: boolean;
  onChoose: (option: PlayOption) => void;
  onCancel: () => void;
}

function describeCapture(opt: CaptureOption): string {
  return opt.groups
    .map((g) => (g.isHouse ? `${rankLabel(g.cards[0]?.rank ?? 0)}-house (${g.cards.length} cards)` : g.cards.map((c) => rankLabel(c.rank)).join('+')))
    .join('  and  ');
}

function describeBuild(opt: BuildOption): string {
  const consumed = opt.looseCardIds.length ? ` + ${opt.looseCardIds.length} floor card(s)` : '';
  switch (opt.mode) {
    case 'new_house':
      return `Build a new ${rankLabel(opt.targetValue)}-house${consumed}`;
    case 'add_to_house':
      return `Add to the ${rankLabel(opt.targetValue)}-house${consumed}`;
    case 'cement':
      return `Cement the ${rankLabel(opt.targetValue)}-house${consumed}`;
    case 'break_house':
      return `Break a house into a ${rankLabel(opt.targetValue)}-house${consumed}`;
  }
}

export default function ActionPicker({ card, captures, builds, throwAllowed, onChoose, onCancel }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,10,7,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 50,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="panel scrollthin"
        style={{ width: 'min(420px, 100%)', maxHeight: '80vh', overflowY: 'auto', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginBottom: 4 }}>
          Playing {rankLabel(card.rank)} &mdash; choose an action
        </div>
        <h3 style={{ marginTop: 0, marginBottom: 14, fontFamily: 'Georgia, serif' }} className="gold-text">
          What would you like to do?
        </h3>

        {captures.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-dim)', marginBottom: 6 }}>Capture</div>
            {captures.map((c, i) => (
              <button key={i} className="btn" style={{ width: '100%', marginBottom: 6, textAlign: 'left' }} onClick={() => onChoose(c)}>
                Take: {describeCapture(c)}
              </button>
            ))}
          </div>
        )}

        {builds.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-dim)', marginBottom: 6 }}>Build</div>
            {builds.map((b, i) => (
              <button key={i} className="btn" style={{ width: '100%', marginBottom: 6, textAlign: 'left' }} onClick={() => onChoose(b)}>
                {describeBuild(b)}
              </button>
            ))}
          </div>
        )}

        {throwAllowed && (
          <button className="btn" style={{ width: '100%', marginBottom: 6 }} onClick={() => onChoose({ type: 'throw' })}>
            Throw as a loose card
          </button>
        )}

        <button className="btn" style={{ width: '100%', marginTop: 8, opacity: 0.7 }} onClick={onCancel}>
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}
