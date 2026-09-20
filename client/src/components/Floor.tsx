import { AnimatePresence, motion } from 'framer-motion';
import PlayingCard from './PlayingCard';
import { Floor as FloorT, House, rankLabel } from '../game/types';
import { CardSkin } from '../store/settings';

interface Props {
  floor: FloorT;
  skin: CardSkin;
  highQuality: boolean;
  selectable?: { housesById: Set<string>; loose: boolean } | null;
  onSelectHouse?: (house: House) => void;
}

export default function Floor({ floor, skin, highQuality, selectable, onSelectHouse }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        justifyContent: 'center',
        alignItems: 'flex-end',
        minHeight: 120,
        padding: '10px 6px',
      }}
    >
      <AnimatePresence>
        {floor.houses.map((house) => (
          <motion.div
            key={house.id}
            layout
            initial={highQuality ? { opacity: 0, scale: 0.8, y: -10 } : false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={highQuality ? { opacity: 0, scale: 0.7, y: 14 } : { opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            onClick={() => selectable?.housesById.has(house.id) && onSelectHouse?.(house)}
            style={{
              position: 'relative',
              width: 64,
              height: 90 + Math.min(house.cards.length - 1, 5) * 8,
              cursor: selectable?.housesById.has(house.id) ? 'pointer' : 'default',
              boxShadow: selectable?.housesById.has(house.id) ? '0 0 0 3px var(--gold-bright)' : 'none',
              borderRadius: 10,
            }}
          >
            {house.cards.map((c, i) => (
              <div key={c.id} style={{ position: 'absolute', top: i * 8, left: 0 }}>
                <PlayingCard card={c} skin={skin} highQuality={highQuality} width={64} />
              </div>
            ))}
            <div
              style={{
                position: 'absolute',
                bottom: -20,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontSize: 11,
                color: house.cemented ? 'var(--gold-bright)' : 'var(--ink-dim)',
                fontWeight: 700,
              }}
            >
              {rankLabel(house.value)}-house{house.cemented ? ' • cemented' : ''}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {floor.loose.map((c) => (
          <motion.div
            key={c.id}
            layout
            initial={highQuality ? { opacity: 0, scale: 0.8, y: -10 } : false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={highQuality ? { opacity: 0, scale: 0.7, y: 14 } : { opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <PlayingCard card={c} skin={skin} highQuality={highQuality} width={64} />
          </motion.div>
        ))}
      </AnimatePresence>

      {floor.loose.length === 0 && floor.houses.length === 0 && (
        <div style={{ color: 'var(--ink-dim)', fontSize: 13, fontStyle: 'italic', padding: '30px 0' }}>Floor is clear</div>
      )}
    </div>
  );
}
